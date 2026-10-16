// KeyboardArea: layouts, key repeat (kxkbrc, kcminputrc).
#pragma once

#include "area.h"

class KeyboardArea : public Area
{
    Q_OBJECT
public:
    explicit KeyboardArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
