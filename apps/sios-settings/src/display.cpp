#include "display.h"

#include <KConfig>
#include <KConfigGroup>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTime>

#include <algorithm>
#include <cmath>

// KScreen's rotation numbers and kscreen-doctor's words for them
static QString rotationName(int r)
{
    switch (r) {
    case 2:
        return QStringLiteral("left");
    case 4:
        return QStringLiteral("inverted");
    case 8:
        return QStringLiteral("right");
    default:
        return QStringLiteral("none");
    }
}

// a scale as kscreen-doctor takes it: 1, 1.25, 2
static QString scaleArg(double s)
{
    return QString::number(std::round(s * 100.0) / 100.0, 'g', 4);
}

DisplayArea::DisplayArea(QObject *parent)
    : Area(parent)
{
    // unconfirmed changes go back on their own, even if the question never showed
    m_revert.setSingleShot(true);
    m_revert.setInterval(17000);
    connect(&m_revert, &QTimer::timeout, this, [this] { act(QStringLiteral("revert"), {}); });
}

void DisplayArea::refresh()
{
    readScreens();
    readNight();
}

void DisplayArea::readScreens()
{
    run(QStringLiteral("kscreen-doctor"), {QStringLiteral("-j")}, [this](int code, const QString &out) {
        // warnings may come before the JSON
        const int start = out.indexOf(QLatin1Char('{'));
        const QJsonObject root = start >= 0 ? QJsonDocument::fromJson(out.mid(start).toUtf8()).object() : QJsonObject();
        if (code != 0 || root.isEmpty()) {
            m_screens.clear();
            put(QStringLiteral("screens"), QVariantList());
            put(QStringLiteral("error"), QStringLiteral("SIOS couldn't read the screens."));
            return;
        }
        QVariantList screens;
        for (const QJsonValue &v : root.value(QStringLiteral("outputs")).toArray()) {
            const QJsonObject o = v.toObject();
            if (!o.value(QStringLiteral("connected")).toBool())
                continue;
            const QString current = o.value(QStringLiteral("currentModeId")).toString();
            // sizes, biggest first; each with its refresh rates
            QList<QVariantMap> sizes;
            QVariantMap cur;
            for (const QJsonValue &mv : o.value(QStringLiteral("modes")).toArray()) {
                const QJsonObject m = mv.toObject();
                const int w = m.value(QStringLiteral("size")).toObject().value(QStringLiteral("width")).toInt();
                const int h = m.value(QStringLiteral("size")).toObject().value(QStringLiteral("height")).toInt();
                const double hz = m.value(QStringLiteral("refreshRate")).toDouble();
                const QString id = m.value(QStringLiteral("id")).toString();
                auto it = std::find_if(sizes.begin(), sizes.end(), [w, h](const QVariantMap &s) { return s[QStringLiteral("w")].toInt() == w && s[QStringLiteral("h")].toInt() == h; });
                if (it == sizes.end()) {
                    sizes.append({{QStringLiteral("w"), w}, {QStringLiteral("h"), h}, {QStringLiteral("label"), QStringLiteral("%1 × %2").arg(w).arg(h)}, {QStringLiteral("rates"), QVariantList()}});
                    it = sizes.end() - 1;
                }
                QVariantList rates = (*it)[QStringLiteral("rates")].toList();
                rates.append(QVariantMap{{QStringLiteral("id"), id}, {QStringLiteral("hz"), hz}, {QStringLiteral("label"), QStringLiteral("%1 Hz").arg(QString::number(hz, 'f', hz == std::floor(hz) ? 0 : 2))}});
                (*it)[QStringLiteral("rates")] = rates;
                if (id == current)
                    cur = {{QStringLiteral("w"), w}, {QStringLiteral("h"), h}, {QStringLiteral("hz"), hz}, {QStringLiteral("modeId"), id}};
            }
            std::sort(sizes.begin(), sizes.end(), [](const QVariantMap &a, const QVariantMap &b) {
                return a[QStringLiteral("w")].toInt() * a[QStringLiteral("h")].toInt() > b[QStringLiteral("w")].toInt() * b[QStringLiteral("h")].toInt();
            });
            QVariantList sizeList;
            for (const QVariantMap &s : sizes)
                sizeList.append(s);
            const int type = o.value(QStringLiteral("type")).toInt();
            const QString name = o.value(QStringLiteral("name")).toString();
            // a laptop's panel says so; anything else goes by its connector name
            const bool panel = type == 7 || type == 14 || name.startsWith(QLatin1String("eDP")) || name.startsWith(QLatin1String("LVDS"));
            screens.append(QVariantMap{
                {QStringLiteral("id"), o.value(QStringLiteral("id")).toInt()},
                {QStringLiteral("name"), name},
                {QStringLiteral("label"), panel ? QStringLiteral("Built-in screen") : name},
                {QStringLiteral("enabled"), o.value(QStringLiteral("enabled")).toBool()},
                {QStringLiteral("primary"), o.value(QStringLiteral("priority")).toInt() == 1},
                {QStringLiteral("sizes"), sizeList},
                {QStringLiteral("current"), cur},
                {QStringLiteral("scale"), o.value(QStringLiteral("scale")).toDouble()},
                {QStringLiteral("rotation"), rotationName(o.value(QStringLiteral("rotation")).toInt())},
                {QStringLiteral("brightness"), qRound(o.value(QStringLiteral("brightness")).toDouble(1.0) * 100)},
                {QStringLiteral("icc"), o.value(QStringLiteral("iccProfilePath")).toString()},
                {QStringLiteral("x"), o.value(QStringLiteral("pos")).toObject().value(QStringLiteral("x")).toInt()},
                {QStringLiteral("width"), o.value(QStringLiteral("size")).toObject().value(QStringLiteral("width")).toInt()},
            });
        }
        m_screens = screens;
        m_state.remove(QStringLiteral("error"));
        put(QStringLiteral("screens"), screens);
    });
}

void DisplayArea::readNight()
{
    KConfig kwin(QStringLiteral("kwinrc"));
    const KConfigGroup night = kwin.group(QStringLiteral("NightColor"));
    const KConfigGroup sched = KConfig(QStringLiteral("knighttimerc")).group(QStringLiteral("General"));
    const bool always = night.readEntry("Mode", QStringLiteral("DarkLight")) == QLatin1String("Constant");
    const bool times = sched.readEntry("Source", QStringLiteral("Automatic")) == QLatin1String("Times");
    const QTime sunset = sched.readEntry("SunsetStart", QTime(18, 0));
    const QTime sunrise = sched.readEntry("SunriseStart", QTime(6, 0));
    put(QStringLiteral("night"), QVariantMap{
        {QStringLiteral("active"), night.readEntry("Active", false)},
        {QStringLiteral("schedule"), always ? QStringLiteral("always") : times ? QStringLiteral("times") : QStringLiteral("auto")},
        {QStringLiteral("temperature"), night.readEntry("NightTemperature", 4500)},
        {QStringLiteral("sunset"), sunset.toString(QStringLiteral("HH:mm"))},
        {QStringLiteral("sunrise"), sunrise.toString(QStringLiteral("HH:mm"))},
    });
    put(QStringLiteral("tearing"), kwin.group(QStringLiteral("Compositing")).readEntry("AllowTearing", true));
    // true: old X11 apps draw at full size themselves (sharp); false: the system scales them (blurry, right size)
    put(QStringLiteral("x11Self"), kwin.group(QStringLiteral("Xwayland")).readEntry("XwaylandClientsScale", true));
}

QVariantMap DisplayArea::screen(int id) const
{
    for (const QVariant &s : m_screens)
        if (s.toMap()[QStringLiteral("id")].toInt() == id)
            return s.toMap();
    return {};
}

QStringList DisplayArea::undoFor(const QVariantMap &s) const
{
    const QString o = QStringLiteral("output.%1.").arg(s[QStringLiteral("id")].toInt());
    return {o + QStringLiteral("mode.") + s[QStringLiteral("current")].toMap()[QStringLiteral("modeId")].toString(),
            o + QStringLiteral("scale.") + scaleArg(s[QStringLiteral("scale")].toDouble()),
            o + QStringLiteral("rotation.") + s[QStringLiteral("rotation")].toString()};
}

void DisplayArea::apply(const QStringList &args, const QStringList &undo)
{
    run(QStringLiteral("kscreen-doctor"), args, [this, undo](int code, const QString &out) {
        if (code != 0) {
            Q_EMIT message(QStringLiteral("The screen didn't change: %1").arg(out.trimmed().left(200)), true);
            readScreens();
            return;
        }
        if (!undo.isEmpty()) {
            m_pendingUndo = undo;
            m_revert.start();
            put(QStringLiteral("confirm"), true);
        }
        readScreens();
    });
}

void DisplayArea::kwinReconfigure()
{
    QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"), QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
}

void DisplayArea::set(const QString &key, const QVariant &value)
{
    const QVariantMap v = value.toMap();
    const int id = v[QStringLiteral("screen")].toInt();
    const QVariantMap s = screen(id);
    const QString o = QStringLiteral("output.%1.").arg(id);

    // ---- the screen (resolution, refresh, scale and rotation ask to keep)
    if (key == QLatin1String("size") || key == QLatin1String("refresh")) {
        if (s.isEmpty() || !m_pendingUndo.isEmpty())
            return;
        const QVariantMap cur = s[QStringLiteral("current")].toMap();
        const int w = key == QLatin1String("size") ? v[QStringLiteral("w")].toInt() : cur[QStringLiteral("w")].toInt();
        const int h = key == QLatin1String("size") ? v[QStringLiteral("h")].toInt() : cur[QStringLiteral("h")].toInt();
        const double want = key == QLatin1String("refresh") ? v[QStringLiteral("hz")].toDouble() : cur[QStringLiteral("hz")].toDouble();
        // the mode of that size whose refresh rate is closest
        QString best;
        double gap = 1e9;
        for (const QVariant &sv : s[QStringLiteral("sizes")].toList()) {
            const QVariantMap sz = sv.toMap();
            if (sz[QStringLiteral("w")].toInt() != w || sz[QStringLiteral("h")].toInt() != h)
                continue;
            for (const QVariant &rv : sz[QStringLiteral("rates")].toList()) {
                const double d = std::abs(rv.toMap()[QStringLiteral("hz")].toDouble() - want);
                if (d < gap) {
                    gap = d;
                    best = rv.toMap()[QStringLiteral("id")].toString();
                }
            }
        }
        if (!best.isEmpty() && best != cur[QStringLiteral("modeId")].toString())
            apply({o + QStringLiteral("mode.") + best}, undoFor(s));
    } else if (key == QLatin1String("scale")) {
        const double scale = std::clamp(v[QStringLiteral("value")].toDouble(), 1.0, 3.0);
        if (!s.isEmpty() && m_pendingUndo.isEmpty() && std::abs(scale - s[QStringLiteral("scale")].toDouble()) > 0.001)
            apply({o + QStringLiteral("scale.") + scaleArg(scale)}, undoFor(s));
    } else if (key == QLatin1String("rotation")) {
        const QString r = v[QStringLiteral("value")].toString();
        if (!s.isEmpty() && m_pendingUndo.isEmpty() && QStringList{QStringLiteral("none"), QStringLiteral("left"), QStringLiteral("right"), QStringLiteral("inverted")}.contains(r) && r != s[QStringLiteral("rotation")].toString())
            apply({o + QStringLiteral("rotation.") + r}, undoFor(s));
    } else if (key == QLatin1String("brightness")) {
        if (!s.isEmpty())
            apply({o + QStringLiteral("brightness.") + QString::number(std::clamp(v[QStringLiteral("value")].toInt(), 1, 100))});
    } else if (key == QLatin1String("primary")) {
        if (!s.isEmpty())
            apply({o + QStringLiteral("priority.1")});
    } else if (key == QLatin1String("side")) {
        // put this screen left or right of the main one, tops lined up
        QVariantMap main;
        for (const QVariant &sv : m_screens)
            if (sv.toMap()[QStringLiteral("primary")].toBool())
                main = sv.toMap();
        if (s.isEmpty() || main.isEmpty() || main[QStringLiteral("id")] == s[QStringLiteral("id")])
            return;
        const int mainW = std::lround(main[QStringLiteral("width")].toInt() / std::max(0.1, main[QStringLiteral("scale")].toDouble()));
        const int thisW = std::lround(s[QStringLiteral("width")].toInt() / std::max(0.1, s[QStringLiteral("scale")].toDouble()));
        const bool left = v[QStringLiteral("value")].toString() == QLatin1String("left");
        const QString mo = QStringLiteral("output.%1.position.").arg(main[QStringLiteral("id")].toInt());
        apply(left ? QStringList{o + QStringLiteral("position.0,0"), mo + QStringLiteral("%1,0").arg(thisW)}
                   : QStringList{mo + QStringLiteral("0,0"), o + QStringLiteral("position.%1,0").arg(mainW)});
    } else if (key == QLatin1String("icc")) {
        // a colour profile: none (sRGB), the screen's own (EDID), or a file
        const QString src = v[QStringLiteral("source")].toString();
        if (s.isEmpty())
            return;
        if (src == QLatin1String("file")) {
            const QString path = v[QStringLiteral("path")].toString();
            if (path.isEmpty() || path.contains(QLatin1Char('"')))
                return;
            apply({o + QStringLiteral("iccprofile.") + path, o + QStringLiteral("colorProfileSource.ICC")});
        } else {
            apply({o + QStringLiteral("colorProfileSource.") + (src == QLatin1String("edid") ? QStringLiteral("EDID") : QStringLiteral("sRGB"))});
        }

    // ---- Night Light and the rest (KDE's settings, then KWin re-reads them)
    } else if (key == QLatin1String("nightActive") || key == QLatin1String("nightSchedule") || key == QLatin1String("nightTemp")) {
        KConfig kwin(QStringLiteral("kwinrc"));
        KConfigGroup night = kwin.group(QStringLiteral("NightColor"));
        if (key == QLatin1String("nightActive"))
            night.writeEntry("Active", value.toBool(), KConfig::Notify);
        else if (key == QLatin1String("nightTemp"))
            night.writeEntry("NightTemperature", std::clamp(value.toInt(), 1000, 6500), KConfig::Notify);
        else {
            const QString sch = value.toString();
            night.writeEntry("Mode", sch == QLatin1String("always") ? QStringLiteral("Constant") : QStringLiteral("DarkLight"), KConfig::Notify);
            if (sch != QLatin1String("always")) {
                KConfig nt(QStringLiteral("knighttimerc"));
                nt.group(QStringLiteral("General")).writeEntry("Source", sch == QLatin1String("times") ? QStringLiteral("Times") : QStringLiteral("Automatic"), KConfig::Notify);
                nt.sync();
            }
        }
        kwin.sync();
        kwinReconfigure();
        readNight();
    } else if (key == QLatin1String("sunset") || key == QLatin1String("sunrise")) {
        const QTime t = QTime::fromString(value.toString(), QStringLiteral("HH:mm"));
        if (!t.isValid())
            return;
        KConfig nt(QStringLiteral("knighttimerc"));
        nt.group(QStringLiteral("General")).writeEntry(key == QLatin1String("sunset") ? "SunsetStart" : "SunriseStart", t, KConfig::Notify);
        nt.sync();
        readNight();
    } else if (key == QLatin1String("tearing") || key == QLatin1String("x11Self")) {
        KConfig kwin(QStringLiteral("kwinrc"));
        if (key == QLatin1String("tearing"))
            kwin.group(QStringLiteral("Compositing")).writeEntry("AllowTearing", value.toBool(), KConfig::Notify);
        else
            kwin.group(QStringLiteral("Xwayland")).writeEntry("XwaylandClientsScale", value.toBool(), KConfig::Notify);
        kwin.sync();
        kwinReconfigure();
        readNight();
    }
}

void DisplayArea::act(const QString &name, const QVariantMap &params)
{
    if (name == QLatin1String("keep")) {
        m_revert.stop();
        m_pendingUndo.clear();
        put(QStringLiteral("confirm"), false);
        Q_EMIT message(QStringLiteral("Kept the new screen settings."), false);
    } else if (name == QLatin1String("revert")) {
        m_revert.stop();
        const QStringList undo = m_pendingUndo;
        m_pendingUndo.clear();
        put(QStringLiteral("confirm"), false);
        if (!undo.isEmpty()) {
            apply(undo);
            Q_EMIT message(QStringLiteral("Went back to the screen settings you had."), false);
        }
    } else if (name == QLatin1String("previewWarmth")) {
        // show a warmth while the slider moves, without saving it
        QDBusMessage m = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/org/kde/KWin/NightLight"), QStringLiteral("org.kde.KWin.NightLight"), QStringLiteral("preview"));
        m << static_cast<uint>(std::clamp(params.value(QStringLiteral("k")).toInt(), 1000, 6500));
        QDBusConnection::sessionBus().asyncCall(m);
    } else if (name == QLatin1String("stopPreview")) {
        QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/org/kde/KWin/NightLight"), QStringLiteral("org.kde.KWin.NightLight"), QStringLiteral("stopPreview")));
    }
}
