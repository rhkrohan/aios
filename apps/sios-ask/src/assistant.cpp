#include "assistant.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>

static QString socketPath()
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    return dir + QStringLiteral("/brain.sock");
}

Assistant::Assistant(QObject *parent)
    : QObject(parent)
{
    m_poll.setInterval(400);
    connect(&m_poll, &QTimer::timeout, this, &Assistant::poll);
}

void Assistant::send(const QString &method, const QVariantMap &params, std::function<void(const QVariant &, const QString &)> then)
{
    auto *s = new QLocalSocket(this);
    auto *buf = new QByteArray;
    auto finish = [s, buf, then](const QVariant &ok, const QString &err) {
        then(ok, err);
        delete buf;
        s->disconnect();
        s->abort();
        s->deleteLater();
    };
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
    connect(s, &QLocalSocket::errorOccurred, s, [finish](QLocalSocket::LocalSocketError) { finish({}, QStringLiteral("SIOS's assistant isn't running.")); });
    s->connectToServer(socketPath());
}

void Assistant::ask(const QString &text)
{
    m_request = text.trimmed();
    m_events.clear();
    m_next = 0;
    m_running = true;
    Q_EMIT eventsChanged();
    // "@coder add tests": a task for one of your agents (A6); its reports go to Agents
    if (m_request.startsWith(QLatin1Char('@'))) {
        const int sp = m_request.indexOf(QLatin1Char(' '));
        const QString name = m_request.mid(1, sp < 0 ? -1 : sp - 1), task = sp < 0 ? QString() : m_request.mid(sp + 1).trimmed();
        send(QStringLiteral("agent.task"), {{QStringLiteral("agent"), name}, {QStringLiteral("task"), task}}, [this, name](const QVariant &, const QString &err) {
            m_events.append(err.isEmpty()
                ? QVariantMap{{QStringLiteral("t"), QStringLiteral("done")}, {QStringLiteral("text"), name + QStringLiteral(" is on it, in its own workspace. Its reports come to the Agents app.")}}
                : QVariantMap{{QStringLiteral("t"), QStringLiteral("error")}, {QStringLiteral("message"), err}});
            m_running = false;
            Q_EMIT eventsChanged();
        });
        return;
    }
    QVariantMap p{{QStringLiteral("request"), m_request}};
    if (!m_thread.isEmpty())
        p.insert(QStringLiteral("thread"), m_thread);
    send(QStringLiteral("goal.start"), p, [this](const QVariant &ok, const QString &err) {
        if (!err.isEmpty()) {
            m_events.append(QVariantMap{{QStringLiteral("t"), QStringLiteral("error")}, {QStringLiteral("message"), err}});
            m_running = false;
            Q_EMIT eventsChanged();
            return;
        }
        m_goal = ok.toMap().value(QStringLiteral("goal")).toString();
        m_thread = ok.toMap().value(QStringLiteral("thread")).toString();
        m_poll.start();
    });
}

void Assistant::reset()
{
    m_poll.stop();
    m_thread.clear();
    m_goal.clear();
    m_events.clear();
    m_running = false;
    Q_EMIT eventsChanged();
}

void Assistant::poll()
{
    if (m_goal.isEmpty())
        return;
    send(QStringLiteral("goal.events"), {{QStringLiteral("goal"), m_goal}, {QStringLiteral("since"), m_next}}, [this](const QVariant &ok, const QString &err) {
        if (!err.isEmpty())
            return;
        const QVariantMap v = ok.toMap();
        const QVariantList fresh = v.value(QStringLiteral("events")).toList();
        m_next = v.value(QStringLiteral("next")).toInt();
        const bool over = v.value(QStringLiteral("over")).toBool();
        if (!fresh.isEmpty() || over != !m_running) {
            m_events += fresh;
            m_running = !over;
            if (over)
                m_poll.stop();
            Q_EMIT eventsChanged();
        }
    });
}

void Assistant::refreshCards()
{
    send(QStringLiteral("suggest.headlines"), {}, [this](const QVariant &ok, const QString &err) {
        m_cards = err.isEmpty() ? ok.toList() : QVariantList();
        Q_EMIT cardsChanged();
    });
}

void Assistant::act(const QString &card)
{
    m_events.clear();
    m_next = 0;
    m_running = true;
    m_request = QStringLiteral("…");
    Q_EMIT eventsChanged();
    send(QStringLiteral("suggest.act"), {{QStringLiteral("id"), card}}, [this](const QVariant &ok, const QString &err) {
        if (!err.isEmpty()) {
            m_events.append(QVariantMap{{QStringLiteral("t"), QStringLiteral("error")}, {QStringLiteral("message"), err}});
            m_running = false;
            Q_EMIT eventsChanged();
            return;
        }
        const QVariantMap m = ok.toMap();
        m_request = m.value(QStringLiteral("request")).toString();
        m_goal = m.value(QStringLiteral("goal")).toString();
        m_thread = m.value(QStringLiteral("thread")).toString();
        Q_EMIT eventsChanged();
        m_poll.start();
        refreshCards();
    });
}

void Assistant::dismiss(const QString &card)
{
    send(QStringLiteral("suggest.dismiss"), {{QStringLiteral("id"), card}}, [this](const QVariant &, const QString &) { refreshCards(); });
}
