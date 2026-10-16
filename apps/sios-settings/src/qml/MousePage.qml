// Mouse & touchpad: speed, natural scrolling, tap to click (KWin's input devices over D-Bus).
// Reads `mouse.state`, changes with `mouse.set(key, value)` and `mouse.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) mouse.refresh()
    PageTitle { title: "Mouse & touchpad"; sub: "" }
}
