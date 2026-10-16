// Notifications: Do Not Disturb, popup position, sounds, per-app on/off (Plasma's plasmanotifyrc).
// Reads `notifs.state`, changes with `notifs.set(key, value)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    readonly property var s: notifs.state
    readonly property var apps: s.apps || []
    onVisibleChanged: if (visible) notifs.refresh()
    Component.onCompleted: if (visible) notifs.refresh()
    // Do Not Disturb as one of the four choices
    readonly property string dndPick: !s.dnd ? "off" : s.dndForever ? "forever" : new Date(s.dndUntil * 1000).getDate() !== new Date().getDate() ? "tomorrow" : "hour"

    // an app's two switches on one row
    component AppRow: Item {
        id: ar
        property var app
        property bool divider: false
        property string first: "popups"
        property string firstLabel: "Popups"
        property string second: ""
        property string secondLabel: ""
        Layout.fillWidth: true
        implicitHeight: 52
        Rectangle { visible: ar.divider; width: parent.width; height: 1; color: Theme.surface3 }
        RowLayout {
            anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
            spacing: 10
            Text { Layout.fillWidth: true; text: ar.app.name; textFormat: Text.PlainText; elide: Text.ElideRight; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14 }
            Text { text: ar.firstLabel; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            Toggle { on: !!ar.app[ar.first]; onToggled: notifs.set("app/" + ar.app.id + "/" + ar.first, !on) }
            Item { visible: ar.second !== ""; implicitWidth: 8 }
            Text { visible: ar.second !== ""; text: ar.secondLabel; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            Toggle { visible: ar.second !== ""; on: !!ar.app[ar.second]; onToggled: notifs.set("app/" + ar.app.id + "/" + ar.second, !on) }
        }
    }

    PageTitle { title: "Notifications"; sub: "What may interrupt you, and how." }

    Card {
        RowLayout {
            spacing: 12
            Rectangle {
                implicitWidth: 36; implicitHeight: 36; radius: 10
                color: pg.s.dnd ? Theme.accentSoft : Theme.surface2
                Icon { anchors.centerIn: parent; name: pg.s.dnd ? "bell-off" : "bell"; size: 18; color: pg.s.dnd ? Theme.accent : Theme.fg2 }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Do Not Disturb"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                Text {
                    Layout.fillWidth: true; wrapMode: Text.WordWrap
                    color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                    text: !pg.s.dnd ? "Off. Notifications pop up as they arrive."
                        : pg.s.dndForever ? "On until you turn it off. Notifications wait quietly in the bell."
                        : "On until " + new Date(pg.s.dndUntil * 1000).toLocaleString(Qt.locale(), pg.dndPick === "tomorrow" ? "dddd h:mm ap" : "h:mm ap") + ". Notifications wait quietly in the bell."
                }
            }
        }
        Seg {
            options: [["off", "Off"], ["hour", "For 1 hour"], ["tomorrow", "Until tomorrow"], ["forever", "Until I turn it off"]]
            value: pg.dndPick
            onPicked: v => notifs.set("dnd", v)
        }
    }

    Card {
        SettingRow {
            label: "Where popups appear"
            Select {
                options: [[0, "Next to the bell"], [3, "Top right"], [2, "Top center"], [1, "Top left"], [6, "Bottom right"], [5, "Bottom center"], [4, "Bottom left"]]
                value: pg.s.position
                onPicked: v => notifs.set("position", v)
            }
        }
        SettingRow {
            divider: true
            label: "How long popups stay"
            Select {
                options: [[3000, "3 seconds"], [5000, "5 seconds"], [8000, "8 seconds"], [15000, "15 seconds"], [30000, "30 seconds"]].concat([[3000, 5000, 8000, 15000, 30000].indexOf(pg.s.timeout) < 0 && pg.s.timeout ? [[pg.s.timeout, Math.round(pg.s.timeout / 1000) + " seconds"]] : []])
                value: pg.s.timeout
                onPicked: v => notifs.set("timeout", v)
            }
        }
        SettingRow {
            divider: true
            label: "Notification sounds"
            Toggle { on: !!pg.s.sounds; onToggled: notifs.set("sounds", !on) }
        }
        SettingRow {
            divider: true
            label: "Popups for less important notifications"
            sub: "Off: they go straight to the bell."
            Toggle { on: !!pg.s.lowPopups; onToggled: notifs.set("lowPopups", !on) }
        }
    }

    SectionLabel { text: "Apps" }
    Group {
        Repeater {
            model: pg.apps
            delegate: AppRow {
                required property var modelData
                required property int index
                app: modelData
                divider: index > 0
                second: "history"; secondLabel: "Keep in the bell"
            }
        }
        Text {
            visible: pg.apps.length === 0
            Layout.fillWidth: true
            Layout.margins: 16
            wrapMode: Text.WordWrap
            text: "Apps show up here after they send a notification."
            color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13
        }
    }

    Advanced {
        Card {
            SettingRow {
                label: "Urgent notifications during Do Not Disturb"
                sub: "Things like a battery about to run out still pop up."
                Toggle { on: !!pg.s.critical; onToggled: notifs.set("critical", !on) }
            }
            SettingRow {
                divider: true
                label: "Keep less important notifications in the bell"
                Toggle { on: !!pg.s.lowHistory; onToggled: notifs.set("lowHistory", !on) }
            }
        }
        SectionLabel { visible: pg.apps.length > 0; text: "Allowed during Do Not Disturb" }
        Group {
            visible: pg.apps.length > 0
            Repeater {
                model: pg.apps
                delegate: AppRow {
                    required property var modelData
                    required property int index
                    app: modelData
                    divider: index > 0
                    first: "popupsDnd"; firstLabel: "Pop up anyway"
                }
            }
        }
    }
}
