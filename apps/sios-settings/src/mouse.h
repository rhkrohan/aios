// Mouse & touchpad: speed, acceleration, natural scrolling, left-handed, scroll
// speed; for a touchpad also tap to click, two-finger click, disable while
// typing; and (advanced) middle-click emulation and the scroll method. Set on
// KWin's input devices over D-Bus (org.kde.KWin /org/kde/KWin/InputDevice/*),
// which apply at once and keep them in kcminputrc themselves.
#pragma once

#include "area.h"

class MouseArea : public Area
{
    Q_OBJECT
public:
    explicit MouseArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
