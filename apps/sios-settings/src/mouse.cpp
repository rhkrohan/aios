#include "mouse.h"

MouseArea::MouseArea(QObject *parent)
    : Area(parent)
{
}

void MouseArea::refresh()
{
}

void MouseArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void MouseArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
