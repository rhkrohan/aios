#include "notifs.h"

NotifsArea::NotifsArea(QObject *parent)
    : Area(parent)
{
}

void NotifsArea::refresh()
{
}

void NotifsArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void NotifsArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
