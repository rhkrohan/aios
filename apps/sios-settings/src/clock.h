// Date & time: automatic time, time zone, 12/24-hour clock (timedatectl, the top bar clock).
//   time and zone   systemd's timedatectl (show, set-ntp, set-time, set-timezone,
//                   list-timezones); changes ask for an administrator through polkit
//   the clock       the top bar's clock is Plasma's digital clock (the SIOS layout adds it);
//                   24-hour, seconds, first day of the week and the date format are its
//                   Appearance settings, read from plasma-org.kde.plasma.desktop-appletsrc
//                   and written through Plasma's own scripting call (evaluateScript)
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

private:
    void readTime();
    void readClockWidget();
    void writeClockWidget(const QString &key, const QString &jsValue);
    QStringList m_zones;
};
