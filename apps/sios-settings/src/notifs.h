// Notifications: Do Not Disturb, popup position, sounds, per-app on/off (Plasma's plasmanotifyrc).
#pragma once

#include "area.h"

class NotifsArea : public Area
{
    Q_OBJECT
public:
    explicit NotifsArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
