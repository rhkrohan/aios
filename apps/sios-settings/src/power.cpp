#include "power.h"

PowerArea::PowerArea(QObject *parent)
    : Area(parent)
{
}

void PowerArea::refresh()
{
}

void PowerArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void PowerArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
