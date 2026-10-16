#include "sound.h"

SoundArea::SoundArea(QObject *parent)
    : Area(parent)
{
}

void SoundArea::refresh()
{
}

void SoundArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void SoundArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
