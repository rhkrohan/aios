// PowerArea: profile, screen off and sleep timers, battery (power-profiles-daemon, PowerDevil).
#pragma once

#include "area.h"

class PowerArea : public Area
{
    Q_OBJECT
public:
    explicit PowerArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
