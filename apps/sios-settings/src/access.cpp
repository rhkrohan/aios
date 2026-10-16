#include "access.h"

AccessArea::AccessArea(QObject *parent)
    : Area(parent)
{
}

void AccessArea::refresh()
{
}

void AccessArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void AccessArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
