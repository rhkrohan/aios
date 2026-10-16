#include "keyboard.h"

KeyboardArea::KeyboardArea(QObject *parent)
    : Area(parent)
{
}

void KeyboardArea::refresh()
{
}

void KeyboardArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void KeyboardArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
