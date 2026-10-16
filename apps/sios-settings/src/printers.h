// PrintersArea: found printers, add one (driverless), default, test page (CUPS: lpstat, lpadmin).
#pragma once

#include "area.h"

class PrintersArea : public Area
{
    Q_OBJECT
public:
    explicit PrintersArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
