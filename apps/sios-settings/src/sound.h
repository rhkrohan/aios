// Sound: output and input devices, volumes, mute, a test sound, notification
// sounds, and (Advanced) balance, apps playing now, the device's profile and
// louder than 100%. PipeWire through its PulseAudio side: `pactl -f json` reads,
// `pactl set-*` changes, `pactl subscribe` keeps the page live; notification
// sounds are WirePlumber's stored volume for the notification role
// (pw-metadata route-settings); the test sound is pw-play; the microphone meter
// is parec, only while the owner has it on.
#pragma once

#include "area.h"

#include <QTimer>

class SoundArea : public Area
{
    Q_OBJECT
public:
    explicit SoundArea(QObject *parent = nullptr);
    ~SoundArea() override;
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;

private:
    // a program's standard output only (pactl writes warnings to its error output)
    void out(const QString &program, const QStringList &args, std::function<void(int, const QByteArray &)> done);
    void read();
    void setVolume(const QString &kind, const QString &name, int percent, double balance);
    void watch();
    void meter(bool on);
    void playTest();

    QProcess *m_subscribe = nullptr;
    QProcess *m_meter = nullptr;
    QTimer m_settle;
    double m_peak = 0;
    bool m_reading = false;
    bool m_again = false;
};
