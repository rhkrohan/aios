// Notifications: Do Not Disturb, popup position, sounds, per-app on/off (Plasma's plasmanotifyrc).
//   do not disturb  [DoNotDisturb] Until: a date, as capd's settings.dnd does it (2099 for
//                   "until I turn it off"); written with Notify, so Plasma applies it at once
//   popups          [Notifications] PopupPosition, PopupTimeout (ms), CriticalInDndMode,
//                   LowPriorityHistory; sounds: [DoNotDisturb] NotificationSoundsMuted
//   apps            [Applications][<desktop id>] ShowPopups, ShowPopupsInDndMode, ShowInHistory,
//                   for the apps that have sent notifications (their groups exist)
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
