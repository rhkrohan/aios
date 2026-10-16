// Bluetooth: on/off, this computer's name and whether others can see it, your
// devices (connect, disconnect, forget, battery), adding a device (scan, pair,
// trust) and, under Advanced, the adapter's address and whether Bluetooth turns
// on when you sign in. BlueZ over D-Bus (org.bluez, all calls in the background
// so a missing Bluetooth service never freezes the window); pairing questions
// (a PIN, a passkey to compare) come to this window through our own
// org.bluez.Agent1 and are answered in a real window. Sign-in behaviour is
// Plasma's Bluetooth daemon setting (bluedevilglobalrc).
#pragma once

#include "area.h"

#include <QDBusContext>
#include <QDBusMessage>
#include <QDBusObjectPath>
#include <QTimer>

class BluetoothArea;

// BlueZ asks this object when pairing needs the owner: it answers later, from
// the window (delayed D-Bus replies).
class BtAgent : public QObject, protected QDBusContext
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.bluez.Agent1")
public:
    explicit BtAgent(BluetoothArea *area);
    // `id` is the prompt the owner saw: an answer never reaches a newer request (security review)
    void answer(quint64 id, bool ok, const QString &value);

public Q_SLOTS:
    Q_SCRIPTABLE void Release();
    Q_SCRIPTABLE QString RequestPinCode(const QDBusObjectPath &device);
    Q_SCRIPTABLE void DisplayPinCode(const QDBusObjectPath &device, const QString &pincode);
    Q_SCRIPTABLE uint RequestPasskey(const QDBusObjectPath &device);
    Q_SCRIPTABLE void DisplayPasskey(const QDBusObjectPath &device, uint passkey, ushort entered);
    Q_SCRIPTABLE void RequestConfirmation(const QDBusObjectPath &device, uint passkey);
    Q_SCRIPTABLE void RequestAuthorization(const QDBusObjectPath &device);
    Q_SCRIPTABLE void AuthorizeService(const QDBusObjectPath &device, const QString &uuid);
    Q_SCRIPTABLE void Cancel();

private:
    void ask(const QString &kind, const QDBusObjectPath &device, const QString &code);
    BluetoothArea *m_area;
    QDBusMessage m_pending;
    QString m_kind;
    quint64 m_seq = 0;
    bool fromBluez();
};

class BluetoothArea : public Area
{
    Q_OBJECT
    friend class BtAgent;
public:
    explicit BluetoothArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;

private Q_SLOTS:
    void onChange(const QDBusMessage &msg);

private:
    void setProp(const QString &path, const QString &iface, const QString &name, const QVariant &value, const QString &failText);
    void call(const QString &path, const QString &iface, const QString &method, const QVariantList &args, const QString &okText, const QString &failText, int timeoutMs = 25000);
    bool known(const QString &path) const;
    QString nameOf(const QString &path) const;
    void registerAgent();

    BtAgent *m_agent = nullptr;
    bool m_agentRegistered = false;
    QTimer m_settle;
    QTimer m_scanStop;
};
