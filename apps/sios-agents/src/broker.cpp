#include "broker.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>
#include <QTimer>

static QString socketPath(const QString &name)
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    return dir + QLatin1Char('/') + name;
}

Broker::Broker(QObject *parent)
    : QObject(parent)
{
    refresh();
    // reports and goals change while the window is open
    auto *t = new QTimer(this);
    t->setInterval(4000);
    connect(t, &QTimer::timeout, this, &Broker::refresh);
    t->start();
}

void Broker::send(const QString &socket, const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then)
{
    auto *s = new QLocalSocket(this);
    auto *buf = new QByteArray;
    // the owner may take a while to type their password
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
    connect(limit, &QTimer::timeout, s, [finish] { finish({}, QStringLiteral("SIOS didn't answer in time.")); });
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
    connect(s, &QLocalSocket::errorOccurred, s, [finish](QLocalSocket::LocalSocketError) { finish({}, QStringLiteral("SIOS isn't running.")); });
    s->connectToServer(socketPath(socket));
}

void Broker::refresh()
{
    send(QStringLiteral("capd.sock"), QStringLiteral("agents.view"), {}, [this](const QVariant &ok, const QString &err) {
        m_reachable = err.isEmpty();
        if (m_reachable)
            m_team = ok.toMap();
        Q_EMIT changed();
    });
    send(QStringLiteral("capd.sock"), QStringLiteral("audit.view"), {{QStringLiteral("n"), 120}}, [this](const QVariant &ok, const QString &err) {
        if (err.isEmpty()) {
            m_activity = ok.toMap().value(QStringLiteral("entries")).toList();
            Q_EMIT changed();
        }
    });
    send(QStringLiteral("capd.sock"), QStringLiteral("status"), {}, [this](const QVariant &ok, const QString &err) {
        if (err.isEmpty()) {
            m_status = ok.toMap();
            Q_EMIT changed();
        }
    });
    send(QStringLiteral("brain.sock"), QStringLiteral("goals.recent"), {}, [this](const QVariant &ok, const QString &err) {
        if (err.isEmpty()) {
            m_goals = ok.toList();
            Q_EMIT changed();
        }
    });
}

void Broker::request(const QString &method, const QVariantMap &params, const QString &tag)
{
    send(QStringLiteral("capd.sock"), method, params, [this, tag](const QVariant &ok, const QString &err) {
        Q_EMIT done(tag, ok, err);
        refresh();
    });
}

void Broker::look(const QString &method, const QVariantMap &params, const QString &tag)
{
    send(QStringLiteral("capd.sock"), method, params, [this, tag](const QVariant &ok, const QString &err) { Q_EMIT done(tag, ok, err); });
}

void Broker::brain(const QString &method, const QVariantMap &params, const QString &tag)
{
    send(QStringLiteral("brain.sock"), method, params, [this, tag](const QVariant &ok, const QString &err) {
        Q_EMIT done(tag, ok, err);
        refresh();
    });
}
