// BluetoothArea: power, nearby devices, pair, connect, forget (BlueZ over D-Bus).
#pragma once

#include "area.h"

class BluetoothArea : public Area
{
    Q_OBJECT
public:
    explicit BluetoothArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
