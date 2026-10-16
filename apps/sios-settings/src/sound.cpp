#include "sound.h"

#include <KConfig>
#include <KConfigGroup>

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QtMath>

static const QString NOTIFY_KEY = QStringLiteral("restore.stream.Output/Audio.media.role:Notification");
static const QString TEST_LEFT = QStringLiteral("/usr/share/sounds/freedesktop/stereo/audio-channel-front-left.oga");
static const QString TEST_RIGHT = QStringLiteral("/usr/share/sounds/freedesktop/stereo/audio-channel-front-right.oga");

SoundArea::SoundArea(QObject *parent)
    : Area(parent)
{
    // changes come in bursts (a slider drag): read once they settle
    m_settle.setSingleShot(true);
    m_settle.setInterval(200);
    connect(&m_settle, &QTimer::timeout, this, &SoundArea::read);
}

SoundArea::~SoundArea()
{
    for (QProcess *p : {m_subscribe, m_meter}) {
        if (p) {
            p->disconnect();
            p->kill();
            p->waitForFinished(500);
        }
    }
}

void SoundArea::out(const QString &program, const QStringList &args, std::function<void(int, const QByteArray &)> done)
{
    auto *p = new QProcess(this);
    p->setProcessChannelMode(QProcess::SeparateChannels);
    connect(p, &QProcess::finished, this, [p, done](int code) {
        const QByteArray o = p->readAllStandardOutput();
        p->deleteLater();
        if (done)
            done(code, o);
    });
    connect(p, &QProcess::errorOccurred, this, [p, done](QProcess::ProcessError e) {
        if (e == QProcess::FailedToStart) {
            p->deleteLater();
            if (done)
                done(-1, {});
        }
    });
    p->start(program, args);
}

void SoundArea::refresh()
{
    watch();
    read();
}

// ---- reading

// pactl's volumes: {"front-left": {"value_percent": "88%"}, ...} -> the average percent
static int percent(const QJsonObject &volume)
{
    int sum = 0, n = 0;
    for (auto it = volume.begin(); it != volume.end(); ++it) {
        sum += it.value().toObject().value(QStringLiteral("value_percent")).toString().remove(QLatin1Char('%')).toInt();
        ++n;
    }
    return n ? qRound(double(sum) / n) : 0;
}

// a device's name as people know it; AirPlay speakers come without one
static QString label(const QJsonObject &o)
{
    const QJsonObject props = o.value(QStringLiteral("properties")).toObject();
    for (const QString &s : {o.value(QStringLiteral("description")).toString(), props.value(QStringLiteral("device.description")).toString()}) {
        if (!s.isEmpty() && s != QLatin1String("(null)"))
            return s;
    }
    const QString name = o.value(QStringLiteral("name")).toString();
    static const QRegularExpression raop(QStringLiteral("^raop_sink\\.([^.]+)"));
    const auto m = raop.match(name);
    if (m.hasMatch())
        return m.captured(1).replace(QLatin1Char('-'), QLatin1Char(' ')) + QStringLiteral(" (AirPlay)");
    return name;
}

void SoundArea::read()
{
    if (m_reading) {
        m_again = true;
        return;
    }
    m_reading = true;
    auto s = std::make_shared<QVariantMap>();
    auto finish = [this, s]() {
        // the meter's live values stay
        (*s)[QStringLiteral("level")] = m_state.value(QStringLiteral("level"), 0.0);
        (*s)[QStringLiteral("metering")] = m_meter != nullptr;
        KConfig plasma(QStringLiteral("plasmaparc"));
        const KConfigGroup g = plasma.group(QStringLiteral("General"));
        (*s)[QStringLiteral("feedback")] = g.readEntry("AudioFeedback", true);
        (*s)[QStringLiteral("louder")] = g.readEntry("RaiseMaximumVolume", false);
        replace(*s);
        m_reading = false;
        if (m_again) {
            m_again = false;
            read();
        }
    };
    out(QStringLiteral("pactl"), {QStringLiteral("-f"), QStringLiteral("json"), QStringLiteral("info")}, [this, s, finish](int code, const QByteArray &o) {
        if (code != 0) {
            (*s)[QStringLiteral("available")] = false;
            finish();
            return;
        }
        const QJsonObject info = QJsonDocument::fromJson(o).object();
        const QString defSink = info.value(QStringLiteral("default_sink_name")).toString();
        const QString defSource = info.value(QStringLiteral("default_source_name")).toString();
        (*s)[QStringLiteral("available")] = true;
        out(QStringLiteral("pactl"), {QStringLiteral("-f"), QStringLiteral("json"), QStringLiteral("list"), QStringLiteral("sinks")}, [this, s, finish, defSink, defSource](int, const QByteArray &o) {
            QVariantList outputs;
            QVariantMap output;
            for (const QJsonValue &v : QJsonDocument::fromJson(o).array()) {
                const QJsonObject x = v.toObject();
                const QString name = x.value(QStringLiteral("name")).toString();
                outputs.append(QVariantMap{{QStringLiteral("name"), name}, {QStringLiteral("label"), label(x)}});
                if (name == defSink) {
                    const QJsonObject vol = x.value(QStringLiteral("volume")).toObject();
                    output = {{QStringLiteral("name"), name},
                              {QStringLiteral("label"), label(x)},
                              {QStringLiteral("volume"), percent(vol)},
                              {QStringLiteral("channels"), vol.size()},
                              {QStringLiteral("mute"), x.value(QStringLiteral("mute")).toBool()},
                              {QStringLiteral("balance"), x.value(QStringLiteral("balance")).toDouble()},
                              {QStringLiteral("card"), x.value(QStringLiteral("properties")).toObject().value(QStringLiteral("device.name")).toString()}};
                }
            }
            (*s)[QStringLiteral("outputs")] = outputs;
            (*s)[QStringLiteral("output")] = output;
            out(QStringLiteral("pactl"), {QStringLiteral("-f"), QStringLiteral("json"), QStringLiteral("list"), QStringLiteral("sources")}, [this, s, finish, defSource](int, const QByteArray &o) {
                QVariantList inputs;
                QVariantMap input;
                for (const QJsonValue &v : QJsonDocument::fromJson(o).array()) {
                    const QJsonObject x = v.toObject();
                    const QString name = x.value(QStringLiteral("name")).toString();
                    // what a speaker plays back isn't a microphone
                    if (name.endsWith(QLatin1String(".monitor")) || x.value(QStringLiteral("properties")).toObject().value(QStringLiteral("device.class")).toString() == QLatin1String("monitor"))
                        continue;
                    inputs.append(QVariantMap{{QStringLiteral("name"), name}, {QStringLiteral("label"), label(x)}});
                    if (name == defSource)
                        input = {{QStringLiteral("name"), name},
                                 {QStringLiteral("label"), label(x)},
                                 {QStringLiteral("volume"), percent(x.value(QStringLiteral("volume")).toObject())},
                                 {QStringLiteral("mute"), x.value(QStringLiteral("mute")).toBool()}};
                }
                (*s)[QStringLiteral("inputs")] = inputs;
                (*s)[QStringLiteral("input")] = input;
                out(QStringLiteral("pactl"), {QStringLiteral("-f"), QStringLiteral("json"), QStringLiteral("list"), QStringLiteral("cards")}, [this, s, finish](int, const QByteArray &o) {
                    // the profiles of the card the chosen output belongs to
                    const QString card = (*s)[QStringLiteral("output")].toMap().value(QStringLiteral("card")).toString();
                    QVariantList profiles;
                    QString active;
                    for (const QJsonValue &v : QJsonDocument::fromJson(o).array()) {
                        const QJsonObject c = v.toObject();
                        if (c.value(QStringLiteral("name")).toString() != card)
                            continue;
                        active = c.value(QStringLiteral("active_profile")).toString();
                        const QJsonObject ps = c.value(QStringLiteral("profiles")).toObject();
                        for (auto it = ps.begin(); it != ps.end(); ++it) {
                            const QJsonObject p = it.value().toObject();
                            if (it.key() != QLatin1String("off") && p.value(QStringLiteral("available")).toBool(true))
                                // one [name, label] pair (appending a bare list would flatten it)
                                profiles.append(QVariant(QVariantList{it.key(), p.value(QStringLiteral("description")).toString()}));
                        }
                    }
                    (*s)[QStringLiteral("profiles")] = profiles;
                    (*s)[QStringLiteral("profile")] = active;
                    out(QStringLiteral("pactl"), {QStringLiteral("-f"), QStringLiteral("json"), QStringLiteral("list"), QStringLiteral("sink-inputs")}, [this, s, finish](int, const QByteArray &o) {
                        QVariantList apps;
                        for (const QJsonValue &v : QJsonDocument::fromJson(o).array()) {
                            const QJsonObject x = v.toObject();
                            const QJsonObject props = x.value(QStringLiteral("properties")).toObject();
                            if (props.value(QStringLiteral("media.role")).toString() == QLatin1String("event"))
                                continue;   // short system sounds come and go
                            QString name = props.value(QStringLiteral("application.name")).toString();
                            if (name.isEmpty())
                                name = props.value(QStringLiteral("media.name")).toString();
                            apps.append(QVariantMap{{QStringLiteral("index"), x.value(QStringLiteral("index")).toInt()},
                                                    {QStringLiteral("name"), name},
                                                    {QStringLiteral("volume"), percent(x.value(QStringLiteral("volume")).toObject())},
                                                    {QStringLiteral("mute"), x.value(QStringLiteral("mute")).toBool()}});
                        }
                        (*s)[QStringLiteral("apps")] = apps;
                        // notification sounds: WirePlumber's stored volume for that role
                        out(QStringLiteral("pw-metadata"), {QStringLiteral("-n"), QStringLiteral("route-settings")}, [s, finish](int, const QByteArray &o) {
                            static const QRegularExpression re(QStringLiteral("key:'%1' value:'([^']*)'").arg(QRegularExpression::escape(NOTIFY_KEY)));
                            const auto m = re.match(QString::fromUtf8(o));
                            const QJsonObject n = m.hasMatch() ? QJsonDocument::fromJson(m.captured(1).toUtf8()).object() : QJsonObject();
                            const double linear = n.value(QStringLiteral("volume")).toDouble(1.0);
                            // stored as a linear factor; people see the cubic percent, as everywhere else
                            (*s)[QStringLiteral("notify")] = QVariantMap{{QStringLiteral("volume"), qRound(std::cbrt(qMax(0.0, linear)) * 100)},
                                                                       {QStringLiteral("mute"), n.value(QStringLiteral("mute")).toBool(false)}};
                            finish();
                        });
                    });
                });
            });
        });
    });
}

// ---- live

void SoundArea::watch()
{
    if (m_subscribe)
        return;
    m_subscribe = new QProcess(this);
    m_subscribe->setProcessChannelMode(QProcess::SeparateChannels);
    connect(m_subscribe, &QProcess::readyReadStandardOutput, this, [this] {
        const QByteArray lines = m_subscribe->readAllStandardOutput();
        for (const char *what : {"sink", "source", "server", "card"}) {
            if (lines.contains(what)) {
                m_settle.start();
                return;
            }
        }
    });
    connect(m_subscribe, &QProcess::finished, this, [this] {
        m_subscribe->deleteLater();
        m_subscribe = nullptr;
    });
    m_subscribe->start(QStringLiteral("pactl"), {QStringLiteral("subscribe")});
}

// ---- changing

void SoundArea::setVolume(const QString &kind, const QString &name, int percent, double balance)
{
    const int top = m_state.value(QStringLiteral("louder")).toBool() ? 150 : 100;
    percent = qBound(0, percent, top);
    QStringList args{QStringLiteral("set-%1-volume").arg(kind), name};
    const int channels = m_state.value(QStringLiteral("output")).toMap().value(QStringLiteral("channels")).toInt();
    if (kind == QLatin1String("sink") && channels == 2 && !qFuzzyIsNull(balance)) {
        balance = qBound(-1.0, balance, 1.0);
        args << QStringLiteral("%1%").arg(qRound(percent * (balance > 0 ? 1 - balance : 1.0)))
             << QStringLiteral("%1%").arg(qRound(percent * (balance < 0 ? 1 + balance : 1.0)));
    } else {
        args << QStringLiteral("%1%").arg(percent);
    }
    out(QStringLiteral("pactl"), args, {});
}

static bool listed(const QVariant &list, const QString &name)
{
    for (const QVariant &v : list.toList()) {
        if (v.toMap().value(QStringLiteral("name")).toString() == name)
            return true;
    }
    return false;
}

void SoundArea::set(const QString &key, const QVariant &value)
{
    const QVariantMap output = m_state.value(QStringLiteral("output")).toMap();
    const QVariantMap input = m_state.value(QStringLiteral("input")).toMap();
    const QString sink = output.value(QStringLiteral("name")).toString();
    const QString source = input.value(QStringLiteral("name")).toString();
    const auto failed = [this](const QString &what) {
        return [this, what](int code, const QByteArray &) {
            if (code != 0)
                Q_EMIT message(QStringLiteral("Couldn't %1.").arg(what), true);
        };
    };

    if (key == QLatin1String("output") && listed(m_state.value(QStringLiteral("outputs")), value.toString())) {
        out(QStringLiteral("pactl"), {QStringLiteral("set-default-sink"), value.toString()}, failed(QStringLiteral("switch the output")));
    } else if (key == QLatin1String("volume") && !sink.isEmpty()) {
        setVolume(QStringLiteral("sink"), sink, value.toInt(), output.value(QStringLiteral("balance")).toDouble());
    } else if (key == QLatin1String("balance") && !sink.isEmpty()) {
        setVolume(QStringLiteral("sink"), sink, output.value(QStringLiteral("volume")).toInt(), value.toDouble());
    } else if (key == QLatin1String("mute") && !sink.isEmpty()) {
        out(QStringLiteral("pactl"), {QStringLiteral("set-sink-mute"), sink, value.toBool() ? QStringLiteral("1") : QStringLiteral("0")}, {});
    } else if (key == QLatin1String("input") && listed(m_state.value(QStringLiteral("inputs")), value.toString())) {
        out(QStringLiteral("pactl"), {QStringLiteral("set-default-source"), value.toString()}, failed(QStringLiteral("switch the microphone")));
        if (m_meter) {
            meter(false);
            QTimer::singleShot(400, this, [this] { meter(true); });
        }
    } else if (key == QLatin1String("inputVolume") && !source.isEmpty()) {
        out(QStringLiteral("pactl"), {QStringLiteral("set-source-volume"), source, QStringLiteral("%1%").arg(qBound(0, value.toInt(), 150))}, {});
    } else if (key == QLatin1String("inputMute") && !source.isEmpty()) {
        out(QStringLiteral("pactl"), {QStringLiteral("set-source-mute"), source, value.toBool() ? QStringLiteral("1") : QStringLiteral("0")}, {});
    } else if (key == QLatin1String("profile")) {
        const QString card = output.value(QStringLiteral("card")).toString();
        bool known = false;
        for (const QVariant &p : m_state.value(QStringLiteral("profiles")).toList())
            known = known || p.toList().value(0).toString() == value.toString();
        if (!card.isEmpty() && known)
            out(QStringLiteral("pactl"), {QStringLiteral("set-card-profile"), card, value.toString()}, failed(QStringLiteral("change the profile")));
    } else if (key == QLatin1String("louder") || key == QLatin1String("feedback")) {
        KConfig plasma(QStringLiteral("plasmaparc"));
        plasma.group(QStringLiteral("General")).writeEntry(key == QLatin1String("louder") ? "RaiseMaximumVolume" : "AudioFeedback", value.toBool());
        plasma.sync();
        // back under 100% when louder is turned off
        if (key == QLatin1String("louder") && !value.toBool() && output.value(QStringLiteral("volume")).toInt() > 100) {
            put(QStringLiteral("louder"), false);
            setVolume(QStringLiteral("sink"), sink, 100, output.value(QStringLiteral("balance")).toDouble());
        }
        read();
    } else if (key == QLatin1String("notifyVolume") || key == QLatin1String("notifyMute")) {
        const QVariantMap n = m_state.value(QStringLiteral("notify")).toMap();
        const int pct = key == QLatin1String("notifyVolume") ? qBound(0, value.toInt(), 100) : n.value(QStringLiteral("volume"), 100).toInt();
        const bool mute = key == QLatin1String("notifyMute") ? value.toBool() : n.value(QStringLiteral("mute")).toBool();
        const double linear = std::pow(pct / 100.0, 3);
        const QJsonObject v{{QStringLiteral("mute"), mute},
                            {QStringLiteral("volume"), linear},
                            {QStringLiteral("volumes"), QJsonArray{linear, linear}},
                            {QStringLiteral("channels"), QJsonArray{QStringLiteral("FL"), QStringLiteral("FR")}}};
        out(QStringLiteral("pw-metadata"),
            {QStringLiteral("-n"), QStringLiteral("route-settings"), QStringLiteral("0"), NOTIFY_KEY, QString::fromUtf8(QJsonDocument(v).toJson(QJsonDocument::Compact)), QStringLiteral("Spa:String:JSON")},
            [this](int code, const QByteArray &) {
                if (code != 0)
                    Q_EMIT message(QStringLiteral("Couldn't change notification sounds."), true);
                read();
            });
    }
}

void SoundArea::act(const QString &name, const QVariantMap &params)
{
    if (name == QLatin1String("test")) {
        playTest();
    } else if (name == QLatin1String("meter")) {
        meter(params.value(QStringLiteral("on")).toBool());
    } else if (name == QLatin1String("appVolume") || name == QLatin1String("appMute")) {
        const int index = params.value(QStringLiteral("index")).toInt();
        bool known = false;
        for (const QVariant &a : m_state.value(QStringLiteral("apps")).toList())
            known = known || a.toMap().value(QStringLiteral("index")).toInt() == index;
        if (!known)
            return;
        if (name == QLatin1String("appVolume"))
            out(QStringLiteral("pactl"), {QStringLiteral("set-sink-input-volume"), QString::number(index), QStringLiteral("%1%").arg(qBound(0, params.value(QStringLiteral("volume")).toInt(), 150))}, {});
        else
            out(QStringLiteral("pactl"), {QStringLiteral("set-sink-input-mute"), QString::number(index), params.value(QStringLiteral("mute")).toBool() ? QStringLiteral("1") : QStringLiteral("0")}, {});
    }
}

// "Front left", then "Front right", on the chosen output
void SoundArea::playTest()
{
    const QString sink = m_state.value(QStringLiteral("output")).toMap().value(QStringLiteral("name")).toString();
    if (sink.isEmpty())
        return;
    out(QStringLiteral("pw-play"), {QStringLiteral("--target"), sink, TEST_LEFT}, [this, sink](int code, const QByteArray &) {
        if (code != 0) {
            Q_EMIT message(QStringLiteral("Couldn't play the test sound."), true);
            return;
        }
        out(QStringLiteral("pw-play"), {QStringLiteral("--target"), sink, TEST_RIGHT}, {});
    });
}

// The microphone's level, only while the owner has "Test your microphone" on:
// 8 kHz mono from the chosen input, the loudest sample of each short piece.
void SoundArea::meter(bool on)
{
    if (!on) {
        if (m_meter) {
            m_meter->disconnect();
            m_meter->kill();
            m_meter->deleteLater();
            m_meter = nullptr;
        }
        m_peak = 0;
        put(QStringLiteral("level"), 0.0);
        put(QStringLiteral("metering"), false);
        return;
    }
    const QString source = m_state.value(QStringLiteral("input")).toMap().value(QStringLiteral("name")).toString();
    if (m_meter || source.isEmpty())
        return;
    m_meter = new QProcess(this);
    connect(m_meter, &QProcess::readyReadStandardOutput, this, [this] {
        const QByteArray b = m_meter->readAllStandardOutput();
        const auto *s = reinterpret_cast<const qint16 *>(b.constData());
        int loud = 0;
        for (qsizetype i = 0; i < b.size() / 2; ++i)
            loud = qMax(loud, qAbs(int(s[i])));
        m_peak = qMax(m_peak * 0.8, loud / 32768.0);
        put(QStringLiteral("level"), m_peak);
    });
    connect(m_meter, &QProcess::finished, this, [this] {
        if (m_meter) {
            m_meter->deleteLater();
            m_meter = nullptr;
            put(QStringLiteral("metering"), false);
            put(QStringLiteral("level"), 0.0);
        }
    });
    m_meter->start(QStringLiteral("parec"), {QStringLiteral("--raw"), QStringLiteral("--format=s16le"), QStringLiteral("--channels=1"), QStringLiteral("--rate=8000"), QStringLiteral("--latency-msec=60"), QStringLiteral("-d"), source});
    put(QStringLiteral("metering"), true);
}
