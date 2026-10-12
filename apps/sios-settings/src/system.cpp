#include "system.h"

#include <KConfig>
#include <KConfigGroup>
#include <KFormat>

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocale>
#include <QStorageInfo>
#include <QSysInfo>
#include <QThread>
#include <QTimer>

#include <functional>

namespace
{
QString osRelease(const QString &key)
{
    QFile f(QStringLiteral("/etc/os-release"));
    if (!f.open(QIODevice::ReadOnly))
        return {};
    for (const QString &line : QString::fromUtf8(f.readAll()).split(QLatin1Char('\n'))) {
        if (line.startsWith(key + QLatin1Char('=')))
            return line.mid(key.size() + 1).remove(QLatin1Char('"')).remove(QLatin1Char('\''));
    }
    return {};
}
} // namespace

System::System(QObject *parent)
    : QObject(parent)
{
    readAppearance();
    readWifi();
    readUpdate();
    // Wi-Fi changes on its own (networks come and go)
    auto *t = new QTimer(this);
    connect(t, &QTimer::timeout, this, &System::readWifi);
    t->start(8000);
}

void System::run(const QString &program, const QStringList &args, std::function<void(int, const QString &)> done)
{
    auto *p = new QProcess(this);
    p->setProcessChannelMode(QProcess::MergedChannels);
    connect(p, &QProcess::finished, this, [p, done](int code) {
        const QString out = QString::fromUtf8(p->readAll());
        p->deleteLater();
        if (done)
            done(code, out);
    });
    p->start(program, args);
}

// ---- appearance

void System::readAppearance()
{
    KConfig globals(QStringLiteral("kdeglobals"));
    const QString lnf = globals.group(QStringLiteral("KDE")).readEntry("LookAndFeelPackage", QString());
    const QString scheme = globals.group(QStringLiteral("General")).readEntry("ColorScheme", QString());
    m_dark = lnf.endsWith(QLatin1String(".dark")) || scheme.contains(QLatin1String("Dark"));
    KConfig shell(QStringLiteral("plasma-org.kde.plasma.desktop-appletsrc"));
    m_wallpaper.clear();
    for (const QString &c : shell.group(QStringLiteral("Containments")).groupList()) {
        const QString image = shell.group(QStringLiteral("Containments")).group(c).group(QStringLiteral("Wallpaper")).group(QStringLiteral("org.kde.image")).group(QStringLiteral("General")).readEntry("Image", QString());
        if (!image.isEmpty()) {
            m_wallpaper = image.contains(QLatin1String("SIOS-Lake")) ? QStringLiteral("lake") : image.contains(QLatin1String("SIOS-Tunnel")) ? QStringLiteral("tunnel") : image.contains(QLatin1String("SIOS-Dusk")) ? QStringLiteral("dusk") : QStringLiteral("other");
            break;
        }
    }
    Q_EMIT appearanceChanged();
}

QVariantList System::wallpapers() const
{
    auto w = [](const char *id, const char *name, const char *dir, const char *file) {
        return QVariantMap{{QStringLiteral("id"), QString::fromLatin1(id)}, {QStringLiteral("name"), QString::fromLatin1(name)},
                           {QStringLiteral("dir"), QStringLiteral("/usr/share/wallpapers/") + QString::fromLatin1(dir)},
                           {QStringLiteral("preview"), QStringLiteral("file:///usr/share/wallpapers/%1/contents/%2").arg(QString::fromLatin1(dir), QString::fromLatin1(file))}};
    };
    return {w("dusk", "Dusk", "SIOS-Dusk", "screenshot.jpg"), w("lake", "Lake", "SIOS-Lake", "screenshot.jpg"), w("tunnel", "Tunnel", "SIOS-Tunnel", "images/1920x1080.png")};
}

void System::setDark(bool dark)
{
    run(QStringLiteral("plasma-apply-lookandfeel"), {QStringLiteral("-a"), dark ? QStringLiteral("org.sios.desktop.dark") : QStringLiteral("org.sios.desktop")},
        [this](int, const QString &) { readAppearance(); });
    m_dark = dark;
    Q_EMIT appearanceChanged();
}

void System::setWallpaper(const QString &id)
{
    for (const QVariant &v : wallpapers()) {
        const QVariantMap w = v.toMap();
        if (w.value(QStringLiteral("id")) == id) {
            run(QStringLiteral("plasma-apply-wallpaperimage"), {w.value(QStringLiteral("dir")).toString()}, [this](int, const QString &) { readAppearance(); });
            m_wallpaper = id;
            Q_EMIT appearanceChanged();
        }
    }
}

// ---- wifi

void System::readWifi()
{
    run(QStringLiteral("nmcli"), {QStringLiteral("-t"), QStringLiteral("-f"), QStringLiteral("WIFI-HW,WIFI"), QStringLiteral("radio")}, [this](int, const QString &out) {
        const QStringList f = out.trimmed().split(QLatin1Char(':'));
        m_wifiHardware = f.value(0) == QLatin1String("enabled") || f.value(0) == QLatin1String("missing") ? f.value(0) == QLatin1String("enabled") : true;
        m_wifiEnabled = f.value(1) == QLatin1String("enabled");
        Q_EMIT wifiChanged();
    });
    run(QStringLiteral("nmcli"), {QStringLiteral("-t"), QStringLiteral("-f"), QStringLiteral("DEVICE,TYPE,STATE,CONNECTION"), QStringLiteral("device")}, [this](int, const QString &out) {
        m_wired.clear();
        bool hasWifi = false;
        for (const QString &line : out.split(QLatin1Char('\n'), Qt::SkipEmptyParts)) {
            const QStringList f = line.split(QLatin1Char(':'));
            if (f.value(1) == QLatin1String("ethernet") && f.value(2) == QLatin1String("connected"))
                m_wired = f.value(3);
            if (f.value(1) == QLatin1String("wifi"))
                hasWifi = true;
        }
        m_wifiHardware = hasWifi;
        Q_EMIT wifiChanged();
    });
    run(QStringLiteral("nmcli"), {QStringLiteral("-t"), QStringLiteral("-f"), QStringLiteral("IN-USE,SSID,SIGNAL,SECURITY"), QStringLiteral("device"), QStringLiteral("wifi"), QStringLiteral("list")},
        [this](int, const QString &out) {
            QVariantList list;
            QSet<QString> seen;
            for (const QString &line : out.split(QLatin1Char('\n'), Qt::SkipEmptyParts)) {
                const QStringList f = line.split(QLatin1Char(':'));
                const QString ssid = f.value(1);
                if (ssid.isEmpty() || seen.contains(ssid))
                    continue;
                seen.insert(ssid);
                list.append(QVariantMap{{QStringLiteral("ssid"), ssid}, {QStringLiteral("signal"), f.value(2).toInt()},
                                        {QStringLiteral("secure"), !f.value(3).isEmpty() && f.value(3) != QLatin1String("--")},
                                        {QStringLiteral("connected"), f.value(0) == QLatin1String("*")}});
            }
            m_networks = list;
            Q_EMIT wifiChanged();
        });
}

void System::setWifi(bool on)
{
    run(QStringLiteral("nmcli"), {QStringLiteral("radio"), QStringLiteral("wifi"), on ? QStringLiteral("on") : QStringLiteral("off")}, [this](int, const QString &) { readWifi(); });
}

void System::scanWifi()
{
    run(QStringLiteral("nmcli"), {QStringLiteral("device"), QStringLiteral("wifi"), QStringLiteral("rescan")}, [this](int, const QString &) { readWifi(); });
}

void System::connectWifi(const QString &ssid, const QString &password)
{
    QStringList args = {QStringLiteral("device"), QStringLiteral("wifi"), QStringLiteral("connect"), ssid};
    if (!password.isEmpty())
        args << QStringLiteral("password") << password;
    run(QStringLiteral("nmcli"), args, [this, ssid](int code, const QString &out) {
        Q_EMIT message(code == 0 ? QStringLiteral("Connected to %1").arg(ssid) : QStringLiteral("Couldn't join %1: %2").arg(ssid, out.trimmed().section(QLatin1Char('\n'), -1)), code != 0);
        readWifi();
    });
}

// ---- updates

void System::readUpdate()
{
    run(QStringLiteral("rpm-ostree"), {QStringLiteral("status"), QStringLiteral("--json")}, [this](int, const QString &out) {
        const QJsonArray deployments = QJsonDocument::fromJson(out.toUtf8()).object().value(QStringLiteral("deployments")).toArray();
        QVariantMap u = m_update;
        u.remove(QStringLiteral("staged"));
        for (const QJsonValue &d : deployments) {
            const QJsonObject o = d.toObject();
            const QString when = QLocale().toString(QDateTime::fromSecsSinceEpoch(o.value(QStringLiteral("timestamp")).toInteger()).date(), QLocale::LongFormat);
            if (o.value(QStringLiteral("booted")).toBool()) {
                u.insert(QStringLiteral("version"), o.value(QStringLiteral("version")).toString());
                u.insert(QStringLiteral("built"), when);
                u.insert(QStringLiteral("image"), o.value(QStringLiteral("container-image-reference")).toString().section(QLatin1Char(':'), 1));
            }
            if (o.value(QStringLiteral("staged")).toBool() || (!o.value(QStringLiteral("booted")).toBool() && deployments.first() == d && deployments.size() > 1 && !deployments.first().toObject().value(QStringLiteral("booted")).toBool()))
                u.insert(QStringLiteral("staged"), o.value(QStringLiteral("version")).toString() + QStringLiteral(" (built ") + when + QLatin1Char(')'));
        }
        m_update = u;
        Q_EMIT updateChanged();
    });
}

void System::checkForUpdate()
{
    m_update.insert(QStringLiteral("state"), QStringLiteral("checking"));
    Q_EMIT updateChanged();
    // checking the image source needs an administrator; KDE shows the password prompt
    run(QStringLiteral("pkexec"), {QStringLiteral("rpm-ostree"), QStringLiteral("upgrade"), QStringLiteral("--check")}, [this](int code, const QString &out) {
        if (code == 126 || code == 127) {
            m_update.insert(QStringLiteral("state"), QString());
        } else if (out.contains(QLatin1String("No updates available")) || out.contains(QLatin1String("No upgrade available"))) {
            m_update.insert(QStringLiteral("state"), QStringLiteral("current"));
        } else if (code == 0 || out.contains(QLatin1String("Update available")) || out.contains(QLatin1String("AvailableUpdate"))) {
            m_update.insert(QStringLiteral("state"), QStringLiteral("available"));
        } else {
            m_update.insert(QStringLiteral("state"), QString());
            Q_EMIT message(QStringLiteral("Couldn't check for updates: ") + out.trimmed().section(QLatin1Char('\n'), -1), true);
        }
        m_update.insert(QStringLiteral("checked"), QLocale().toString(QTime::currentTime(), QLocale::ShortFormat));
        Q_EMIT updateChanged();
    });
}

void System::installUpdate()
{
    m_update.insert(QStringLiteral("state"), QStringLiteral("installing"));
    Q_EMIT updateChanged();
    run(QStringLiteral("pkexec"), {QStringLiteral("rpm-ostree"), QStringLiteral("upgrade")}, [this](int code, const QString &out) {
        m_update.insert(QStringLiteral("state"), code == 0 ? QStringLiteral("ready") : QString());
        if (code != 0 && code != 126)
            Q_EMIT message(QStringLiteral("The update didn't install: ") + out.trimmed().section(QLatin1Char('\n'), -1), true);
        Q_EMIT updateChanged();
        readUpdate();
    });
}

void System::restart()
{
    QProcess::startDetached(QStringLiteral("qdbus-qt6"), {QStringLiteral("org.kde.LogoutPrompt"), QStringLiteral("/LogoutPrompt"), QStringLiteral("promptReboot")});
}

// ---- about and KDE pages

QVariantMap System::about() const
{
    QString cpu;
    QFile f(QStringLiteral("/proc/cpuinfo"));
    if (f.open(QIODevice::ReadOnly)) {
        for (const QString &line : QString::fromUtf8(f.readAll()).split(QLatin1Char('\n'))) {
            if (line.startsWith(QLatin1String("model name")) || line.startsWith(QLatin1String("Model"))) {
                cpu = line.section(QLatin1Char(':'), 1).trimmed();
                break;
            }
        }
    }
    if (cpu.isEmpty())
        cpu = QSysInfo::currentCpuArchitecture();
    QFile mem(QStringLiteral("/proc/meminfo"));
    qint64 memBytes = 0;
    if (mem.open(QIODevice::ReadOnly))
        memBytes = QString::fromUtf8(mem.readLine()).section(QLatin1Char(':'), 1).trimmed().section(QLatin1Char(' '), 0, 0).toLongLong() * 1024;
    const QStorageInfo st(QDir::homePath());
    KFormat fmt;
    return {{QStringLiteral("name"), osRelease(QStringLiteral("NAME"))},
            {QStringLiteral("pretty"), osRelease(QStringLiteral("PRETTY_NAME"))},
            {QStringLiteral("version"), osRelease(QStringLiteral("OSTREE_VERSION")).isEmpty() ? osRelease(QStringLiteral("VERSION_ID")) : osRelease(QStringLiteral("OSTREE_VERSION"))},
            {QStringLiteral("device"), QSysInfo::machineHostName()},
            {QStringLiteral("cpu"), cpu},
            {QStringLiteral("cores"), QThread::idealThreadCount()},
            {QStringLiteral("memory"), fmt.formatByteSize(double(memBytes), 0)},
            {QStringLiteral("storage"), fmt.formatByteSize(double(st.bytesTotal()), 0)},
            {QStringLiteral("free"), fmt.formatByteSize(double(st.bytesAvailable()), 0)},
            {QStringLiteral("kernel"), QSysInfo::kernelVersion()}};
}

void System::openKdePage(const QString &kcm)
{
    QProcess::startDetached(QStringLiteral("systemsettings"), {kcm});
}
