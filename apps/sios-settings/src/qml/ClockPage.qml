// Date & time: automatic time, time zone, 12/24-hour clock (timedatectl, the top bar clock).
// Reads `clock.state`, changes with `clock.set(key, value)`.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

ColumnLayout {
    id: pg
    spacing: 18
    readonly property var s: clock.state
    property date now: new Date()
    property bool picking: false
    onVisibleChanged: if (visible) { clock.refresh(); now = new Date(); }
    Component.onCompleted: if (visible) clock.refresh()
    Timer { interval: 1000; repeat: true; running: pg.visible; onTriggered: pg.now = new Date() }

    PageTitle { title: "Date & time"; sub: "The clock, the calendar and where in the world this computer is." }

    // what time it is now, the way the top bar shows it
    Card {
        RowLayout {
            spacing: 14
            Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 11; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: "clock"; size: 20; color: Theme.accent } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: Qt.formatTime(pg.now, pg.s.h24 ? "HH:mm" : "h:mm AP"); color: Theme.fg; font.family: Theme.display; font.pixelSize: 26; font.weight: Font.DemiBold }
                Text { text: Qt.formatDate(pg.now, "dddd, MMMM d, yyyy") + (pg.s.timezone ? "  ·  " + String(pg.s.timezone).replace(/_/g, " ") : ""); textFormat: Text.PlainText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
    }

    Soon { visible: pg.s.available === false; text: "Date and time can't be read on this computer right now." }

    Card {
        SettingRow {
            label: "Set the time automatically"
            sub: !pg.s.canNtp ? "This computer can't set its time from the internet." : pg.s.ntp ? (pg.s.synced ? "From the internet, and it's right." : "From the internet, once it's connected.") : "Off: you set it below."
            Toggle { visible: !!pg.s.canNtp; on: !!pg.s.ntp; onToggled: clock.set("ntp", !on) }
        }
        // setting it by hand, only while automatic time is off
        RowLayout {
            visible: !pg.s.ntp
            spacing: 8
            Field { id: dayF; Layout.fillWidth: false; Layout.preferredWidth: 150; placeholder: "2026-10-16"; text: Qt.formatDate(pg.now, "yyyy-MM-dd") }
            Field { id: timeF; Layout.fillWidth: false; Layout.preferredWidth: 100; placeholder: "14:30"; text: Qt.formatTime(pg.now, "HH:mm") }
            Button { text: "Set"; onClicked: clock.set("time", dayF.text.trim() + " " + timeF.text.trim()) }
            Item { Layout.fillWidth: true }
        }
        Text {
            visible: !pg.s.ntp
            Layout.fillWidth: true; wrapMode: Text.WordWrap
            text: "Date as year-month-day, time on a 24-hour clock. Changing it asks for your password."
            color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
        }
    }

    // time zone: the current one, and a searchable list to change it
    Card {
        SettingRow {
            label: "Time zone"
            sub: String(pg.s.timezone || "Unknown").replace(/_/g, " ")
            Button { text: pg.picking ? "Done" : "Change"; kind: "plain"; onClicked: { pg.picking = !pg.picking; zoneQ.text = ""; } }
        }
        ColumnLayout {
            visible: pg.picking
            Layout.fillWidth: true
            spacing: 8
            Field { id: zoneQ; placeholder: "Search a city or region: Paris, Tokyo, New York..." }
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 240; radius: 12
                color: Theme.surface; border.width: 1; border.color: Theme.line
                clip: true
                ListView {
                    id: zones
                    anchors { fill: parent; margins: 4 }
                    clip: true
                    readonly property string q: zoneQ.text.trim().toLowerCase().replace(/ /g, "_")
                    model: (pg.s.zones || []).filter(z => !q || z.toLowerCase().indexOf(q) >= 0).slice(0, 200)
                    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                    delegate: Rectangle {
                        required property string modelData
                        width: zones.width
                        height: 36; radius: 8
                        color: zm.containsMouse ? Theme.surface2 : modelData === pg.s.timezone ? Theme.accentSoft : "transparent"
                        Text {
                            anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; leftMargin: 12; rightMargin: 12 }
                            text: modelData.replace(/_/g, " ").replace(/\//g, " / ")
                            textFormat: Text.PlainText; elide: Text.ElideRight
                            color: modelData === pg.s.timezone ? Theme.accent : Theme.fg; font.family: Theme.ui; font.pixelSize: 13
                        }
                        MouseArea { id: zm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { clock.set("timezone", modelData); pg.picking = false; } }
                    }
                    Text { anchors.centerIn: parent; visible: zones.count === 0; text: (pg.s.zones || []).length ? "No time zone by that name." : "Loading time zones…"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                }
            }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Changing the time zone asks for your password."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        }
    }

    // the top bar clock
    Card {
        visible: pg.s.hasClock !== false
        SettingRow {
            label: "24-hour clock"
            sub: pg.s.h24 ? "Shows 14:30." : "Shows 2:30 PM."
            Toggle { on: !!pg.s.h24; onToggled: clock.set("h24", !on) }
        }
        SettingRow {
            divider: true
            label: "First day of the week"
            sub: "For the calendar in the top bar."
            Select {
                options: [[-1, "As your region does"], [1, "Monday"], [0, "Sunday"], [6, "Saturday"]]
                value: pg.s.firstDay
                onPicked: v => clock.set("firstDay", v)
            }
        }
    }
    Soon { visible: pg.s.hasClock === false; text: "The top bar has no clock right now, so its settings are hidden." }

    Advanced {
        visible: pg.s.hasClock !== false
        Card {
            SettingRow {
                label: "Show seconds in the top bar"
                Toggle { on: !!pg.s.seconds; onToggled: clock.set("seconds", !on) }
            }
            SettingRow {
                divider: true
                label: "Date in the top bar"
                Select {
                    options: (pg.s.dateFormats || []).map(f => [f, Qt.formatDate(pg.now, f)])
                    value: pg.s.dateFormat
                    onPicked: v => clock.set("dateFormat", v)
                }
            }
        }
    }
}
