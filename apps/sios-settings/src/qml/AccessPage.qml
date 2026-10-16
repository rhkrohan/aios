// Accessibility: larger text, reduce motion, sticky and slow keys, high contrast (kdeglobals, kaccessrc).
// Reads `access.state`, changes with `access.set(key, value)` and `access.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) access.refresh()
    PageTitle { title: "Accessibility"; sub: "" }
}
