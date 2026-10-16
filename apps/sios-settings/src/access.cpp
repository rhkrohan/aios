#include "access.h"

#include <KConfig>
#include <KConfigGroup>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDir>
#include <QFile>
#include <QFont>
#include <QProcess>
#include <QStandardPaths>

#include <algorithm>
#include <cmath>

// SIOS's own font sizes (the kde-profile kdeglobals); larger text scales these
struct FontKey {
    const char *group;
    const char *key;
    double size;
};
static const FontKey FONTS[] = {
    {"General", "font", 10}, {"General", "menuFont", 10}, {"General", "toolBarFont", 9},
    {"General", "smallestReadableFont", 8}, {"General", "desktopFont", 10}, {"WM", "activeFont", 10},
};
static const char *CONTRAST = "SIOSHighContrast";

AccessArea::AccessArea(QObject *parent)
    : Area(parent)
{
}

void AccessArea::refresh()
{
    KConfig globals(QStringLiteral("kdeglobals"));
    const KConfig access(QStringLiteral("kaccessrc"));
    const KConfigGroup keys = access.group(QStringLiteral("Keyboard"));
    const double motion = globals.group(QStringLiteral("KDE")).readEntry("AnimationDurationFactor", 1.0);
    replace({
        {QStringLiteral("textScale"), globals.group(QStringLiteral("SIOS")).readEntry("TextScale", 100)},
        {QStringLiteral("reduceMotion"), motion <= 0.0},
        {QStringLiteral("motionSpeed"), motion <= 0.0 ? 1.0 : motion},
        {QStringLiteral("highContrast"), globals.group(QStringLiteral("General")).readEntry("ColorScheme", QString()) == QLatin1String(CONTRAST)},
        {QStringLiteral("cursorSize"), KConfig(QStringLiteral("kcminputrc")).group(QStringLiteral("Mouse")).readEntry("cursorSize", 24)},
        {QStringLiteral("stickyKeys"), keys.readEntry("StickyKeys", false)},
        {QStringLiteral("slowKeys"), keys.readEntry("SlowKeys", false)},
        {QStringLiteral("slowKeysDelay"), keys.readEntry("SlowKeysDelay", 500)},
        {QStringLiteral("bounceKeys"), keys.readEntry("BounceKeys", false)},
        {QStringLiteral("bounceKeysDelay"), keys.readEntry("BounceKeysDelay", 500)},
        {QStringLiteral("visualBell"), access.group(QStringLiteral("Bell")).readEntry("VisibleBell", false)},
        {QStringLiteral("screenReader"), access.group(QStringLiteral("ScreenReader")).readEntry("Enabled", false)},
        {QStringLiteral("orca"), !QStandardPaths::findExecutable(QStringLiteral("orca")).isEmpty()},
        {QStringLiteral("zoom"), KConfig(QStringLiteral("kwinrc")).group(QStringLiteral("Plugins")).readEntry("zoomEnabled", false)},
    });
}

void AccessArea::setTextScale(int percent)
{
    percent = std::clamp(percent, 100, 200);
    KConfig globals(QStringLiteral("kdeglobals"));
    for (const FontKey &f : FONTS) {
        KConfigGroup g = globals.group(QString::fromLatin1(f.group));
        QFont font = g.readEntry(f.key, QFont(QStringLiteral("Instrument Sans"), int(f.size)));
        font.setPointSizeF(std::round(f.size * percent / 10.0) / 10.0);
        g.writeEntry(f.key, font, KConfig::Notify);
    }
    globals.group(QStringLiteral("SIOS")).writeEntry("TextScale", percent);
    globals.sync();
}

void AccessArea::setHighContrast(bool on)
{
    if (on) {
        // SIOS Light with black text, white surfaces and a deeper navy
        const QString src = QStandardPaths::locate(QStandardPaths::GenericDataLocation, QStringLiteral("color-schemes/SIOSLight.colors"));
        if (src.isEmpty()) {
            Q_EMIT message(QStringLiteral("SIOS's colours aren't installed, so high contrast can't be made."), true);
            return;
        }
        const QString dir = QStandardPaths::writableLocation(QStandardPaths::GenericDataLocation) + QStringLiteral("/color-schemes");
        QDir().mkpath(dir);
        const QString out = dir + QStringLiteral("/") + QLatin1String(CONTRAST) + QStringLiteral(".colors");
        QFile::remove(out);
        KConfig from(src, KConfig::SimpleConfig);
        KConfig to(out, KConfig::SimpleConfig);
        for (const QString &name : from.groupList()) {
            const KConfigGroup a = from.group(name);
            KConfigGroup b = to.group(name);
            const QMap<QString, QString> entries = a.entryMap();
            for (auto it = entries.cbegin(); it != entries.cend(); ++it)
                b.writeEntry(it.key(), it.value());
            if (!name.startsWith(QLatin1String("Colors:")) || name == QLatin1String("Colors:Tooltip") || name == QLatin1String("Colors:Complementary"))
                continue;
            if (name == QLatin1String("Colors:Selection")) {
                b.writeEntry("BackgroundNormal", QStringLiteral("20,45,75"));
                b.writeEntry("BackgroundAlternate", QStringLiteral("20,45,75"));
                b.writeEntry("ForegroundNormal", QStringLiteral("255,255,255"));
                continue;
            }
            b.writeEntry("BackgroundNormal", QStringLiteral("255,255,255"));
            b.writeEntry("ForegroundNormal", QStringLiteral("0,0,0"));
            b.writeEntry("ForegroundInactive", QStringLiteral("40,40,40"));
            b.writeEntry("DecorationFocus", QStringLiteral("20,45,75"));
        }
        to.group(QStringLiteral("General")).writeEntry("Name", QStringLiteral("SIOS High Contrast"));
        to.group(QStringLiteral("General")).writeEntry("ColorScheme", QString::fromLatin1(CONTRAST));
        to.sync();
        run(QStringLiteral("plasma-apply-colorscheme"), {QLatin1String(CONTRAST)}, [this](int code, const QString &outText) {
            if (code != 0)
                Q_EMIT message(QStringLiteral("High contrast didn't turn on: %1").arg(outText.trimmed().left(200)), true);
            refresh();
        });
    } else {
        // back to SIOS's own colours for the light or dark look in use
        const bool dark = KConfig(QStringLiteral("kdeglobals")).group(QStringLiteral("KDE")).readEntry("LookAndFeelPackage", QString()).endsWith(QLatin1String(".dark"));
        run(QStringLiteral("plasma-apply-colorscheme"), {dark ? QStringLiteral("SIOSDark") : QStringLiteral("SIOSLight")}, [this](int, const QString &) { refresh(); });
    }
}

void AccessArea::restartKaccess()
{
    // kaccess applies the key and bell helpers and starts the screen reader
    QProcess::startDetached(QStringLiteral("kaccess"), {});
}

void AccessArea::set(const QString &key, const QVariant &value)
{
    if (key == QLatin1String("textScale")) {
        setTextScale(value.toInt());
    } else if (key == QLatin1String("reduceMotion") || key == QLatin1String("motionSpeed")) {
        KConfig globals(QStringLiteral("kdeglobals"));
        const double speed = key == QLatin1String("motionSpeed") ? std::clamp(value.toDouble(), 0.25, 4.0) : (value.toBool() ? 0.0 : 1.0);
        globals.group(QStringLiteral("KDE")).writeEntry("AnimationDurationFactor", speed, KConfig::Notify);
        globals.sync();
        QDBusConnection::sessionBus().asyncCall(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"), QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
    } else if (key == QLatin1String("highContrast")) {
        setHighContrast(value.toBool());
        return;
    } else if (key == QLatin1String("cursorSize")) {
        const int size = std::clamp(value.toInt(), 16, 128);
        const QString theme = KConfig(QStringLiteral("kcminputrc")).group(QStringLiteral("Mouse")).readEntry("cursorTheme", QStringLiteral("breeze_cursors"));
        run(QStringLiteral("plasma-apply-cursortheme"), {QStringLiteral("--size"), QString::number(size), theme}, [this](int code, const QString &out) {
            if (code != 0)
                Q_EMIT message(QStringLiteral("The pointer size didn't change: %1").arg(out.trimmed().left(200)), true);
            refresh();
        });
        return;
    } else if (key == QLatin1String("stickyKeys") || key == QLatin1String("slowKeys") || key == QLatin1String("bounceKeys")
               || key == QLatin1String("slowKeysDelay") || key == QLatin1String("bounceKeysDelay")) {
        KConfig access(QStringLiteral("kaccessrc"));
        KConfigGroup g = access.group(QStringLiteral("Keyboard"));
        const QByteArray name = key.at(0).toUpper().toLatin1() + key.mid(1).toLatin1();
        if (key.endsWith(QLatin1String("Delay")))
            g.writeEntry(name.constData(), std::clamp(value.toInt(), 50, 2000), KConfig::Notify);
        else
            g.writeEntry(name.constData(), value.toBool(), KConfig::Notify);
        access.sync();
        restartKaccess();
    } else if (key == QLatin1String("visualBell")) {
        KConfig access(QStringLiteral("kaccessrc"));
        access.group(QStringLiteral("Bell")).writeEntry("VisibleBell", value.toBool(), KConfig::Notify);
        access.sync();
        restartKaccess();
    } else if (key == QLatin1String("screenReader")) {
        if (value.toBool() && QStandardPaths::findExecutable(QStringLiteral("orca")).isEmpty()) {
            Q_EMIT message(QStringLiteral("The screen reader (Orca) isn't installed on this computer."), true);
            return;
        }
        KConfig access(QStringLiteral("kaccessrc"));
        access.group(QStringLiteral("ScreenReader")).writeEntry("Enabled", value.toBool(), KConfig::Notify);
        access.sync();
        restartKaccess();
    } else if (key == QLatin1String("zoom")) {
        KConfig kwin(QStringLiteral("kwinrc"));
        kwin.group(QStringLiteral("Plugins")).writeEntry("zoomEnabled", value.toBool(), KConfig::Notify);
        kwin.sync();
        QDBusMessage m = QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/Effects"), QStringLiteral("org.kde.kwin.Effects"),
                                                        value.toBool() ? QStringLiteral("loadEffect") : QStringLiteral("unloadEffect"));
        m << QStringLiteral("zoom");
        QDBusConnection::sessionBus().asyncCall(m);
    } else {
        return;
    }
    refresh();
}
