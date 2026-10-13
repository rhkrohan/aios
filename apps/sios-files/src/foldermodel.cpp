#include "foldermodel.h"

#include <KCoreDirLister>
#include <KFileItem>
#include <KFormat>

#include <QCollator>
#include <QDateTime>
#include <QDir>
#include <QDirIterator>
#include <QFileInfo>
#include <QHash>
#include <QLocale>
#include <QStandardPaths>

#include <sys/xattr.h>

#include <algorithm>

namespace
{
const QHash<QString, QString> &kinds()
{
    static const QHash<QString, QString> map = [] {
        QHash<QString, QString> m;
        auto add = [&m](const QString &kind, std::initializer_list<const char *> exts) {
            for (const char *e : exts)
                m.insert(QString::fromLatin1(e), kind);
        };
        add(QStringLiteral("pdf"), {"pdf"});
        add(QStringLiteral("doc"), {"doc", "docx", "odt", "rtf", "pages"});
        add(QStringLiteral("sheet"), {"xls", "xlsx", "ods", "csv", "numbers"});
        add(QStringLiteral("slides"), {"ppt", "pptx", "odp", "key"});
        add(QStringLiteral("image"), {"png", "jpg", "jpeg", "gif", "webp", "heic", "svg", "avif", "bmp", "tif", "tiff"});
        add(QStringLiteral("archive"), {"zip", "tar", "gz", "xz", "zst", "7z", "rar", "bz2"});
        add(QStringLiteral("installer"), {"rpm", "flatpakref", "flatpak", "appimage", "dmg", "exe", "msi", "deb"});
        add(QStringLiteral("code"), {"js", "ts", "tsx", "jsx", "py", "rs", "c", "h", "cpp", "hpp", "go", "java", "sh", "json", "toml",
                                     "yaml", "yml", "html", "css", "qml", "rb", "php", "swift", "kt"});
        add(QStringLiteral("audio"), {"mp3", "wav", "flac", "ogg", "m4a", "opus", "aac"});
        add(QStringLiteral("video"), {"mp4", "mov", "mkv", "webm", "avi", "m4v"});
        return m;
    }();
    return map;
}

// "2m ago", "Yesterday", "Oct 3": short, like the preview
QString when(const QDateTime &t)
{
    if (!t.isValid())
        return {};
    const qint64 secs = t.secsTo(QDateTime::currentDateTime());
    if (secs < 60)
        return QStringLiteral("Just now");
    if (secs < 3600)
        return QStringLiteral("%1m ago").arg(secs / 60);
    if (t.date() == QDate::currentDate())
        return QStringLiteral("%1h ago").arg(secs / 3600);
    if (t.date() == QDate::currentDate().addDays(-1))
        return QStringLiteral("Yesterday");
    if (t.date().year() == QDate::currentDate().year())
        return QLocale().toString(t.date(), QStringLiteral("MMM d"));
    return QLocale().toString(t.date(), QStringLiteral("MMM d, yyyy"));
}

QString groupFor(const QDateTime &t)
{
    const QDate d = t.date();
    const QDate today = QDate::currentDate();
    if (d == today)
        return QStringLiteral("Today");
    if (d == today.addDays(-1))
        return QStringLiteral("Yesterday");
    if (d > today.addDays(-7))
        return QStringLiteral("This week");
    return QStringLiteral("Earlier");
}
} // namespace

FolderModel::FolderModel(QObject *parent)
    : QObject(parent)
    , m_lister(new KCoreDirLister(this))
{
    m_lister->setAutoUpdate(true);
    m_lister->setDelayedMimeTypes(false);
    m_debounce.setSingleShot(true);
    m_debounce.setInterval(40);
    connect(&m_debounce, &QTimer::timeout, this, &FolderModel::rebuild);
    auto changed = [this] { m_debounce.start(); };
    connect(m_lister, &KCoreDirLister::itemsAdded, this, changed);
    connect(m_lister, &KCoreDirLister::itemsDeleted, this, changed);
    connect(m_lister, &KCoreDirLister::refreshItems, this, changed);
    connect(m_lister, &KCoreDirLister::clear, this, changed);
    connect(m_lister, qOverload<>(&KCoreDirLister::completed), this, [this] {
        m_loading = false;
        Q_EMIT loadingChanged();
        m_debounce.start();
    });
    connect(m_lister, &KCoreDirLister::started, this, [this] {
        m_loading = true;
        Q_EMIT loadingChanged();
    });
}

void FolderModel::setLocation(const QString &location)
{
    if (location != m_location)
        go(location);
}

void FolderModel::go(const QString &location)
{
    if (location.isEmpty() || location == m_location)
        return;
    // drop the forward history, like a browser
    while (m_history.size() > m_index + 1)
        m_history.removeLast();
    m_history.append(location);
    m_index = m_history.size() - 1;
    m_location = location;
    m_filter.clear();
    Q_EMIT filterChanged();
    Q_EMIT historyChanged();
    Q_EMIT locationChanged();
    open();
}

void FolderModel::back()
{
    if (!canGoBack())
        return;
    m_location = m_history.at(--m_index);
    Q_EMIT historyChanged();
    Q_EMIT locationChanged();
    open();
}

void FolderModel::forward()
{
    if (!canGoForward())
        return;
    m_location = m_history.at(++m_index);
    Q_EMIT historyChanged();
    Q_EMIT locationChanged();
    open();
}

void FolderModel::reload()
{
    open();
}

void FolderModel::open()
{
    if (m_location == QLatin1String("web:")) {
        m_lister->stop();
        scanWeb();
        rebuild();
        return;
    }
    m_lister->openUrl(QUrl::fromUserInput(m_location, QDir::homePath(), QUrl::AssumeLocalFile), KCoreDirLister::Reload);
}

QString FolderModel::title() const
{
    if (m_location == QLatin1String("web:"))
        return QStringLiteral("From the web");
    if (m_location.startsWith(QLatin1String("recentlyused:")))
        return QStringLiteral("Recent");
    if (isTrash())
        return QStringLiteral("Trash");
    const QUrl url = QUrl::fromUserInput(m_location);
    if (url.isLocalFile() && QDir(url.toLocalFile()) == QDir::home())
        return QStringLiteral("Home");
    return url.fileName().isEmpty() ? url.toDisplayString() : url.fileName();
}

QString FolderModel::pathText() const
{
    const QUrl url = QUrl::fromUserInput(m_location);
    if (!url.isLocalFile())
        return url.toDisplayString();
    const QString path = QDir::cleanPath(url.toLocalFile());
    const QString home = QDir::homePath();
    if (path == home)
        return QStringLiteral("~");
    if (path.startsWith(home + QLatin1Char('/')))
        return QStringLiteral("~") + path.mid(home.size());
    return path;
}

bool FolderModel::goTo(const QString &text)
{
    QString t = text.trimmed();
    if (t.isEmpty())
        return false;
    if (t == QLatin1String("~") || t.startsWith(QLatin1String("~/")))
        t = QDir::homePath() + t.mid(1);
    const QUrl url = QUrl::fromUserInput(t, QDir::homePath(), QUrl::AssumeLocalFile);
    if (url.isLocalFile()) {
        const QFileInfo fi(url.toLocalFile());
        if (!fi.isDir())
            return false;
        go(QUrl::fromLocalFile(QDir::cleanPath(fi.absoluteFilePath())).toString());
        return true;
    }
    if (!url.isValid())
        return false;
    go(url.toString());
    return true;
}

QVariantList FolderModel::crumbs() const
{
    // Home > Documents > Taxes, or just the view's name
    QVariantList out;
    const QUrl url = QUrl::fromUserInput(m_location);
    if (!url.isLocalFile()) {
        out.append(QVariantMap{{QStringLiteral("name"), title()}, {QStringLiteral("location"), m_location}});
        return out;
    }
    const QString home = QDir::homePath();
    QString path = QDir::cleanPath(url.toLocalFile());
    QStringList parts;
    QString base;
    if (path.startsWith(home)) {
        base = home;
        out.append(QVariantMap{{QStringLiteral("name"), QStringLiteral("Home")}, {QStringLiteral("location"), QUrl::fromLocalFile(home).toString()}});
        parts = path.mid(home.size()).split(QLatin1Char('/'), Qt::SkipEmptyParts);
    } else {
        base = QString();
        out.append(QVariantMap{{QStringLiteral("name"), QStringLiteral("Computer")}, {QStringLiteral("location"), QStringLiteral("file:///")}});
        parts = path.split(QLatin1Char('/'), Qt::SkipEmptyParts);
    }
    for (const QString &p : parts) {
        base += QLatin1Char('/') + p;
        out.append(QVariantMap{{QStringLiteral("name"), p}, {QStringLiteral("location"), QUrl::fromLocalFile(base).toString()}});
    }
    return out;
}

void FolderModel::setFilter(const QString &filter)
{
    if (filter == m_filter)
        return;
    m_filter = filter;
    Q_EMIT filterChanged();
    rebuild();
}

void FolderModel::setSortBy(const QString &sortBy)
{
    if (sortBy == m_sortBy)
        return;
    m_sortBy = sortBy;
    Q_EMIT sortByChanged();
    rebuild();
}

QString FolderModel::kindOf(const QString &name, const QString &mimetype)
{
    const QString ext = QFileInfo(name).suffix().toLower();
    const auto it = kinds().constFind(ext);
    if (it != kinds().constEnd())
        return it.value();
    if (mimetype.startsWith(QLatin1String("image/")))
        return QStringLiteral("image");
    if (mimetype.startsWith(QLatin1String("audio/")))
        return QStringLiteral("audio");
    if (mimetype.startsWith(QLatin1String("video/")))
        return QStringLiteral("video");
    return QStringLiteral("text");
}

QString FolderModel::originOf(const QString &localPath)
{
    if (localPath.isEmpty())
        return {};
    char buf[2048];
    const QByteArray path = QFile::encodeName(localPath);
    const ssize_t n = getxattr(path.constData(), "user.xdg.origin.url", buf, sizeof(buf) - 1);
    if (n <= 0)
        return {};
    return QString::fromUtf8(buf, int(n));
}

QVariantMap FolderModel::folderStats(const QString &path)
{
    QHash<QString, int> counts;
    int total = 0;
    int untrusted = 0;
    QDirIterator it(path, QDir::AllEntries | QDir::NoDotAndDotDot);
    while (it.hasNext() && total < 2000) {
        const QFileInfo fi(it.nextFileInfo());
        const QString kind = fi.isDir() ? QStringLiteral("folder") : kindOf(fi.fileName(), {});
        counts[kind]++;
        total++;
        if (!fi.isDir() && !originOf(fi.absoluteFilePath()).isEmpty())
            untrusted++;
    }
    QVariantList segments;
    QList<QPair<QString, int>> sorted;
    for (auto c = counts.cbegin(); c != counts.cend(); ++c)
        sorted.append({c.key(), c.value()});
    std::sort(sorted.begin(), sorted.end(), [](const auto &a, const auto &b) { return a.second > b.second; });
    for (const auto &s : sorted)
        segments.append(QVariantMap{{QStringLiteral("kind"), s.first}, {QStringLiteral("n"), s.second}});
    return {{QStringLiteral("total"), total}, {QStringLiteral("segments"), segments}, {QStringLiteral("untrusted"), untrusted}};
}

QVariantMap FolderModel::itemFor(const KFileItem &item) const
{
    const QString local = item.localPath();
    const QDateTime modified = item.time(KFileItem::ModificationTime);
    QVariantMap m{
        {QStringLiteral("name"), item.text()},
        {QStringLiteral("location"), item.url().toString()},
        {QStringLiteral("target"), item.mostLocalUrl().toString()},
        {QStringLiteral("path"), local},
        {QStringLiteral("isDir"), item.isDir()},
        {QStringLiteral("kind"), item.isDir() ? QStringLiteral("folder") : kindOf(item.text(), item.mimetype())},
        {QStringLiteral("ext"), QFileInfo(item.text()).suffix().toUpper()},
        {QStringLiteral("mime"), item.mimetype()},
        {QStringLiteral("mimeComment"), item.mimeComment()},
        {QStringLiteral("icon"), item.iconName()},
        {QStringLiteral("size"), item.isDir() ? QVariant() : QVariant(qint64(item.size()))},
        {QStringLiteral("sizeText"), item.isDir() ? QString() : KFormat().formatByteSize(double(item.size()), 0)},
        {QStringLiteral("modified"), modified.toMSecsSinceEpoch()},
        {QStringLiteral("modifiedText"), when(modified)},
        {QStringLiteral("origin"), originOf(local)},
    };
    if (item.isDir() && !local.isEmpty())
        m.insert(QStringLiteral("stats"), folderStats(local));
    m.insert(QStringLiteral("group"), item.isDir() ? QStringLiteral("Folders") : groupFor(modified));
    return m;
}

void FolderModel::scanWeb()
{
    // files that came from the web or email: they carry their download address
    m_webItems.clear();
    const QStringList roots = {QStandardPaths::writableLocation(QStandardPaths::DownloadLocation),
                               QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation),
                               QStandardPaths::writableLocation(QStandardPaths::DesktopLocation),
                               QStandardPaths::writableLocation(QStandardPaths::PicturesLocation)};
    for (const QString &root : roots) {
        QDirIterator it(root, QDir::Files | QDir::NoDotAndDotDot, QDirIterator::Subdirectories);
        int seen = 0;
        while (it.hasNext() && seen++ < 5000) {
            const QFileInfo fi(it.nextFileInfo());
            if (originOf(fi.absoluteFilePath()).isEmpty())
                continue;
            const KFileItem item(QUrl::fromLocalFile(fi.absoluteFilePath()));
            m_webItems.append(itemFor(item));
        }
    }
}

void FolderModel::rebuild()
{
    QVariantList items;
    if (m_location == QLatin1String("web:")) {
        items = m_webItems;
    } else {
        const KFileItemList list = m_lister->items();
        for (const KFileItem &it : list) {
            if (it.isHidden())
                continue;
            items.append(itemFor(it));
        }
    }
    if (!m_filter.isEmpty()) {
        items.erase(std::remove_if(items.begin(), items.end(),
                                   [this](const QVariant &v) { return !v.toMap().value(QStringLiteral("name")).toString().contains(m_filter, Qt::CaseInsensitive); }),
                    items.end());
    }

    QCollator collator;
    collator.setNumericMode(true);
    collator.setCaseSensitivity(Qt::CaseInsensitive);
    const QString by = m_sortBy;
    std::stable_sort(items.begin(), items.end(), [&](const QVariant &a, const QVariant &b) {
        const QVariantMap x = a.toMap(), y = b.toMap();
        if (by == QLatin1String("date"))
            return x.value(QStringLiteral("modified")).toLongLong() > y.value(QStringLiteral("modified")).toLongLong();
        if (by == QLatin1String("size"))
            return x.value(QStringLiteral("size")).toLongLong() > y.value(QStringLiteral("size")).toLongLong();
        if (by == QLatin1String("kind")) {
            const int k = QString::compare(x.value(QStringLiteral("kind")).toString(), y.value(QStringLiteral("kind")).toString());
            if (k != 0)
                return k < 0;
        }
        return collator.compare(x.value(QStringLiteral("name")).toString(), y.value(QStringLiteral("name")).toString()) < 0;
    });

    // groups in the preview's order: Folders, then files by when they changed
    const QStringList order = {QStringLiteral("Folders"), QStringLiteral("Today"), QStringLiteral("Yesterday"), QStringLiteral("This week"), QStringLiteral("Earlier")};
    QHash<QString, QVariantList> byGroup;
    for (const QVariant &v : std::as_const(items))
        byGroup[v.toMap().value(QStringLiteral("group")).toString()].append(v);
    QVariantList groups;
    // sorted by name, size or kind: one "Files" group, so the order you asked for reads straight through
    if (m_sortBy != QLatin1String("date")) {
        QVariantList folders, files;
        for (const QVariant &v : std::as_const(items))
            (v.toMap().value(QStringLiteral("isDir")).toBool() ? folders : files).append(v);
        if (!folders.isEmpty())
            groups.append(QVariantMap{{QStringLiteral("title"), order.first()}, {QStringLiteral("items"), folders}});
        if (!files.isEmpty())
            groups.append(QVariantMap{{QStringLiteral("title"), QStringLiteral("Files")}, {QStringLiteral("items"), files}});
    } else {
        for (const QString &g : order)
            if (!byGroup.value(g).isEmpty())
                groups.append(QVariantMap{{QStringLiteral("title"), g}, {QStringLiteral("items"), byGroup.value(g)}});
    }
    m_groups = groups;
    m_count = int(items.size());
    Q_EMIT groupsChanged();
}

QVariantList FolderModel::flatItems() const
{
    QVariantList out;
    for (const QVariant &g : m_groups)
        out.append(g.toMap().value(QStringLiteral("items")).toList());
    return out;
}
