#include "bluetooth.h"

#include <KConfig>
#include <KConfigGroup>

#include <QDBusArgument>
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusPendingCallWatcher>
#include <QDBusServiceWatcher>
#include <QDBusVariant>
#include <QRegularExpression>

static const QString BLUEZ = QStringLiteral("org.bluez");
static const QString ADAPTER = QStringLiteral("org.bluez.Adapter1");
static const QString DEVICE = QStringLiteral("org.bluez.Device1");
static const QString AGENT_PATH = QStringLiteral("/org/sios/settings/bluetooth_agent");

static QDBusConnection bus()
{
    return QDBusConnection::systemBus();
}

// BlueZ's errors in plain words
static QString plain(const QDBusError &e)
{
    const QString n = e.name(), m = e.message();
    if (n.endsWith(QLatin1String("AuthenticationFailed")) || n.endsWith(QLatin1String("AuthenticationCanceled")) || n.endsWith(QLatin1String("AuthenticationRejected")) || n.endsWith(QLatin1String("Rejected")))
        return QStringLiteral("pairing didn't finish (it was cancelled or the codes didn't match)");
    if (n.endsWith(QLatin1String("AuthenticationTimeout")) || m.contains(QLatin1String("Page Timeout")) || n.endsWith(QLatin1String("ConnectionAttemptFailed")) || n.endsWith(QLatin1String("NoReply")))
        return QStringLiteral("the device didn't answer; make sure it's on, nearby and ready to pair");
    if (n.endsWith(QLatin1String("NotReady")))
        return QStringLiteral("Bluetooth is off");
    if (n.endsWith(QLatin1String("ServiceUnknown")) || n.endsWith(QLatin1String("Spawn.ChildExited")) || n.endsWith(QLatin1String("Spawn.Failed")))
        return QStringLiteral("Bluetooth isn't running on this computer");
    return m.isEmpty() ? n : m;
}

// ---- the agent

BtAgent::BtAgent(BluetoothArea *area)
    : QObject(area)
    , m_area(area)
{
}

// only BlueZ itself may talk to the agent: anything else on the system bus is turned away
bool BtAgent::fromBluez()
{
    const QString bluez = bus().interface()->serviceOwner(BLUEZ).value();
    if (bluez.isEmpty() || message().service() != bluez) {
        sendErrorReply(QStringLiteral("org.bluez.Error.Rejected"), QStringLiteral("not BlueZ"));
        return false;
    }
    return true;
}

void BtAgent::ask(const QString &kind, const QDBusObjectPath &device, const QString &code)
{
    if (!fromBluez())
        return;
    // every question gets its own number; the window answers that number only
    ++m_seq;
    if (kind != QLatin1String("display")) {
        if (m_pending.type() == QDBusMessage::MethodCallMessage)
            bus().send(m_pending.createErrorReply(QStringLiteral("org.bluez.Error.Canceled"), QStringLiteral("replaced")));
        setDelayedReply(true);
        m_pending = message();
        m_kind = kind;
    }
    m_area->put(QStringLiteral("prompt"), QVariantMap{{QStringLiteral("id"), m_seq}, {QStringLiteral("kind"), kind}, {QStringLiteral("device"), m_area->nameOf(device.path())}, {QStringLiteral("code"), code}});
}

void BtAgent::answer(quint64 id, bool ok, const QString &value)
{
    // an answer to an older question (one that was replaced or cancelled) does nothing
    if (id != m_seq)
        return;
    if (m_pending.type() != QDBusMessage::MethodCallMessage) {
        m_area->put(QStringLiteral("prompt"), QVariant());
        return;
    }
    QDBusMessage reply;
    if (!ok) {
        reply = m_pending.createErrorReply(QStringLiteral("org.bluez.Error.Rejected"), QStringLiteral("The owner said no"));
    } else if (m_kind == QLatin1String("pin")) {
        // 1 to 16 letters or digits, as the Bluetooth spec allows
        const QString pin = value.trimmed().left(16);
        reply = pin.isEmpty() ? m_pending.createErrorReply(QStringLiteral("org.bluez.Error.Rejected"), QStringLiteral("no PIN")) : m_pending.createReply(pin);
    } else if (m_kind == QLatin1String("passkey")) {
        bool good = false;
        const uint key = value.trimmed().toUInt(&good);
        reply = good && key <= 999999 ? m_pending.createReply(QVariant::fromValue(key)) : m_pending.createErrorReply(QStringLiteral("org.bluez.Error.Rejected"), QStringLiteral("bad passkey"));
    } else {
        reply = m_pending.createReply();
    }
    bus().send(reply);
    m_pending = QDBusMessage();
    m_area->put(QStringLiteral("prompt"), QVariant());
}

void BtAgent::Release()
{
    if (!fromBluez())
        return;
    m_area->m_agentRegistered = false;
}

QString BtAgent::RequestPinCode(const QDBusObjectPath &device)
{
    ask(QStringLiteral("pin"), device, QString());
    return {};
}

void BtAgent::DisplayPinCode(const QDBusObjectPath &device, const QString &pincode)
{
    ask(QStringLiteral("display"), device, pincode.left(16));
}

uint BtAgent::RequestPasskey(const QDBusObjectPath &device)
{
    ask(QStringLiteral("passkey"), device, QString());
    return 0;
}

void BtAgent::DisplayPasskey(const QDBusObjectPath &device, uint passkey, ushort entered)
{
    Q_UNUSED(entered)
    ask(QStringLiteral("display"), device, QStringLiteral("%1").arg(passkey, 6, 10, QLatin1Char('0')));
}

void BtAgent::RequestConfirmation(const QDBusObjectPath &device, uint passkey)
{
    ask(QStringLiteral("confirm"), device, QStringLiteral("%1").arg(passkey, 6, 10, QLatin1Char('0')));
}

void BtAgent::RequestAuthorization(const QDBusObjectPath &device)
{
    ask(QStringLiteral("authorize"), device, QString());
}

void BtAgent::AuthorizeService(const QDBusObjectPath &device, const QString &uuid)
{
    Q_UNUSED(uuid)
    ask(QStringLiteral("service"), device, QString());
}

void BtAgent::Cancel()
{
    if (!fromBluez())
        return;
    ++m_seq;
    m_pending = QDBusMessage();
    m_area->put(QStringLiteral("prompt"), QVariant());
}

// ---- the area

BluetoothArea::BluetoothArea(QObject *parent)
    : Area(parent)
{
    m_settle.setSingleShot(true);
    m_settle.setInterval(250);
    connect(&m_settle, &QTimer::timeout, this, &BluetoothArea::refresh);
    // scanning stops by itself after a minute (it uses the radio and battery)
    m_scanStop.setSingleShot(true);
    m_scanStop.setInterval(60000);
    connect(&m_scanStop, &QTimer::timeout, this, [this] { act(QStringLiteral("scan"), {{QStringLiteral("on"), false}}); });

    // live: devices appearing, going and changing, and BlueZ itself starting
    bus().connect(BLUEZ, QStringLiteral("/"), QStringLiteral("org.freedesktop.DBus.ObjectManager"), QStringLiteral("InterfacesAdded"), this, SLOT(onChange(QDBusMessage)));
    bus().connect(BLUEZ, QStringLiteral("/"), QStringLiteral("org.freedesktop.DBus.ObjectManager"), QStringLiteral("InterfacesRemoved"), this, SLOT(onChange(QDBusMessage)));
    bus().connect(BLUEZ, QString(), QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("PropertiesChanged"), this, SLOT(onChange(QDBusMessage)));
    auto *w = new QDBusServiceWatcher(BLUEZ, bus(), QDBusServiceWatcher::WatchForOwnerChange, this);
    connect(w, &QDBusServiceWatcher::serviceOwnerChanged, this, [this] {
        m_agentRegistered = false;
        m_settle.start();
    });
    m_agent = new BtAgent(this);
}

void BluetoothArea::onChange(const QDBusMessage &msg)
{
    Q_UNUSED(msg)
    m_settle.start();
}

void BluetoothArea::refresh()
{
    // only ask when BlueZ is there: asking would try to start it, and on a computer
    // without Bluetooth that waits for systemd to give up
    if (!bus().interface()->isServiceRegistered(BLUEZ).value()) {
        replace({{QStringLiteral("available"), false}, {QStringLiteral("launch"), KConfig(QStringLiteral("bluedevilglobalrc")).group(QStringLiteral("Global")).readEntry("launchState", QStringLiteral("remember"))}});
        return;
    }
    QDBusMessage m = QDBusMessage::createMethodCall(BLUEZ, QStringLiteral("/"), QStringLiteral("org.freedesktop.DBus.ObjectManager"), QStringLiteral("GetManagedObjects"));
    auto *w = new QDBusPendingCallWatcher(bus().asyncCall(m, 5000), this);
    connect(w, &QDBusPendingCallWatcher::finished, this, [this, w] {
        w->deleteLater();
        const QDBusMessage reply = w->reply();
        QVariantMap s;
        s[QStringLiteral("launch")] = KConfig(QStringLiteral("bluedevilglobalrc")).group(QStringLiteral("Global")).readEntry("launchState", QStringLiteral("remember"));
        s[QStringLiteral("prompt")] = m_state.value(QStringLiteral("prompt"));
        if (reply.type() != QDBusMessage::ReplyMessage || reply.arguments().isEmpty()) {
            s[QStringLiteral("available")] = false;
            replace(s);
            return;
        }
        QVariantMap adapter;
        QVariantList devices;
        QMap<QString, int> battery;
        const QDBusArgument arg = reply.arguments().at(0).value<QDBusArgument>();
        arg.beginMap();
        while (!arg.atEnd()) {
            QDBusObjectPath path;
            arg.beginMapEntry();
            arg >> path;
            arg.beginMap();
            while (!arg.atEnd()) {
                QString iface;
                QVariantMap p;
                arg.beginMapEntry();
                arg >> iface >> p;
                arg.endMapEntry();
                if (iface == ADAPTER && adapter.isEmpty()) {
                    adapter = {{QStringLiteral("path"), path.path()},
                               {QStringLiteral("powered"), p.value(QStringLiteral("Powered")).toBool()},
                               {QStringLiteral("name"), p.value(QStringLiteral("Alias")).toString()},
                               {QStringLiteral("address"), p.value(QStringLiteral("Address")).toString()},
                               {QStringLiteral("visible"), p.value(QStringLiteral("Discoverable")).toBool()},
                               {QStringLiteral("scanning"), p.value(QStringLiteral("Discovering")).toBool()}};
                } else if (iface == DEVICE) {
                    devices.append(QVariantMap{{QStringLiteral("path"), path.path()},
                                               {QStringLiteral("name"), p.value(QStringLiteral("Alias")).toString()},
                                               {QStringLiteral("address"), p.value(QStringLiteral("Address")).toString()},
                                               {QStringLiteral("icon"), p.value(QStringLiteral("Icon")).toString()},
                                               {QStringLiteral("paired"), p.value(QStringLiteral("Paired")).toBool()},
                                               {QStringLiteral("connected"), p.value(QStringLiteral("Connected")).toBool()},
                                               {QStringLiteral("trusted"), p.value(QStringLiteral("Trusted")).toBool()},
                                               {QStringLiteral("named"), p.contains(QStringLiteral("Name"))}});
                } else if (iface == QLatin1String("org.bluez.Battery1")) {
                    battery[path.path()] = p.value(QStringLiteral("Percentage")).toInt();
                }
            }
            arg.endMap();
            arg.endMapEntry();
        }
        arg.endMap();
        for (QVariant &d : devices) {
            QVariantMap x = d.toMap();
            x[QStringLiteral("battery")] = battery.value(x.value(QStringLiteral("path")).toString(), -1);
            d = x;
        }
        // connected first, then by name
        std::sort(devices.begin(), devices.end(), [](const QVariant &a, const QVariant &b) {
            const QVariantMap x = a.toMap(), y = b.toMap();
            if (x.value(QStringLiteral("connected")).toBool() != y.value(QStringLiteral("connected")).toBool())
                return x.value(QStringLiteral("connected")).toBool();
            return x.value(QStringLiteral("name")).toString().localeAwareCompare(y.value(QStringLiteral("name")).toString()) < 0;
        });
        s[QStringLiteral("available")] = !adapter.isEmpty();
        s[QStringLiteral("adapter")] = adapter;
        s[QStringLiteral("devices")] = devices;
        replace(s);
    });
}

bool BluetoothArea::known(const QString &path) const
{
    for (const QVariant &d : m_state.value(QStringLiteral("devices")).toList()) {
        if (d.toMap().value(QStringLiteral("path")).toString() == path)
            return true;
    }
    return false;
}

QString BluetoothArea::nameOf(const QString &path) const
{
    for (const QVariant &d : m_state.value(QStringLiteral("devices")).toList()) {
        const QVariantMap x = d.toMap();
        if (x.value(QStringLiteral("path")).toString() == path)
            return x.value(QStringLiteral("name")).toString();
    }
    return QStringLiteral("A device");
}

void BluetoothArea::setProp(const QString &path, const QString &iface, const QString &name, const QVariant &value, const QString &failText)
{
    QDBusMessage m = QDBusMessage::createMethodCall(BLUEZ, path, QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("Set"));
    m << iface << name << QVariant::fromValue(QDBusVariant(value));
    auto *w = new QDBusPendingCallWatcher(bus().asyncCall(m, 10000), this);
    connect(w, &QDBusPendingCallWatcher::finished, this, [this, w, failText] {
        w->deleteLater();
        if (w->isError())
            Q_EMIT message(failText + QStringLiteral(": ") + plain(w->error()) + QLatin1Char('.'), true);
        m_settle.start();
    });
}

void BluetoothArea::call(const QString &path, const QString &iface, const QString &method, const QVariantList &args, const QString &okText, const QString &failText, int timeoutMs)
{
    QDBusMessage m = QDBusMessage::createMethodCall(BLUEZ, path, iface, method);
    m.setArguments(args);
    auto *w = new QDBusPendingCallWatcher(bus().asyncCall(m, timeoutMs), this);
    connect(w, &QDBusPendingCallWatcher::finished, this, [this, w, okText, failText] {
        w->deleteLater();
        if (w->isError()) {
            const QString n = w->error().name();
            // already done, or already being done: not an error for the owner
            if (!n.endsWith(QLatin1String("AlreadyExists")) && !n.endsWith(QLatin1String("InProgress")) && !n.endsWith(QLatin1String("AlreadyConnected")))
                Q_EMIT message(failText + QStringLiteral(": ") + plain(w->error()) + QLatin1Char('.'), true);
        } else if (!okText.isEmpty()) {
            Q_EMIT message(okText, false);
        }
        m_settle.start();
    });
}

void BluetoothArea::registerAgent()
{
    if (m_agentRegistered)
        return;
    bus().registerObject(AGENT_PATH, m_agent, QDBusConnection::ExportScriptableSlots);
    QDBusMessage m = QDBusMessage::createMethodCall(BLUEZ, QStringLiteral("/org/bluez"), QStringLiteral("org.bluez.AgentManager1"), QStringLiteral("RegisterAgent"));
    m << QVariant::fromValue(QDBusObjectPath(AGENT_PATH)) << QStringLiteral("KeyboardDisplay");
    auto *w = new QDBusPendingCallWatcher(bus().asyncCall(m, 5000), this);
    connect(w, &QDBusPendingCallWatcher::finished, this, [this, w] {
        w->deleteLater();
        m_agentRegistered = !w->isError() || w->error().name().endsWith(QLatin1String("AlreadyExists"));
    });
}

void BluetoothArea::set(const QString &key, const QVariant &value)
{
    const QString adapter = m_state.value(QStringLiteral("adapter")).toMap().value(QStringLiteral("path")).toString();
    if (key == QLatin1String("launch")) {
        const QString v = value.toString();
        if (v != QLatin1String("remember") && v != QLatin1String("enable") && v != QLatin1String("disable"))
            return;
        KConfig c(QStringLiteral("bluedevilglobalrc"));
        c.group(QStringLiteral("Global")).writeEntry("launchState", v);
        c.sync();
        put(QStringLiteral("launch"), v);
        return;
    }
    if (adapter.isEmpty())
        return;
    if (key == QLatin1String("powered")) {
        setProp(adapter, ADAPTER, QStringLiteral("Powered"), value.toBool(), value.toBool() ? QStringLiteral("Couldn't turn Bluetooth on") : QStringLiteral("Couldn't turn Bluetooth off"));
    } else if (key == QLatin1String("visible")) {
        setProp(adapter, ADAPTER, QStringLiteral("Discoverable"), value.toBool(), QStringLiteral("Couldn't change whether others can see this computer"));
    } else if (key == QLatin1String("name")) {
        QString n = value.toString().trimmed();
        n.remove(QRegularExpression(QStringLiteral("[\\x00-\\x1f\\x7f]")));
        if (!n.isEmpty())
            setProp(adapter, ADAPTER, QStringLiteral("Alias"), n.left(64), QStringLiteral("Couldn't rename this computer"));
    }
}

void BluetoothArea::act(const QString &name, const QVariantMap &params)
{
    if (name == QLatin1String("answer")) {
        m_agent->answer(params.value(QStringLiteral("id")).toULongLong(), params.value(QStringLiteral("ok")).toBool(), params.value(QStringLiteral("value")).toString());
        return;
    }
    const QString adapter = m_state.value(QStringLiteral("adapter")).toMap().value(QStringLiteral("path")).toString();
    if (adapter.isEmpty())
        return;
    if (name == QLatin1String("scan")) {
        const bool on = params.value(QStringLiteral("on")).toBool();
        if (on) {
            registerAgent();
            m_scanStop.start();
        } else {
            m_scanStop.stop();
        }
        call(adapter, ADAPTER, on ? QStringLiteral("StartDiscovery") : QStringLiteral("StopDiscovery"), {}, QString(), on ? QStringLiteral("Couldn't look for devices") : QStringLiteral("Couldn't stop looking"));
        return;
    }
    const QString path = params.value(QStringLiteral("path")).toString();
    if (!known(path))
        return;
    const QString who = nameOf(path);
    if (name == QLatin1String("pair")) {
        registerAgent();
        // pairing waits for the owner and the device: up to two minutes
        QDBusMessage m = QDBusMessage::createMethodCall(BLUEZ, path, DEVICE, QStringLiteral("Pair"));
        auto *w = new QDBusPendingCallWatcher(bus().asyncCall(m, 120000), this);
        put(QStringLiteral("pairing"), path);
        connect(w, &QDBusPendingCallWatcher::finished, this, [this, w, path, who] {
            w->deleteLater();
            put(QStringLiteral("pairing"), QString());
            put(QStringLiteral("prompt"), QVariant());
            if (w->isError() && !w->error().name().endsWith(QLatin1String("AlreadyExists"))) {
                Q_EMIT message(QStringLiteral("Couldn't pair with %1: %2.").arg(who, plain(w->error())), true);
                m_settle.start();
                return;
            }
            // a device you paired is trusted, so it reconnects by itself; then connect it now
            setProp(path, DEVICE, QStringLiteral("Trusted"), true, QStringLiteral("Couldn't trust %1").arg(who));
            call(path, DEVICE, QStringLiteral("Connect"), {}, QStringLiteral("%1 is paired and connected.").arg(who), QStringLiteral("Paired with %1, but couldn't connect").arg(who));
        });
    } else if (name == QLatin1String("connect")) {
        call(path, DEVICE, QStringLiteral("Connect"), {}, QStringLiteral("%1 is connected.").arg(who), QStringLiteral("Couldn't connect %1").arg(who));
    } else if (name == QLatin1String("disconnect")) {
        call(path, DEVICE, QStringLiteral("Disconnect"), {}, QString(), QStringLiteral("Couldn't disconnect %1").arg(who));
    } else if (name == QLatin1String("trust")) {
        setProp(path, DEVICE, QStringLiteral("Trusted"), params.value(QStringLiteral("on")).toBool(), QStringLiteral("Couldn't change %1").arg(who));
    } else if (name == QLatin1String("forget")) {
        call(adapter, ADAPTER, QStringLiteral("RemoveDevice"), {QVariant::fromValue(QDBusObjectPath(path))}, QStringLiteral("%1 is forgotten.").arg(who), QStringLiteral("Couldn't forget %1").arg(who));
    }
}
