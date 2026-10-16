#include "clock.h"

ClockArea::ClockArea(QObject *parent)
    : Area(parent)
{
}

void ClockArea::refresh()
{
}

void ClockArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void ClockArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
