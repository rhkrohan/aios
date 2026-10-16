// DisplayArea: resolution, scale, rotation, refresh rate, brightness, Night Light (kscreen-doctor, KWin's NightLight).
#pragma once

#include "area.h"

class DisplayArea : public Area
{
    Q_OBJECT
public:
    explicit DisplayArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
