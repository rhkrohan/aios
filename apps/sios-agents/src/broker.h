// The broker (capd) and the brain (brain-d) from Agents. Looking needs no
// password (D59): agents, reports, the audit and goals. Changes are the
// owner's: the broker asks for the password on screen.
#pragma once

#include <QObject>
#include <QVariant>
#include <functional>

class Broker : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap team READ team NOTIFY changed)
    Q_PROPERTY(QVariantList activity READ activity NOTIFY changed)
    Q_PROPERTY(QVariantList goals READ goals NOTIFY changed)
    Q_PROPERTY(QVariantMap status READ status NOTIFY changed)
    Q_PROPERTY(bool reachable READ reachable NOTIFY changed)
public:
    explicit Broker(QObject *parent = nullptr);
    QVariantMap team() const { return m_team; }
    QVariantList activity() const { return m_activity; }
    QVariantList goals() const { return m_goals; }
    QVariantMap status() const { return m_status; }
    bool reachable() const { return m_reachable; }

    Q_INVOKABLE void refresh();
    // a broker method; answered by `done(tag, ok, error)`, then a refresh
    Q_INVOKABLE void request(const QString &method, const QVariantMap &params, const QString &tag);
    // a read the window repeats (the live log): answered by `done`, no refresh after
    Q_INVOKABLE void look(const QString &method, const QVariantMap &params, const QString &tag);
    // a brain method (Run now)
    Q_INVOKABLE void brain(const QString &method, const QVariantMap &params, const QString &tag);

Q_SIGNALS:
    void changed();
    void done(const QString &tag, const QVariant &ok, const QString &error);

private:
    void send(const QString &socket, const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then);
    QVariantMap m_team, m_status;
    QVariantList m_activity, m_goals;
    bool m_reachable = false;
};
