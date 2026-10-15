// What waits for the owner at the broker (capd), and the owner's answers.
// Yes is "grant" (a pass) or "approve" (a call): the broker asks for the
// owner's password first. No is "decline", which anyone may say.
#pragma once

#include <QObject>
#include <QTimer>
#include <QVariant>
#include <functional>

class Approvals : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
    Q_PROPERTY(QString busy READ busy NOTIFY busyChanged)
    // the broker's public status: AI stopped (D41), an approval session open (D56)
    Q_PROPERTY(bool stopped READ stopped NOTIFY statusChanged)
    Q_PROPERTY(bool sessionOpen READ sessionOpen NOTIFY statusChanged)
public:
    explicit Approvals(QObject *parent = nullptr);
    QVariantList items() const { return m_items; }
    QString busy() const { return m_busy; }
    bool stopped() const { return m_stopped; }
    bool sessionOpen() const { return m_session; }

    Q_INVOKABLE void refresh();
    Q_INVOKABLE void allow(const QString &kind, const QString &id);
    Q_INVOKABLE void deny(const QString &id);
    // Stop needs no password; Resume does (the broker asks)
    Q_INVOKABLE void stopAll();
    Q_INVOKABLE void resumeAll();
    Q_INVOKABLE void endSession();

Q_SIGNALS:
    void itemsChanged();
    void busyChanged();
    void statusChanged();
    void message(const QString &text, bool error);

private:
    void send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then, int limitMs);
    QVariantList m_items;
    QString m_busy;
    bool m_stopped = false;
    bool m_session = false;
    QTimer m_poll;
};
