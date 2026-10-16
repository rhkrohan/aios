// Power: profile, screen off and sleep timers, battery (power-profiles-daemon, PowerDevil).
//   power mode   the system's power profiles (org.freedesktop.UPower.PowerProfiles over
//                D-Bus, served by power-profiles-daemon or tuned-ppd); only the ones offered
//   battery      UPower's display device (level, charging, time left)
//   timers       PowerDevil 6's powerdevilrc: [AC] and [Battery], each with [Display]
//                (dim, screen off) and [SuspendAndShutdown] (sleep, power button, lid)
//   advanced     lid, critical battery ([BatteryManagement]), pause media on sleep ([General])
// PowerDevil reads its file again when told (reparseConfiguration), so changes apply at once.
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

private:
    void readProfiles();
    void readBattery();
    void readTimers();
    void reloadPowerDevil();
};
