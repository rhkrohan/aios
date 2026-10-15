// The SIOS broker (capd) from Memory: what SIOS remembers (memory.view, no
// password, D59) and the owner's changes (owner methods: the broker asks for
// the password, or takes a click inside an approval session, D71).
#pragma once

#include <QObject>
#include <QVariant>
#include <functional>

class Broker : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap data READ data NOTIFY dataChanged)
    Q_PROPERTY(bool reachable READ reachable NOTIFY dataChanged)
    Q_PROPERTY(bool sessionOpen READ sessionOpen NOTIFY dataChanged)
public:
    explicit Broker(QObject *parent = nullptr);
    QVariantMap data() const { return m_data; }
    bool reachable() const { return m_reachable; }
    bool sessionOpen() const { return m_session; }

    Q_INVOKABLE void refresh();
    // one owner method; answered by `done(tag, ok, error)`, then a refresh
    Q_INVOKABLE void request(const QString &method, const QVariantMap &params, const QString &tag);

Q_SIGNALS:
    void dataChanged();
    void done(const QString &tag, const QVariant &ok, const QString &error);

private:
    void send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then);
    QVariantMap m_data;
    bool m_reachable = false;
    bool m_session = false;
};
