#include "users.h"

UsersArea::UsersArea(QObject *parent)
    : Area(parent)
{
}

void UsersArea::refresh()
{
}

void UsersArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void UsersArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
