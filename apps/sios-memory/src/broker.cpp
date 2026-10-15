#include "broker.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>
#include <QTimer>

static QString socketPath()
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    return dir + QStringLiteral("/capd.sock");
}

Broker::Broker(QObject *parent)
    : QObject(parent)
{
    refresh();
}

void Broker::send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then)
{
    auto *s = new QLocalSocket(this);
    auto *buf = new QByteArray;
    // the owner may take a while to type their password; capd gives up after 2 minutes
    auto *limit = new QTimer(s);
    limit->setSingleShot(true);
    limit->start(150 * 1000);
    auto finish = [s, buf, then](const QVariant &ok, const QString &err) {
        then(ok, err);
        delete buf;
        s->disconnect();
        s->abort();
        s->deleteLater();
    };
    connect(limit, &QTimer::timeout, s, [finish] { finish({}, QStringLiteral("The broker didn't answer in time.")); });
    connect(s, &QLocalSocket::connected, s, [s, method, params] {
        QJsonObject req{{QStringLiteral("method"), method}, {QStringLiteral("params"), QJsonObject::fromVariantMap(params)}};
        s->write(QJsonDocument(req).toJson(QJsonDocument::Compact) + '\n');
    });
    connect(s, &QLocalSocket::readyRead, s, [s, buf, finish] {
        buf->append(s->readAll());
        const int nl = buf->indexOf('\n');
        if (nl < 0)
            return;
        const QJsonObject v = QJsonDocument::fromJson(buf->left(nl)).object();
        if (v.contains(QStringLiteral("error")))
            finish({}, v.value(QStringLiteral("error")).toString());
        else
            finish(v.value(QStringLiteral("ok")).toVariant(), {});
    });
    connect(s, &QLocalSocket::errorOccurred, s, [finish](QLocalSocket::LocalSocketError) {
        finish({}, QStringLiteral("SIOS's broker isn't running."));
    });
    s->connectToServer(socketPath());
}

void Broker::refresh()
{
    send(QStringLiteral("memory.view"), {}, [this](const QVariant &ok, const QString &err) {
        m_reachable = err.isEmpty();
        if (m_reachable)
            m_data = ok.toMap();
        // whether a yes is a click right now (an approval session, D56/D71)
        send(QStringLiteral("status"), {}, [this](const QVariant &st, const QString &) {
            m_session = st.toMap().value(QStringLiteral("approvals_open")).toBool();
            Q_EMIT dataChanged();
        });
    });
}

void Broker::request(const QString &method, const QVariantMap &params, const QString &tag)
{
    send(method, params, [this, tag](const QVariant &ok, const QString &err) {
        Q_EMIT done(tag, ok, err);
        refresh();
    });
}
