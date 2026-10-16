// Keyboard: layouts, key repeat (kxkbrc, kcminputrc).
// Reads `keyboard.state`, changes with `keyboard.set(key, value)` and `keyboard.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) keyboard.refresh()
    PageTitle { title: "Keyboard"; sub: "" }
}
