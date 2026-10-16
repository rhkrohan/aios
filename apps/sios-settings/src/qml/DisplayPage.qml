// Display: resolution, scale, rotation, refresh rate, brightness, Night Light (kscreen-doctor, KWin's NightLight).
// Reads `display.state`, changes with `display.set(key, value)` and `display.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) display.refresh()
    PageTitle { title: "Display"; sub: "" }
}
