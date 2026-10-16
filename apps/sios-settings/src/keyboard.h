// Keyboard: layouts, the key that switches them, key repeat, Num Lock at start,
// and (advanced) what Caps Lock does and the compose key. Written where KDE keeps
// them (kxkbrc, kcminputrc) and applied live: KWin reloads layouts on the
// org.kde.keyboard reloadConfig signal and key repeat on its reconfigure call.
#pragma once

#include "area.h"

class KeyboardArea : public Area
{
    Q_OBJECT
public:
    explicit KeyboardArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;

private:
    void writeLayouts(const QVariantList &layouts, const QStringList &options);
    QStringList options() const;
    QVariantList m_catalog;
};
