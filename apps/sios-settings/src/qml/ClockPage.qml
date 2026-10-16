// Date & time: automatic time, time zone, 12/24-hour clock (timedatectl, kdeglobals).
// Reads `clock.state`, changes with `clock.set(key, value)` and `clock.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) clock.refresh()
    PageTitle { title: "Date & time"; sub: "" }
}
