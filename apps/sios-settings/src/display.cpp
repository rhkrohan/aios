#include "display.h"

DisplayArea::DisplayArea(QObject *parent)
    : Area(parent)
{
}

void DisplayArea::refresh()
{
}

void DisplayArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void DisplayArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
