#include "search.h"

#include <Baloo/Query>
#include <KApplicationTrader>
#include <KIO/ApplicationLauncherJob>
#include <KIO/JobUiDelegateFactory>
#include <KIO/OpenUrlJob>

#include <QDir>
#include <QFileInfo>
#include <QMimeDatabase>
#include <QProcess>
#include <QUrl>

#include <algorithm>

namespace
{
struct Fixed {
    const char *title;
    const char *sub;
    const char *icon;
    const char *command;
    const char *words; // other ways people say it
};

// settings pages (SIOS Settings, or KDE's own page)
const Fixed SETTINGS[] = {
    {"Wi-Fi", "Settings", "wifi", "sios-settings --page wifi", "wifi wireless network internet connect"},
    {"Appearance", "Settings: light or dark, wallpaper", "palette", "sios-settings --page appearance", "theme dark light mode wallpaper background look"},
    {"Updates", "Settings: the SIOS version", "refresh-cw", "sios-settings --page updates", "update upgrade version"},
    {"About this computer", "Settings", "info", "sios-settings --page about", "about system version memory processor storage"},
    {"Display", "Settings", "monitor", "systemsettings kcm_kscreen", "screen display resolution scale monitor brightness"},
    {"Sound", "Settings", "volume-2", "systemsettings kcm_pulseaudio", "sound audio volume speakers microphone"},
    {"Bluetooth", "Settings", "bluetooth", "systemsettings kcm_bluetooth", "bluetooth headphones devices pair"},
    {"Notifications", "Settings", "bell", "systemsettings kcm_notifications", "notifications alerts do not disturb"},
    {"Users", "Settings", "users", "systemsettings kcm_users", "users accounts password"},
    {"Keyboard", "Settings", "keyboard", "systemsettings kcm_keyboard", "keyboard layout language typing"},
};

// things you can do right away
const Fixed ACTIONS[] = {
    {"Lock screen", "Action", "lock", "loginctl lock-session", "lock away"},
    {"Sleep", "Action", "moon", "systemctl suspend", "sleep suspend"},
    {"Restart…", "Action", "rotate-ccw", "qdbus-qt6 org.kde.LogoutPrompt /LogoutPrompt promptReboot", "restart reboot"},
    {"Shut down…", "Action", "power", "qdbus-qt6 org.kde.LogoutPrompt /LogoutPrompt promptShutDown", "shut down power off turn off"},
    {"Log out…", "Action", "log-out", "qdbus-qt6 org.kde.LogoutPrompt /LogoutPrompt promptLogout", "log out sign out"},
    {"Dark mode", "Action: switch to the dark look", "moon", "plasma-apply-lookandfeel -a org.sios.desktop.dark", "dark mode night theme"},
    {"Light mode", "Action: switch to the light look", "sun", "plasma-apply-lookandfeel -a org.sios.desktop", "light mode day theme"},
    {"Empty Trash", "Action", "trash-2", "ktrash6 --empty", "empty trash bin delete"},
};

// how well a name matches: whole start, a word's start, anywhere, or a related word
int score(const QString &text, const QString &name, const QString &more = {})
{
    const QString t = text.trimmed();
    if (t.isEmpty())
        return 0;
    if (name.compare(t, Qt::CaseInsensitive) == 0)
        return 120;
    if (name.startsWith(t, Qt::CaseInsensitive))
        return 100;
    for (const QString &w : name.split(QLatin1Char(' '), Qt::SkipEmptyParts))
        if (w.startsWith(t, Qt::CaseInsensitive))
            return 85;
    if (name.contains(t, Qt::CaseInsensitive))
        return 65;
    for (const QString &w : more.split(QLatin1Char(' '), Qt::SkipEmptyParts))
        if (w.startsWith(t, Qt::CaseInsensitive))
            return 45;
    return 0;
}

QVariantMap fixed(const Fixed &f, const QString &kind)
{
    return {{QStringLiteral("kind"), kind}, {QStringLiteral("title"), QString::fromUtf8(f.title)}, {QStringLiteral("sub"), QString::fromUtf8(f.sub)},
            {QStringLiteral("icon"), QString::fromLatin1(f.icon)}, {QStringLiteral("command"), QString::fromUtf8(f.command)}};
}
} // namespace

Search::Search(QObject *parent)
    : QObject(parent)
{
    loadApps();
}

void Search::loadApps()
{
    m_apps = KApplicationTrader::query([](const KService::Ptr &s) { return !s->noDisplay() && !s->exec().isEmpty(); });
}

QVariantList Search::suggestions() const
{
    auto app = [this](const QString &id, const QString &title, const QString &sub, const QString &icon) {
        return QVariantMap{{QStringLiteral("kind"), QStringLiteral("app")}, {QStringLiteral("id"), id}, {QStringLiteral("title"), title},
                           {QStringLiteral("sub"), sub}, {QStringLiteral("icon"), icon}, {QStringLiteral("line"), true}};
    };
    return {app(QStringLiteral("org.sios.files.desktop"), QStringLiteral("Open my files"), QStringLiteral("Your folders, and what's inside each one."), QStringLiteral("folder")),
            app(QStringLiteral("org.sios.store.desktop"), QStringLiteral("Get an app"), QStringLiteral("Apps from Flathub, and what each one can reach."), QStringLiteral("shopping-bag")),
            fixed(SETTINGS[1], QStringLiteral("setting"))};
}

QVariantList Search::find(const QString &text) const
{
    struct Hit {
        int score;
        QVariantMap item;
    };
    QList<Hit> hits;

    for (const KService::Ptr &s : m_apps) {
        const int sc = score(text, s->name(), s->genericName() + QLatin1Char(' ') + s->keywords().join(QLatin1Char(' ')) + QLatin1Char(' ') + s->comment());
        if (sc > 0)
            hits.append({sc + 4, {{QStringLiteral("kind"), QStringLiteral("app")}, {QStringLiteral("id"), s->storageId()}, {QStringLiteral("title"), s->name()},
                                  {QStringLiteral("sub"), s->genericName().isEmpty() ? (s->comment().isEmpty() ? QStringLiteral("App") : s->comment()) : s->genericName()},
                                  {QStringLiteral("icon"), s->icon()}, {QStringLiteral("themed"), true}}});
    }
    for (const Fixed &f : SETTINGS) {
        const int sc = score(text, QString::fromUtf8(f.title), QString::fromUtf8(f.words));
        if (sc > 0)
            hits.append({sc, fixed(f, QStringLiteral("setting"))});
    }
    for (const Fixed &f : ACTIONS) {
        const int sc = score(text, QString::fromUtf8(f.title), QString::fromUtf8(f.words));
        if (sc > 0)
            hits.append({sc, fixed(f, QStringLiteral("action"))});
    }
    // files: KDE's index; slower to ask, so only once there's something to go on
    if (text.trimmed().size() >= 3) {
        Baloo::Query q;
        q.setSearchString(text.trimmed());
        q.setLimit(4);
        Baloo::ResultIterator it = q.exec();
        QMimeDatabase mimes;
        const QString home = QDir::homePath();
        while (it.next()) {
            const QFileInfo fi(it.filePath());
            QString where = fi.absolutePath();
            if (where.startsWith(home))
                where = QStringLiteral("~") + where.mid(home.size());
            hits.append({score(text, fi.fileName()) > 0 ? 50 : 30,
                         {{QStringLiteral("kind"), QStringLiteral("file")}, {QStringLiteral("path"), fi.absoluteFilePath()}, {QStringLiteral("title"), fi.fileName()},
                          {QStringLiteral("sub"), where}, {QStringLiteral("icon"), mimes.mimeTypeForFile(fi).iconName()}, {QStringLiteral("themed"), true}}});
        }
    }

    std::stable_sort(hits.begin(), hits.end(), [](const Hit &a, const Hit &b) { return a.score > b.score; });
    QVariantList out;
    for (const Hit &h : std::as_const(hits)) {
        out.append(h.item);
        if (out.size() >= 8)
            break;
    }
    return out;
}

QVariantList Search::allApps(const QString &filter) const
{
    QList<KService::Ptr> apps;
    for (const KService::Ptr &s : m_apps)
        if (filter.trimmed().isEmpty() || score(filter, s->name(), s->genericName() + QLatin1Char(' ') + s->keywords().join(QLatin1Char(' '))) > 0)
            apps.append(s);
    std::sort(apps.begin(), apps.end(), [](const KService::Ptr &a, const KService::Ptr &b) { return a->name().compare(b->name(), Qt::CaseInsensitive) < 0; });
    QVariantList out;
    for (const KService::Ptr &s : apps)
        out.append(QVariantMap{{QStringLiteral("kind"), QStringLiteral("app")}, {QStringLiteral("id"), s->storageId()}, {QStringLiteral("title"), s->name()},
                               {QStringLiteral("icon"), s->icon()}, {QStringLiteral("themed"), true}});
    return out;
}

void Search::run(const QVariantMap &item)
{
    const QString kind = item.value(QStringLiteral("kind")).toString();
    if (kind == QLatin1String("app")) {
        const KService::Ptr service = KService::serviceByStorageId(item.value(QStringLiteral("id")).toString());
        if (service) {
            auto *job = new KIO::ApplicationLauncherJob(service);
            job->setUiDelegate(KIO::createDefaultJobUiDelegate(KJobUiDelegate::AutoHandlingEnabled, nullptr));
            job->start();
        }
    } else if (kind == QLatin1String("file")) {
        auto *job = new KIO::OpenUrlJob(QUrl::fromLocalFile(item.value(QStringLiteral("path")).toString()));
        job->setUiDelegate(KIO::createDefaultJobUiDelegate(KJobUiDelegate::AutoHandlingEnabled, nullptr));
        job->start();
    } else {
        QProcess::startDetached(QStringLiteral("sh"), {QStringLiteral("-c"), item.value(QStringLiteral("command")).toString()});
    }
}
