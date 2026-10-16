// Accessibility: larger text, reduce motion, high contrast, a bigger pointer,
// sticky, slow and bounce keys, the screen reader, zoom, the visual bell.
//   text      kdeglobals fonts, scaled from SIOS's sizes ([SIOS] TextScale keeps the choice)
//   motion    kdeglobals [KDE] AnimationDurationFactor (0 is none)
//   contrast  a SIOS High Contrast colour scheme made from SIOS Light in
//             ~/.local/share/color-schemes, applied with plasma-apply-colorscheme
//   pointer   plasma-apply-cursortheme --size (kcminputrc [Mouse])
//   keys, bell, screen reader  kaccessrc, then kaccess reads it again
//   zoom      KWin's zoom effect (kwinrc [Plugins] zoomEnabled; loaded live)
#pragma once

#include "area.h"

class AccessArea : public Area
{
    Q_OBJECT
public:
    explicit AccessArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;

private:
    void setTextScale(int percent);
    void setHighContrast(bool on);
    void restartKaccess();
};
