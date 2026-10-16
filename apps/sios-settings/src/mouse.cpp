#include "mouse.h"

#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusReply>
#include <QDBusVariant>

static const QString KWIN = QStringLiteral("org.kde.KWin");
static const QString DEVICE = QStringLiteral("org.kde.KWin.InputDevice");

// the settings a page may change, by the device property KWin gives them
static const QStringList WRITABLE = {QStringLiteral("pointerAcceleration"), QStringLiteral("pointerAccelerationProfileFlat"),
                                     QStringLiteral("naturalScroll"), QStringLiteral("leftHanded"), QStringLiteral("scrollFactor"),
                                     QStringLiteral("tapToClick"), QStringLiteral("clickMethodClickfinger"), QStringLiteral("disableWhileTyping"),
                                     QStringLiteral("middleEmulation"), QStringLiteral("scrollTwoFinger"), QStringLiteral("scrollEdge")};

MouseArea::MouseArea(QObject *parent)
    : Area(parent)
{
}

static QStringList devices()
{
    QDBusInterface mgr(KWIN, QStringLiteral("/org/kde/KWin/InputDevice"), QStringLiteral("org.kde.KWin.InputDeviceManager"), QDBusConnection::sessionBus());
    return mgr.property("devicesSysNames").toStringList();
}

static QVariantMap readDevice(const QString &sys)
{
    QDBusMessage m = QDBusMessage::createMethodCall(KWIN, QStringLiteral("/org/kde/KWin/InputDevice/") + sys, QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("GetAll"));
    m << DEVICE;
    const QDBusReply<QVariantMap> r = QDBusConnection::sessionBus().call(m, QDBus::Block, 3000);
    QVariantMap out = r.isValid() ? r.value() : QVariantMap();
    out.insert(QStringLiteral("sys"), sys);
    return out;
}

// "mouse" (a real pointing device that isn't a touchpad), "touchpad", or ""
static QString kindOf(const QVariantMap &d)
{
    if (!d.value(QStringLiteral("pointer")).toBool() || d.value(QStringLiteral("isVirtual")).toBool())
        return QString();
    return d.value(QStringLiteral("touchpad")).toBool() ? QStringLiteral("touchpad") : QStringLiteral("mouse");
}

void MouseArea::refresh()
{
    QVariantMap mouse, touchpad;
    QStringList mice, pads;
    for (const QString &sys : devices()) {
        const QVariantMap d = readDevice(sys);
        const QString kind = kindOf(d);
        if (kind == QLatin1String("mouse")) {
            if (mouse.isEmpty())
                mouse = d;
            mice << d.value(QStringLiteral("name")).toString();
        } else if (kind == QLatin1String("touchpad")) {
            if (touchpad.isEmpty())
                touchpad = d;
            pads << d.value(QStringLiteral("name")).toString();
        }
    }
    mice.removeDuplicates();
    pads.removeDuplicates();
    replace({{QStringLiteral("mouse"), mouse}, {QStringLiteral("touchpad"), touchpad}, {QStringLiteral("mice"), mice}, {QStringLiteral("touchpads"), pads}});
}

// key: "mouse.<property>" or "touchpad.<property>"; applied to every device of that kind
void MouseArea::set(const QString &key, const QVariant &value)
{
    const QString kind = key.section(QLatin1Char('.'), 0, 0);
    const QString prop = key.section(QLatin1Char('.'), 1);
    if ((kind != QLatin1String("mouse") && kind != QLatin1String("touchpad")) || !WRITABLE.contains(prop))
        return;
    QVariant v = value;
    if (prop == QLatin1String("pointerAcceleration"))
        v = qBound(-1.0, value.toDouble(), 1.0);
    else if (prop == QLatin1String("scrollFactor"))
        v = qBound(0.1, value.toDouble(), 10.0);
    else
        v = value.toBool();
    bool failed = false;
    for (const QString &sys : devices()) {
        const QVariantMap d = readDevice(sys);
        if (kindOf(d) != kind)
            continue;
        QDBusMessage m = QDBusMessage::createMethodCall(KWIN, QStringLiteral("/org/kde/KWin/InputDevice/") + sys, QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Set"));
        m << DEVICE << prop << QVariant::fromValue(QDBusVariant(v));
        const QDBusMessage r = QDBusConnection::sessionBus().call(m, QDBus::Block, 3000);
        failed = failed || r.type() == QDBusMessage::ErrorMessage;
        // the scroll methods are one or the other
        if ((prop == QLatin1String("scrollTwoFinger") || prop == QLatin1String("scrollEdge")) && v.toBool()) {
            QDBusMessage e = QDBusMessage::createMethodCall(KWIN, QStringLiteral("/org/kde/KWin/InputDevice/") + sys, QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Set"));
            e << DEVICE << (prop == QLatin1String("scrollEdge") ? QStringLiteral("scrollTwoFinger") : QStringLiteral("scrollEdge")) << QVariant::fromValue(QDBusVariant(false));
            QDBusConnection::sessionBus().call(e, QDBus::Block, 3000);
        }
    }
    if (failed)
        Q_EMIT message(QStringLiteral("That setting couldn't be changed on this device."), true);
    refresh();
}

void MouseArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
