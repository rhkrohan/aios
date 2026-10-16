// Accessibility: larger text, reduce motion, sticky and slow keys, high contrast (kdeglobals, kaccessrc).
#pragma once

#include "area.h"

class AccessArea : public Area
{
    Q_OBJECT
public:
    explicit AccessArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
