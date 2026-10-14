#include "approvals.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>

static QString socketPath()
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    return dir + QStringLiteral("/capd.sock");
}

Approvals::Approvals(QObject *parent)
    : QObject(parent)
{
    // requests can be answered or expire elsewhere; keep the list true while it's shown
    m_poll.setInterval(2000);
    connect(&m_poll, &QTimer::timeout, this, &Approvals::refresh);
    m_poll.start();
}

void Approvals::send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then, int limitMs)
{
    auto *s = new QLocalSocket(this);
    auto *buf = new QByteArray;
    auto *limit = new QTimer(s);
    limit->setSingleShot(true);
    limit->start(limitMs);
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
    connect(s, &QLocalSocket::errorOccurred, s, [finish](QLocalSocket::LocalSocketError) { finish({}, QStringLiteral("SIOS's broker isn't running.")); });
    s->connectToServer(socketPath());
}

void Approvals::refresh()
{
    send(QStringLiteral("pending.list"), {}, [this](const QVariant &ok, const QString &err) {
        if (!err.isEmpty())
            return;
        const QVariantMap m = ok.toMap();
        QVariantList all = m.value(QStringLiteral("calls")).toList();
        all += m.value(QStringLiteral("passes")).toList();
        if (all != m_items) {
            m_items = all;
            Q_EMIT itemsChanged();
        }
    }, 5000);
}

void Approvals::allow(const QString &kind, const QString &id)
{
    m_busy = id;
    Q_EMIT busyChanged();
    // the broker now shows the password dialog; give the owner time to type
    send(kind == QLatin1String("pass") ? QStringLiteral("grant") : QStringLiteral("approve"), {{QStringLiteral("id"), id}}, [this](const QVariant &, const QString &err) {
        m_busy.clear();
        Q_EMIT busyChanged();
        Q_EMIT message(err.isEmpty() ? QStringLiteral("Allowed.") : err, !err.isEmpty());
        refresh();
    }, 150 * 1000);
}

void Approvals::deny(const QString &id)
{
    send(QStringLiteral("decline"), {{QStringLiteral("id"), id}}, [this](const QVariant &, const QString &err) {
        Q_EMIT message(err.isEmpty() ? QStringLiteral("Declined.") : err, !err.isEmpty());
        refresh();
    }, 10 * 1000);
}
