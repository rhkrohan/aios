// One area of the computer that a Settings page shows and changes (display,
// sound, Bluetooth...). Each area reads the real machine into `state` and
// changes it with `set` (one setting) or `act` (an action: pair, add a printer).
// It answers through `message` (text, error): errors open a window, the rest
// shows as a corner notice. Everything runs in the background; no AI is involved.
#pragma once

#include <QObject>
#include <QProcess>
#include <QVariantMap>
#include <functional>

class Area : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantMap state READ state NOTIFY changed)
public:
    using QObject::QObject;
    QVariantMap state() const { return m_state; }

    // read everything again (the page calls this when it opens)
    Q_INVOKABLE virtual void refresh() {}
    // change one setting
    Q_INVOKABLE virtual void set(const QString &key, const QVariant &value) { Q_UNUSED(key) Q_UNUSED(value) }
    // do one thing (pair a device, add a printer...)
    Q_INVOKABLE virtual void act(const QString &name, const QVariantMap &params) { Q_UNUSED(name) Q_UNUSED(params) }

Q_SIGNALS:
    void changed();
    void message(const QString &text, bool error);

protected:
    void put(const QString &key, const QVariant &value)
    {
        m_state.insert(key, value);
        Q_EMIT changed();
    }
    void replace(const QVariantMap &s)
    {
        m_state = s;
        Q_EMIT changed();
    }
    // a program in the background; `done(exit code, output)`
    void run(const QString &program, const QStringList &args, std::function<void(int, const QString &)> done = {})
    {
        auto *p = new QProcess(this);
        p->setProcessChannelMode(QProcess::MergedChannels);
        connect(p, &QProcess::finished, this, [p, done](int code) {
            const QString out = QString::fromUtf8(p->readAll());
            p->deleteLater();
            if (done)
                done(code, out);
        });
        connect(p, &QProcess::errorOccurred, this, [p, done, program](QProcess::ProcessError e) {
            if (e == QProcess::FailedToStart) {
                p->deleteLater();
                if (done)
                    done(-1, program + QStringLiteral(" isn't installed"));
            }
        });
        p->start(program, args);
    }
    QVariantMap m_state;
};
