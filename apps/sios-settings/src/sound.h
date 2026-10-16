// SoundArea: output and input devices, volumes, mute, a test sound (PipeWire: wpctl, pw-dump).
#pragma once

#include "area.h"

class SoundArea : public Area
{
    Q_OBJECT
public:
    explicit SoundArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
