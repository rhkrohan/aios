// MouseArea & touchpad: speed, natural scrolling, tap to click (KWin's input devices over D-Bus).
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
