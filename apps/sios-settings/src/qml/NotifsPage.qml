// Notifications: Do Not Disturb, popup position, sounds, per-app on/off (Plasma's plasmanotifyrc).
// Reads `notifs.state`, changes with `notifs.set(key, value)` and `notifs.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) notifs.refresh()
    PageTitle { title: "Notifications"; sub: "" }
}
