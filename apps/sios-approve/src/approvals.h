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
public:
    explicit Approvals(QObject *parent = nullptr);
    QVariantList items() const { return m_items; }
    QString busy() const { return m_busy; }

    Q_INVOKABLE void refresh();
    Q_INVOKABLE void allow(const QString &kind, const QString &id);
    Q_INVOKABLE void deny(const QString &id);

Q_SIGNALS:
    void itemsChanged();
    void busyChanged();
    void message(const QString &text, bool error);

private:
    void send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then, int limitMs);
    QVariantList m_items;
    QString m_busy;
    QTimer m_poll;
};
