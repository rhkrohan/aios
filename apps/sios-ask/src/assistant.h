// The Ask bar's link to SIOS's brain (brain-d): start a goal from what was
// typed, and follow it (plan, waiting for your OK, steps, result). brain-d
// plans with the AI chosen in Settings > Brain; the broker checks every step
// and the approval window asks you (with your password) before anything runs.
#pragma once

#include <QObject>
#include <QTimer>
#include <QVariant>
#include <functional>

class Assistant : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantList events READ events NOTIFY eventsChanged)
    Q_PROPERTY(bool running READ running NOTIFY eventsChanged)
    Q_PROPERTY(QString request READ request NOTIFY eventsChanged)
public:
    explicit Assistant(QObject *parent = nullptr);
    QVariantList events() const { return m_events; }
    bool running() const { return m_running; }
    QString request() const { return m_request; }

    Q_INVOKABLE void ask(const QString &text);
    // a new conversation (the next request doesn't follow on from this one)
    Q_INVOKABLE void reset();

Q_SIGNALS:
    void eventsChanged();

private:
    void send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then);
    void poll();
    QVariantList m_events;
    QString m_goal, m_thread, m_request;
    int m_next = 0;
    bool m_running = false;
    QTimer m_poll;
};
