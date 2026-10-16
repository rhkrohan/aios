#include "printers.h"

PrintersArea::PrintersArea(QObject *parent)
    : Area(parent)
{
}

void PrintersArea::refresh()
{
}

void PrintersArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void PrintersArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
