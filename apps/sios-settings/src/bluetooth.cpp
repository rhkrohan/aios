#include "bluetooth.h"

BluetoothArea::BluetoothArea(QObject *parent)
    : Area(parent)
{
}

void BluetoothArea::refresh()
{
}

void BluetoothArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void BluetoothArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
