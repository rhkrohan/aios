#include "catalog.h"

#include <AppStreamQt/bundle.h>
#include <AppStreamQt/component.h>
#include <AppStreamQt/developer.h>
#include <AppStreamQt/icon.h>
#include <AppStreamQt/image.h>
#include <AppStreamQt/metadata.h>
#include <AppStreamQt/pool.h>
#include <AppStreamQt/release-list.h>
#include <AppStreamQt/screenshot.h>

#include <QDate>
#include <QDir>
#include <QFileInfo>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QSysInfo>

#include <algorithm>

using namespace AppStream;

namespace
{
// a few well-known apps to start with, in the preview's "Popular" grid
const QStringList POPULAR = {
    QStringLiteral("org.libreoffice.LibreOffice"), QStringLiteral("org.mozilla.Thunderbird"), QStringLiteral("md.obsidian.Obsidian"),
    QStringLiteral("com.spotify.Client"), QStringLiteral("org.signal.Signal"), QStringLiteral("com.visualstudio.code"),
    QStringLiteral("org.gimp.GIMP"), QStringLiteral("org.videolan.VLC"), QStringLiteral("com.slack.Slack"),
    QStringLiteral("org.inkscape.Inkscape"), QStringLiteral("com.discordapp.Discord"), QStringLiteral("us.zoom.Zoom"),
    QStringLiteral("org.blender.Blender"), QStringLiteral("com.obsproject.Studio"), QStringLiteral("org.kde.krita"),
    QStringLiteral("com.github.tchx84.Flatseal"),
};
const QStringList FEATURED = {QStringLiteral("md.obsidian.Obsidian"), QStringLiteral("org.libreoffice.LibreOffice"),
                              QStringLiteral("org.signal.Signal"), QStringLiteral("org.blender.Blender")};

QString cleanId(QString id)
{
    if (id.endsWith(QLatin1String(".desktop")))
        id.chop(8);
    return id;
}

QString arch()
{
    const QString a = QSysInfo::currentCpuArchitecture();
    return a == QLatin1String("arm64") ? QStringLiteral("aarch64") : a == QLatin1String("x86_64") ? a : a;
}

// where Flatpak keeps catalog icons, system-wide and for this person
QStringList iconDirs()
{
    QStringList dirs;
    const QStringList bases = {QStringLiteral("/var/lib/flatpak/appstream"),
                               QDir::homePath() + QStringLiteral("/.local/share/flatpak/appstream")};
    for (const QString &base : bases) {
        for (const QString &remote : QDir(base).entryList(QDir::Dirs | QDir::NoDotAndDotDot))
            dirs << base + QLatin1Char('/') + remote + QLatin1Char('/') + arch() + QStringLiteral("/active/icons");
    }
    return dirs;
}
} // namespace

Catalog::Catalog(QObject *parent)
    : QObject(parent)
    , m_pool(new Pool(this))
    , m_apps(new QList<Component>)
{
    connect(m_pool, &Pool::loadFinished, this, [this](bool) {
        m_apps->clear();
        m_index.clear();
        for (const Component &c : m_pool->componentsByKind(Component::KindDesktopApp)) {
            if (c.bundle(Bundle::KindFlatpak).isEmpty())
                continue;
            const QString id = cleanId(c.id());
            if (m_index.contains(id))
                continue;
            m_index.insert(id, int(m_apps->size()));
            m_apps->append(c);
        }
        m_ready = true;
        Q_EMIT changed();
    });
    loadPool();
    loadInstalled();
    refresh();
}

Catalog::~Catalog()
{
    delete m_apps;
}

void Catalog::loadPool()
{
    m_pool->setFlags(Pool::FlagLoadFlatpak);
    // a per-person Flathub (no admin needed) lives in the home folder
    const QString user = QDir::homePath() + QStringLiteral("/.local/share/flatpak/appstream");
    for (const QString &remote : QDir(user).entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        const QString dir = user + QLatin1Char('/') + remote + QLatin1Char('/') + arch() + QStringLiteral("/active");
        if (QFileInfo::exists(dir))
            m_pool->addExtraDataLocation(dir, Metadata::FormatStyleCatalog);
    }
    m_pool->loadAsync();
}

void Catalog::refresh()
{
    // fetch the newest catalog, then reload; meanwhile the one on disk is shown
    m_refreshing = true;
    Q_EMIT refreshingChanged();
    auto *p = new QProcess(this);
    connect(p, &QProcess::finished, this, [this, p] {
        p->deleteLater();
        m_refreshing = false;
        Q_EMIT refreshingChanged();
        m_pool->clear();
        loadPool();
        loadInstalled();
    });
    p->start(QStringLiteral("sh"), {QStringLiteral("-c"), QStringLiteral("flatpak update --appstream --noninteractive >/dev/null 2>&1; true")});
}

void Catalog::loadInstalled()
{
    auto *list = new QProcess(this);
    connect(list, &QProcess::finished, this, [this, list] {
        m_installed.clear();
        const QStringList lines = QString::fromUtf8(list->readAllStandardOutput()).split(QLatin1Char('\n'), Qt::SkipEmptyParts);
        for (const QString &line : lines) {
            const QStringList f = line.split(QLatin1Char('\t'));
            if (f.size() >= 4)
                m_installed.insert(f[0], {{QStringLiteral("version"), f[1]}, {QStringLiteral("origin"), f[2]}, {QStringLiteral("installation"), f[3]}});
        }
        list->deleteLater();
        Q_EMIT installedChanged();
        Q_EMIT changed();
    });
    list->start(QStringLiteral("flatpak"), {QStringLiteral("list"), QStringLiteral("--app"), QStringLiteral("--columns=application,version,origin,installation")});

    auto *updates = new QProcess(this);
    connect(updates, &QProcess::finished, this, [this, updates] {
        m_updates.clear();
        const QStringList lines = QString::fromUtf8(updates->readAllStandardOutput()).split(QLatin1Char('\n'), Qt::SkipEmptyParts);
        for (const QString &line : lines) {
            const QStringList f = line.split(QLatin1Char('\t'));
            if (!f.isEmpty() && !f[0].isEmpty())
                m_updates.insert(f[0], f.value(1));
        }
        updates->deleteLater();
        Q_EMIT installedChanged();
    });
    updates->start(QStringLiteral("flatpak"), {QStringLiteral("remote-ls"), QStringLiteral("--updates"), QStringLiteral("--app"), QStringLiteral("--columns=application,version")});
}

QVariantMap Catalog::brief(const Component &c) const
{
    const QString id = cleanId(c.id());
    // the icon: the catalog's cached picture if it's on disk, else its web address
    QString icon;
    for (const Icon &i : c.icons()) {
        if (i.kind() == Icon::KindCached) {
            for (const QString &dir : iconDirs()) {
                for (const QString &size : {QStringLiteral("128x128"), QStringLiteral("64x64")}) {
                    const QString path = dir + QLatin1Char('/') + size + QLatin1Char('/') + i.name();
                    if (QFileInfo::exists(path)) {
                        icon = QUrl::fromLocalFile(path).toString();
                        break;
                    }
                }
                if (!icon.isEmpty())
                    break;
            }
        } else if (i.kind() == Icon::KindRemote && icon.isEmpty()) {
            icon = i.url().toString();
        }
        if (!icon.isEmpty() && icon.startsWith(QLatin1String("file:")))
            break;
    }
    return {
        {QStringLiteral("id"), id},
        {QStringLiteral("name"), c.name()},
        {QStringLiteral("summary"), c.summary()},
        {QStringLiteral("developer"), c.developer().name()},
        {QStringLiteral("icon"), icon},
        {QStringLiteral("categories"), c.categories()},
        {QStringLiteral("installed"), m_installed.contains(id)},
        {QStringLiteral("update"), m_updates.contains(id)},
    };
}

QVariantMap Catalog::featured() const
{
    if (!m_ready)
        return {};
    // a different one each day
    const int start = QDate::currentDate().dayOfYear();
    for (int i = 0; i < FEATURED.size(); ++i) {
        const QString id = FEATURED.at((start + i) % FEATURED.size());
        if (m_index.contains(id))
            return app(id);
    }
    return m_apps->isEmpty() ? QVariantMap() : brief(m_apps->first());
}

QVariantList Catalog::popular() const
{
    QVariantList out;
    for (const QString &id : POPULAR)
        if (m_index.contains(id))
            out.append(brief(m_apps->at(m_index.value(id))));
    return out;
}

QVariantList Catalog::installed() const
{
    QVariantList out;
    for (auto it = m_installed.cbegin(); it != m_installed.cend(); ++it) {
        QVariantMap m = m_index.contains(it.key()) ? brief(m_apps->at(m_index.value(it.key())))
                                                   : QVariantMap{{QStringLiteral("id"), it.key()}, {QStringLiteral("name"), it.key().section(QLatin1Char('.'), -1)},
                                                                 {QStringLiteral("installed"), true}};
        m.insert(QStringLiteral("version"), it.value().value(QStringLiteral("version")));
        m.insert(QStringLiteral("update"), m_updates.contains(it.key()));
        out.append(m);
    }
    std::sort(out.begin(), out.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value(QStringLiteral("name")).toString().compare(b.toMap().value(QStringLiteral("name")).toString(), Qt::CaseInsensitive) < 0;
    });
    return out;
}

QVariantList Catalog::updates() const
{
    QVariantList out;
    for (const QVariant &v : installed())
        if (v.toMap().value(QStringLiteral("update")).toBool())
            out.append(v);
    return out;
}

QVariantList Catalog::categories() const
{
    auto cat = [](const char *id, const char *label, const char *icon) {
        return QVariantMap{{QStringLiteral("id"), QString::fromLatin1(id)}, {QStringLiteral("label"), QString::fromLatin1(label)}, {QStringLiteral("icon"), QString::fromLatin1(icon)}};
    };
    return {cat("Office", "Productivity", "briefcase"), cat("Chat", "Communication", "message-circle"), cat("Development", "Developer", "code-xml"),
            cat("Graphics", "Graphics & photos", "image"), cat("AudioVideo", "Music & video", "music"), cat("Game", "Games", "gamepad-2"),
            cat("Education", "Education", "graduation-cap"), cat("Utility", "Utilities", "wrench")};
}

QVariantList Catalog::search(const QString &term) const
{
    QVariantList out;
    if (term.trimmed().size() < 2)
        return out;
    QSet<QString> seen;
    for (const Component &c : m_pool->search(term)) {
        const QString id = cleanId(c.id());
        if (!m_index.contains(id) || seen.contains(id))
            continue;
        seen.insert(id);
        out.append(brief(m_apps->at(m_index.value(id))));
        if (out.size() >= 60)
            break;
    }
    return out;
}

QVariantList Catalog::inCategory(const QString &category) const
{
    QVariantList out;
    for (const Component &c : std::as_const(*m_apps)) {
        if (c.hasCategory(category))
            out.append(brief(c));
    }
    std::sort(out.begin(), out.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value(QStringLiteral("name")).toString().compare(b.toMap().value(QStringLiteral("name")).toString(), Qt::CaseInsensitive) < 0;
    });
    if (out.size() > 150)
        out = out.mid(0, 150);
    return out;
}

QVariantMap Catalog::app(const QString &id) const
{
    if (!m_index.contains(id)) {
        QVariantMap m{{QStringLiteral("id"), id}, {QStringLiteral("name"), id.section(QLatin1Char('.'), -1)}};
        m.insert(QStringLiteral("installed"), m_installed.contains(id));
        return m;
    }
    const Component &c = m_apps->at(m_index.value(id));
    QVariantMap m = brief(c);
    m.insert(QStringLiteral("description"), c.description());
    m.insert(QStringLiteral("license"), c.projectLicense());
    m.insert(QStringLiteral("homepage"), c.url(Component::UrlKindHomepage).toString());
    m.insert(QStringLiteral("version"), m_installed.value(id).value(QStringLiteral("version")));
    QVariantList shots;
    for (const Screenshot &s : c.screenshotsAll()) {
        QString best;
        uint bestW = 0;
        for (const Image &img : s.images()) {
            if (img.width() >= bestW && img.width() <= 1600) {
                bestW = img.width();
                best = img.url().toString();
            }
        }
        if (!best.isEmpty())
            shots.append(best);
        if (shots.size() >= 4)
            break;
    }
    m.insert(QStringLiteral("screenshots"), shots);
    return m;
}

QString Catalog::remoteFor(const QString &id) const
{
    if (m_installed.contains(id))
        return m_installed.value(id).value(QStringLiteral("origin")).toString();
    if (m_index.contains(id)) {
        const QString origin = m_apps->at(m_index.value(id)).origin();
        if (!origin.isEmpty())
            return origin.section(QLatin1Char('/'), 0, 0);
    }
    return QStringLiteral("flathub");
}

void Catalog::loadPermissions(const QString &id)
{
    auto *p = new QProcess(this);
    connect(p, &QProcess::finished, this, [this, p, id] {
        const QString meta = QString::fromUtf8(p->readAllStandardOutput());
        p->deleteLater();
        // the sandbox settings, in plain words
        auto values = [&meta](const QString &key) {
            const QRegularExpression re(QStringLiteral("^%1=(.*)$").arg(key), QRegularExpression::MultilineOption);
            const auto m = re.match(meta);
            return m.hasMatch() ? m.captured(1).split(QLatin1Char(';'), Qt::SkipEmptyParts) : QStringList();
        };
        const QStringList shared = values(QStringLiteral("shared"));
        const QStringList sockets = values(QStringLiteral("sockets"));
        const QStringList devices = values(QStringLiteral("devices"));
        const QStringList files = values(QStringLiteral("filesystems"));
        QVariantList reach;
        int level = 0; // 0 stays in its sandbox, 1 some of your things, 2 full access
        auto add = [&reach](const QString &icon, const QString &title, const QString &body) {
            reach.append(QVariantMap{{QStringLiteral("icon"), icon}, {QStringLiteral("title"), title}, {QStringLiteral("body"), body}});
        };
        const bool host = files.contains(QStringLiteral("host")) || files.contains(QStringLiteral("host-os")) || meta.contains(QStringLiteral("org.freedesktop.Flatpak=talk"));
        const bool home = std::any_of(files.begin(), files.end(), [](const QString &f) { return f.startsWith(QLatin1String("home")) || f == QLatin1String("~"); });
        QStringList folders;
        for (const QString &f : files) {
            static const QHash<QString, QString> names = {{QStringLiteral("xdg-download"), QStringLiteral("Downloads")}, {QStringLiteral("xdg-documents"), QStringLiteral("Documents")},
                                                          {QStringLiteral("xdg-pictures"), QStringLiteral("Pictures")}, {QStringLiteral("xdg-music"), QStringLiteral("Music")},
                                                          {QStringLiteral("xdg-videos"), QStringLiteral("Videos")}, {QStringLiteral("xdg-desktop"), QStringLiteral("Desktop")}};
            const QString base = f.section(QLatin1Char(':'), 0, 0).section(QLatin1Char('/'), 0, 0);
            if (names.contains(base) && !folders.contains(names.value(base)))
                folders << names.value(base);
        }
        if (host) {
            add(QStringLiteral("shield-alert"), QStringLiteral("Full access to this computer"), QStringLiteral("It can read and change files anywhere, like an app installed the old way."));
            level = 2;
        } else if (home) {
            add(QStringLiteral("folder"), QStringLiteral("All your files"), QStringLiteral("It can open, change and delete anything in your home folder."));
            level = 2;
        } else if (!folders.isEmpty()) {
            add(QStringLiteral("folder"), QStringLiteral("Some of your folders"), QStringLiteral("It can open and change files in %1.").arg(folders.join(QStringLiteral(", "))));
            level = std::max(level, 1);
        } else {
            add(QStringLiteral("lock"), QStringLiteral("Only files you hand it"), QStringLiteral("It sees a file only when you pick one in an Open or Save window."));
        }
        if (shared.contains(QStringLiteral("network")))
            add(QStringLiteral("globe"), QStringLiteral("The internet"), QStringLiteral("It can send and receive data online."));
        if (devices.contains(QStringLiteral("all"))) {
            add(QStringLiteral("camera"), QStringLiteral("Cameras, microphones and devices"), QStringLiteral("It can use plugged-in devices directly."));
            level = std::max(level, 1);
        }
        if (sockets.contains(QStringLiteral("pulseaudio")))
            add(QStringLiteral("music"), QStringLiteral("Sound"), QStringLiteral("It can play sound, and record when it asks."));
        if (meta.isEmpty())
            reach = {};
        static const char *labels[] = {"Stays in its sandbox", "Can reach some of your things", "Full access"};
        Q_EMIT permissionsReady(id, {{QStringLiteral("level"), level}, {QStringLiteral("label"), QString::fromLatin1(labels[level])}, {QStringLiteral("reach"), reach}, {QStringLiteral("known"), !meta.isEmpty()}});
    });
    if (m_installed.contains(id))
        p->start(QStringLiteral("flatpak"), {QStringLiteral("info"), QStringLiteral("--show-permissions"), id});
    else
        p->start(QStringLiteral("flatpak"), {QStringLiteral("remote-info"), QStringLiteral("--show-metadata"), remoteFor(id), id});
}

void Catalog::runFlatpak(const QString &id, const QString &action, const QStringList &args)
{
    if (m_busy.contains(id))
        return;
    m_busy.insert(id, QVariantMap{{QStringLiteral("action"), action}, {QStringLiteral("progress"), -1}});
    Q_EMIT busyChanged();
    auto *p = new QProcess(this);
    p->setProcessChannelMode(QProcess::MergedChannels);
    connect(p, &QProcess::readyRead, this, [this, p, id, action] {
        // flatpak draws a progress bar ending in "NN%"
        const QString out = QString::fromUtf8(p->readAll());
        const auto all = QRegularExpression(QStringLiteral("(\\d{1,3})%")).globalMatch(out);
        int last = -1;
        auto it = all;
        while (it.hasNext())
            last = it.next().captured(1).toInt();
        if (last >= 0) {
            m_busy.insert(id, QVariantMap{{QStringLiteral("action"), action}, {QStringLiteral("progress"), last}});
            Q_EMIT busyChanged();
        }
    });
    connect(p, &QProcess::finished, this, [this, p, id, action](int code) {
        const QString tail = QString::fromUtf8(p->readAll()).trimmed().section(QLatin1Char('\n'), -1);
        p->deleteLater();
        m_busy.remove(id);
        Q_EMIT busyChanged();
        loadInstalled();
        Q_EMIT finished(id, action, code == 0, code == 0 ? QString() : tail);
    });
    p->start(QStringLiteral("flatpak"), args);
}

void Catalog::install(const QString &id)
{
    // install where the source is set up: for everyone if the system has it, else just for this person
    const QString remote = remoteFor(id);
    QProcess check;
    check.start(QStringLiteral("flatpak"), {QStringLiteral("remotes"), QStringLiteral("--system"), QStringLiteral("--columns=name")});
    check.waitForFinished(3000);
    const bool system = QString::fromUtf8(check.readAllStandardOutput()).split(QLatin1Char('\n')).contains(remote);
    runFlatpak(id, QStringLiteral("install"),
               {QStringLiteral("install"), system ? QStringLiteral("--system") : QStringLiteral("--user"), QStringLiteral("-y"), QStringLiteral("--noninteractive"), remote, id});
}

void Catalog::remove(const QString &id)
{
    const QString where = m_installed.value(id).value(QStringLiteral("installation")).toString() == QLatin1String("user") ? QStringLiteral("--user") : QStringLiteral("--system");
    runFlatpak(id, QStringLiteral("remove"), {QStringLiteral("uninstall"), where, QStringLiteral("-y"), QStringLiteral("--noninteractive"), id});
}

void Catalog::update(const QString &id)
{
    const QString where = m_installed.value(id).value(QStringLiteral("installation")).toString() == QLatin1String("user") ? QStringLiteral("--user") : QStringLiteral("--system");
    runFlatpak(id, QStringLiteral("update"), {QStringLiteral("update"), where, QStringLiteral("-y"), QStringLiteral("--noninteractive"), id});
}

void Catalog::updateAll()
{
    for (auto it = m_updates.cbegin(); it != m_updates.cend(); ++it)
        update(it.key());
}

void Catalog::open(const QString &id)
{
    QProcess::startDetached(QStringLiteral("flatpak"), {QStringLiteral("run"), id});
}
