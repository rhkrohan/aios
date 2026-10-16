// Date & time: automatic time, time zone, 12/24-hour clock (timedatectl, kdeglobals).
#pragma once

#include "area.h"

class ClockArea : public Area
{
    Q_OBJECT
public:
    explicit ClockArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
