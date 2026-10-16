#include "clock.h"

#include <KConfig>
#include <KConfigGroup>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCallWatcher>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLocale>
#include <QRegularExpression>
#include <QTimer>

// the top bar clock's date formats SIOS offers (Qt date formats)
static const QStringList DATE_FORMATS = {QStringLiteral("ddd, MMM d"), QStringLiteral("ddd d MMM"), QStringLiteral("MMM d"), QStringLiteral("yyyy-MM-dd")};

ClockArea::ClockArea(QObject *parent)
    : Area(parent)
{
}

void ClockArea::refresh()
{
    readTime();
    readClockWidget();
    if (m_zones.isEmpty()) {
        run(QStringLiteral("timedatectl"), {QStringLiteral("list-timezones"), QStringLiteral("--no-pager")}, [this](int code, const QString &out) {
            if (code != 0)
                return;
            m_zones = out.split(QLatin1Char('\n'), Qt::SkipEmptyParts);
            put(QStringLiteral("zones"), m_zones);
        });
    }
}

void ClockArea::readTime()
{
    run(QStringLiteral("timedatectl"), {QStringLiteral("show")}, [this](int code, const QString &out) {
        QVariantMap t;
        for (const QString &line : out.split(QLatin1Char('\n'), Qt::SkipEmptyParts))
            t.insert(line.section(QLatin1Char('='), 0, 0), line.section(QLatin1Char('='), 1));
        put(QStringLiteral("available"), code == 0);
        put(QStringLiteral("ntp"), t.value(QStringLiteral("NTP")).toString() == QLatin1String("yes"));
        put(QStringLiteral("canNtp"), t.value(QStringLiteral("CanNTP")).toString() == QLatin1String("yes"));
        put(QStringLiteral("synced"), t.value(QStringLiteral("NTPSynchronized")).toString() == QLatin1String("yes"));
        put(QStringLiteral("timezone"), t.value(QStringLiteral("Timezone")).toString());
    });
}

// the digital clock in the SIOS top bar: its Appearance settings
void ClockArea::readClockWidget()
{
    KConfig cfg(QStringLiteral("plasma-org.kde.plasma.desktop-appletsrc"), KConfig::SimpleConfig);
    const KConfigGroup conts = cfg.group(QStringLiteral("Containments"));
    KConfigGroup look;
    bool found = false;
    for (const QString &c : conts.groupList()) {
        const KConfigGroup applets = conts.group(c).group(QStringLiteral("Applets"));
        for (const QString &a : applets.groupList()) {
            if (applets.group(a).readEntry("plugin", QString()) == QLatin1String("org.kde.plasma.digitalclock")) {
                look = applets.group(a).group(QStringLiteral("Configuration")).group(QStringLiteral("Appearance"));
                found = true;
                break;
            }
        }
        if (found)
            break;
    }
    put(QStringLiteral("hasClock"), found);
    // 0 12-hour, 1 the region's way, 2 24-hour
    const int h = found ? look.readEntry("use24hFormat", 1) : 1;
    const bool regionIs24 = !QLocale().timeFormat(QLocale::ShortFormat).contains(QLatin1String("ap"), Qt::CaseInsensitive);
    put(QStringLiteral("h24"), h == 2 || (h == 1 && regionIs24));
    put(QStringLiteral("seconds"), found && look.readEntry("showSeconds", 0) == 2);
    // -1 the region's first day, 0 Sunday ... 6 Saturday
    put(QStringLiteral("firstDay"), found ? look.readEntry("firstDayOfWeek", -1) : -1);
    put(QStringLiteral("regionFirstDay"), QLocale().firstDayOfWeek() % 7);
    put(QStringLiteral("dateFormat"), found ? look.readEntry("customDateFormat", DATE_FORMATS.first()) : DATE_FORMATS.first());
    put(QStringLiteral("dateFormats"), DATE_FORMATS);
}

// one Appearance setting on every digital clock in the panels, through Plasma's
// own scripting call; the value is ours (a number or a JSON string), never typed text
void ClockArea::writeClockWidget(const QString &key, const QString &jsValue)
{
    const QString script = QStringLiteral(
        "for (const p of panels()) for (const w of p.widgets(\"org.kde.plasma.digitalclock\")) "
        "{ w.currentConfigGroup = [\"Appearance\"]; w.writeConfig(\"%1\", %2); }").arg(key, jsValue);
    QDBusMessage m = QDBusMessage::createMethodCall(QStringLiteral("org.kde.plasmashell"), QStringLiteral("/PlasmaShell"), QStringLiteral("org.kde.PlasmaShell"), QStringLiteral("evaluateScript"));
    m << script;
    auto *w = new QDBusPendingCallWatcher(QDBusConnection::sessionBus().asyncCall(m), this);
    connect(w, &QDBusPendingCallWatcher::finished, this, [this, w] {
        if (w->isError())
            Q_EMIT message(QStringLiteral("Couldn't change the clock: ") + w->error().message(), true);
        w->deleteLater();
        // Plasma writes its file a moment later
        QTimer::singleShot(800, this, [this] { readClockWidget(); });
    });
}

void ClockArea::set(const QString &key, const QVariant &value)
{
    auto after = [this](const QString &what) {
        return [this, what](int code, const QString &out) {
            // a closed password window is a quiet note, anything else an error window
            if (code != 0 && (out.contains(QLatin1String("Access denied")) || out.contains(QLatin1String("dismissed"), Qt::CaseInsensitive)))
                Q_EMIT message(QStringLiteral("Nothing changed: the password wasn't given."), false);
            else if (code != 0)
                Q_EMIT message(QStringLiteral("Couldn't change ") + what + QStringLiteral(": ") + out.trimmed().left(200), true);
            readTime();
        };
    };
    if (key == QLatin1String("ntp")) {
        run(QStringLiteral("timedatectl"), {QStringLiteral("set-ntp"), value.toBool() ? QStringLiteral("true") : QStringLiteral("false")}, after(QStringLiteral("automatic time")));
    } else if (key == QLatin1String("timezone")) {
        // only a zone from systemd's own list
        if (!m_zones.contains(value.toString()))
            return;
        run(QStringLiteral("timedatectl"), {QStringLiteral("set-timezone"), value.toString()}, after(QStringLiteral("the time zone")));
    } else if (key == QLatin1String("time")) {
        // "YYYY-MM-DD HH:MM", only while automatic time is off
        static const QRegularExpression when(QStringLiteral("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$"));
        const QString t = value.toString().trimmed();
        if (!when.match(t).hasMatch() || m_state.value(QStringLiteral("ntp")).toBool())
            return;
        run(QStringLiteral("timedatectl"), {QStringLiteral("set-time"), t + QStringLiteral(":00")}, after(QStringLiteral("the date and time")));
    } else if (key == QLatin1String("h24")) {
        writeClockWidget(QStringLiteral("use24hFormat"), value.toBool() ? QStringLiteral("2") : QStringLiteral("0"));
    } else if (key == QLatin1String("seconds")) {
        writeClockWidget(QStringLiteral("showSeconds"), value.toBool() ? QStringLiteral("2") : QStringLiteral("0"));
    } else if (key == QLatin1String("firstDay")) {
        const int d = value.toInt();
        if (d < -1 || d > 6)
            return;
        writeClockWidget(QStringLiteral("firstDayOfWeek"), QString::number(d));
    } else if (key == QLatin1String("dateFormat")) {
        if (!DATE_FORMATS.contains(value.toString()))
            return;
        writeClockWidget(QStringLiteral("dateFormat"), QStringLiteral("\"custom\""));
        writeClockWidget(QStringLiteral("customDateFormat"), QString::fromUtf8(QJsonDocument(QJsonArray{value.toString()}).toJson(QJsonDocument::Compact)).mid(1).chopped(1));
    }
}

void ClockArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
