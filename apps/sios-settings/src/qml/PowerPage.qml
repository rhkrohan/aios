// Power: profile, screen off and sleep timers, battery (power-profiles-daemon, PowerDevil).
// Reads `power.state`, changes with `power.set(key, value)` and `power.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) power.refresh()
    PageTitle { title: "Power"; sub: "" }
}
