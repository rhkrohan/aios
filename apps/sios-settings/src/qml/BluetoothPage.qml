// Bluetooth: power, nearby devices, pair, connect, forget (BlueZ over D-Bus).
// Reads `bluetooth.state`, changes with `bluetooth.set(key, value)` and `bluetooth.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) bluetooth.refresh()
    PageTitle { title: "Bluetooth"; sub: "" }
}
