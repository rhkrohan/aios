// The broker (capd) from the Store's Connectors page (C3, D105, D108). Looking is
// open to SIOS's own windows (D59); installing, removing and choosing who may use a
// connector are the owner's: the broker asks for the password on screen.
#pragma once

#include <QObject>
#include <QVariant>
#include <functional>

class Broker : public QObject
{
    Q_OBJECT
public:
    explicit Broker(QObject *parent = nullptr);
    // a broker method; answered by `done(tag, ok, error)`
    Q_INVOKABLE void request(const QString &method, const QVariantMap &params, const QString &tag);

Q_SIGNALS:
    void done(const QString &tag, const QVariant &ok, const QString &error);

private:
    void send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then);
};
