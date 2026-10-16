#include "power.h"

#include <KConfig>
#include <KConfigGroup>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

// PowerDevil's actions (PowerDevil::PowerButtonAction)
enum { NoAction = 0, Sleep = 1, Hibernate = 2, Shutdown = 8, AskWhatToDo = 16, LockScreen = 32, TurnOffScreen = 64 };

static const QString PP_SERVICE = QStringLiteral("org.freedesktop.UPower.PowerProfiles");
static const QString PP_PATH = QStringLiteral("/org/freedesktop/UPower/PowerProfiles");

// one D-Bus property read with busctl --json: {"type": ..., "data": ...} per line
static QJsonValue jsonData(const QString &line)
{
    return QJsonDocument::fromJson(line.toUtf8()).object().value(QStringLiteral("data"));
}

PowerArea::PowerArea(QObject *parent)
    : Area(parent)
{
}

void PowerArea::refresh()
{
    readProfiles();
    readBattery();
    readTimers();
}

void PowerArea::readProfiles()
{
    run(QStringLiteral("busctl"), {QStringLiteral("--system"), QStringLiteral("--json=short"), QStringLiteral("get-property"), PP_SERVICE, PP_PATH, PP_SERVICE, QStringLiteral("Profiles"), QStringLiteral("ActiveProfile")},
        [this](int code, const QString &out) {
            QVariantList offered;
            QString active;
            if (code == 0) {
                const QStringList lines = out.split(QLatin1Char('\n'), Qt::SkipEmptyParts);
                if (lines.size() >= 2) {
                    for (const QJsonValue &p : jsonData(lines.at(0)).toArray())
                        offered.append(p.toObject().value(QStringLiteral("Profile")).toObject().value(QStringLiteral("data")).toString());
                    active = jsonData(lines.at(1)).toString();
                }
            }
            put(QStringLiteral("profiles"), offered);
            put(QStringLiteral("profile"), active);
        });
}

void PowerArea::readBattery()
{
    run(QStringLiteral("busctl"), {QStringLiteral("--system"), QStringLiteral("--json=short"), QStringLiteral("get-property"), QStringLiteral("org.freedesktop.UPower"),
                                   QStringLiteral("/org/freedesktop/UPower/devices/DisplayDevice"), QStringLiteral("org.freedesktop.UPower.Device"),
                                   QStringLiteral("IsPresent"), QStringLiteral("Percentage"), QStringLiteral("State"), QStringLiteral("TimeToEmpty"), QStringLiteral("TimeToFull")},
        [this](int code, const QString &out) {
            const QStringList l = out.split(QLatin1Char('\n'), Qt::SkipEmptyParts);
            const bool ok = code == 0 && l.size() >= 5;
            QVariantMap b;
            b[QStringLiteral("present")] = ok && jsonData(l.at(0)).toBool();
            if (ok) {
                b[QStringLiteral("percent")] = qRound(jsonData(l.at(1)).toDouble());
                // UPower: 1 charging, 2 discharging, 3 empty, 4 fully charged, 5 pending charge, 6 pending discharge
                b[QStringLiteral("state")] = jsonData(l.at(2)).toInt();
                b[QStringLiteral("toEmpty")] = jsonData(l.at(3)).toVariant().toLongLong();
                b[QStringLiteral("toFull")] = jsonData(l.at(4)).toVariant().toLongLong();
            }
            put(QStringLiteral("battery"), b);
        });
}

void PowerArea::readTimers()
{
    KConfig cfg(QStringLiteral("powerdevilrc"));
    // PowerDevil 6's defaults when a key isn't written yet
    auto profile = [&cfg](const QString &name, int dim, int off, int sleep) {
        const KConfigGroup d = cfg.group(name).group(QStringLiteral("Display"));
        const KConfigGroup s = cfg.group(name).group(QStringLiteral("SuspendAndShutdown"));
        QVariantMap m;
        m[QStringLiteral("dim")] = d.readEntry("DimDisplayWhenIdle", true) ? d.readEntry("DimDisplayIdleTimeoutSec", dim) : 0;
        m[QStringLiteral("screenOff")] = d.readEntry("TurnOffDisplayWhenIdle", true) ? d.readEntry("TurnOffDisplayIdleTimeoutSec", off) : 0;
        m[QStringLiteral("sleep")] = s.readEntry("AutoSuspendAction", int(Sleep)) != NoAction ? s.readEntry("AutoSuspendIdleTimeoutSec", sleep) : 0;
        m[QStringLiteral("powerButton")] = s.readEntry("PowerButtonAction", int(AskWhatToDo));
        m[QStringLiteral("lid")] = s.readEntry("LidAction", int(Sleep));
        m[QStringLiteral("lidWithMonitor")] = !s.readEntry("InhibitLidActionWhenExternalMonitorPresent", true);
        return m;
    };
    put(QStringLiteral("ac"), profile(QStringLiteral("AC"), 300, 600, 900));
    put(QStringLiteral("onBattery"), profile(QStringLiteral("Battery"), 120, 300, 600));
    put(QStringLiteral("critical"), cfg.group(QStringLiteral("BatteryManagement")).readEntry("BatteryCriticalAction", int(Sleep)));
    put(QStringLiteral("pauseMedia"), cfg.group(QStringLiteral("General")).readEntry("pausePlayersOnSuspend", true));
}

// PowerDevil reads its file again (reparseConfiguration, then refreshStatus applies it)
void PowerArea::reloadPowerDevil()
{
    for (const char *m : {"reparseConfiguration", "refreshStatus"})
        QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(QStringLiteral("org.kde.Solid.PowerManagement"), QStringLiteral("/org/kde/Solid/PowerManagement"),
                                                                               QStringLiteral("org.kde.Solid.PowerManagement"), QString::fromLatin1(m)));
}

void PowerArea::set(const QString &key, const QVariant &value)
{
    if (key == QLatin1String("profile")) {
        const QString p = value.toString();
        if (!m_state.value(QStringLiteral("profiles")).toList().contains(p))
            return;
        run(QStringLiteral("busctl"), {QStringLiteral("--system"), QStringLiteral("set-property"), PP_SERVICE, PP_PATH, PP_SERVICE, QStringLiteral("ActiveProfile"), QStringLiteral("s"), p},
            [this](int code, const QString &out) {
                if (code != 0)
                    Q_EMIT message(QStringLiteral("Couldn't change the power mode: ") + out.trimmed().left(200), true);
                readProfiles();
            });
        return;
    }

    KConfig cfg(QStringLiteral("powerdevilrc"));
    const int n = value.toInt();
    const auto allowed = [](int a, std::initializer_list<int> ok) { return std::find(ok.begin(), ok.end(), a) != ok.end(); };
    // "ac.dim", "onBattery.screenOff", ...: one of the two profiles
    const QString prof = key.section(QLatin1Char('.'), 0, 0);
    const QString what = key.section(QLatin1Char('.'), 1);
    if ((prof == QLatin1String("ac") || prof == QLatin1String("onBattery")) && !what.isEmpty()) {
        KConfigGroup g = cfg.group(prof == QLatin1String("ac") ? QStringLiteral("AC") : QStringLiteral("Battery"));
        KConfigGroup d = g.group(QStringLiteral("Display"));
        KConfigGroup s = g.group(QStringLiteral("SuspendAndShutdown"));
        const int secs = qBound(0, n, 24 * 3600);
        if (what == QLatin1String("dim")) {
            d.writeEntry("DimDisplayWhenIdle", secs > 0, KConfig::Notify);
            if (secs > 0)
                d.writeEntry("DimDisplayIdleTimeoutSec", secs, KConfig::Notify);
        } else if (what == QLatin1String("screenOff")) {
            d.writeEntry("TurnOffDisplayWhenIdle", secs > 0, KConfig::Notify);
            if (secs > 0)
                d.writeEntry("TurnOffDisplayIdleTimeoutSec", secs, KConfig::Notify);
        } else if (what == QLatin1String("sleep")) {
            s.writeEntry("AutoSuspendAction", secs > 0 ? int(Sleep) : int(NoAction), KConfig::Notify);
            if (secs > 0)
                s.writeEntry("AutoSuspendIdleTimeoutSec", secs, KConfig::Notify);
        } else {
            return;
        }
    } else if (key == QLatin1String("powerButton") || key == QLatin1String("lid")) {
        // the same on battery and plugged in, as most people expect
        if (!allowed(n, {NoAction, Sleep, Hibernate, Shutdown, AskWhatToDo, LockScreen, TurnOffScreen}))
            return;
        for (const QString &p : {QStringLiteral("AC"), QStringLiteral("Battery"), QStringLiteral("LowBattery")})
            cfg.group(p).group(QStringLiteral("SuspendAndShutdown")).writeEntry(key == QLatin1String("lid") ? "LidAction" : "PowerButtonAction", n, KConfig::Notify);
    } else if (key == QLatin1String("lidWithMonitor")) {
        for (const QString &p : {QStringLiteral("AC"), QStringLiteral("Battery"), QStringLiteral("LowBattery")})
            cfg.group(p).group(QStringLiteral("SuspendAndShutdown")).writeEntry("InhibitLidActionWhenExternalMonitorPresent", !value.toBool(), KConfig::Notify);
    } else if (key == QLatin1String("critical")) {
        if (!allowed(n, {NoAction, Sleep, Hibernate, Shutdown}))
            return;
        cfg.group(QStringLiteral("BatteryManagement")).writeEntry("BatteryCriticalAction", n, KConfig::Notify);
    } else if (key == QLatin1String("pauseMedia")) {
        cfg.group(QStringLiteral("General")).writeEntry("pausePlayersOnSuspend", value.toBool(), KConfig::Notify);
    } else {
        return;
    }
    cfg.sync();
    reloadPowerDevil();
    readTimers();
}

void PowerArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
