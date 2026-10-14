// The SIOS broker (capd) from Settings: what AI providers are set up, and the
// owner's changes to them. Every change asks for the owner's password on
// screen (polkit, D39), so requests run in the background and answer later.
#pragma once

#include <QObject>
#include <QVariant>

class Broker : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap ai READ ai NOTIFY aiChanged)
    Q_PROPERTY(bool reachable READ reachable NOTIFY aiChanged)
public:
    explicit Broker(QObject *parent = nullptr);
    QVariantMap ai() const { return m_ai; }
    bool reachable() const { return m_reachable; }

    // re-read the providers (no password needed: nothing secret in it)
    Q_INVOKABLE void refresh();
    // one broker method; answered by `done(tag, ok, error)`
    Q_INVOKABLE void request(const QString &method, const QVariantMap &params, const QString &tag);

Q_SIGNALS:
    void aiChanged();
    void done(const QString &tag, const QVariant &ok, const QString &error);

private:
    void send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then);
    QVariantMap m_ai;
    bool m_reachable = false;
};
