// Display: resolution, scale, rotation, refresh rate, brightness, Night Light
// (kscreen-doctor, KWin's NightLight and knighttimed's schedule).
//   screens   from `kscreen-doctor -j`; changed with its output.<id>.<setting>
//             arguments, all in one call. A resolution, scale, rotation or
//             refresh change waits for "Keep these settings?": unconfirmed, it
//             goes back after 15 seconds (here too, in case the window is gone)
//   night     kwinrc [NightColor] (on, always or with the schedule, warmth) and
//             knighttimerc [General] (sunset to sunrise, or set times)
//   advanced  colour profile, tearing in full screen (kwinrc [Compositing]),
//             how old X11 apps scale (kwinrc [Xwayland]), main screen, arrangement
#pragma once

#include "area.h"

#include <QTimer>

class DisplayArea : public Area
{
    Q_OBJECT
public:
    explicit DisplayArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;

private:
    void readScreens();
    void readNight();
    // apply kscreen-doctor arguments; `undo` (the arguments that put it back) asks to confirm
    void apply(const QStringList &args, const QStringList &undo = {});
    QStringList undoFor(const QVariantMap &screen) const;
    QVariantMap screen(int id) const;
    void kwinReconfigure();

    QVariantList m_screens;
    QStringList m_pendingUndo;
    QTimer m_revert;
};
