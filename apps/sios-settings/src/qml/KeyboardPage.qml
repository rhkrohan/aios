// Keyboard: layouts (add, remove, order), the key that switches them, key repeat
// with a field to try it, Num Lock at start; advanced: Caps Lock and the compose key.
// Reads `keyboard.state`, changes with `keyboard.set(key, value)` and `keyboard.act(name, params)`.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

ColumnLayout {
    id: pg
    spacing: 18
    // the backend, by a name a click handler can't hide
    readonly property QtObject area: keyboard
    readonly property var st: area.state
    readonly property var layouts: st.layouts || []
    property bool adding: false
    readonly property string query: search.text.trim().toLowerCase()
    onVisibleChanged: if (visible) area.refresh()
    Component.onCompleted: if (visible) area.refresh()

    PageTitle { title: "Keyboard"; sub: "The layouts you type with, how keys repeat, and what the special keys do." }

    // ---- layouts
    Card {
        RowLayout {
            Text { Layout.fillWidth: true; text: "Layouts"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
            Button { visible: !pg.adding; text: "Add a layout"; kind: "plain"; onClicked: { pg.adding = true; search.text = ""; search.field.forceActiveFocus(); } }
        }
        Group {
            Repeater {
                model: pg.layouts
                delegate: Item {
                    id: lay
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    implicitHeight: 56
                    Rectangle { visible: lay.index > 0; width: parent.width; height: 1; color: Theme.surface3 }
                    RowLayout {
                        anchors { fill: parent; leftMargin: 16; rightMargin: 12 }
                        spacing: 12
                        Rectangle {
                            implicitWidth: 40; implicitHeight: 28; radius: 7
                            color: lay.index === 0 ? Theme.accentSoft : Theme.surface3
                            Text { anchors.centerIn: parent; textFormat: Text.PlainText; text: String(lay.modelData.code).toUpperCase(); color: lay.index === 0 ? Theme.accent : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 1
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: lay.modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
                            Text { visible: lay.index === 0; text: "Used first"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                        // move up or down, remove (one layout always stays)
                        Repeater {
                            model: [[-1, 270, lay.index > 0], [1, 90, lay.index < pg.layouts.length - 1]]
                            delegate: Rectangle {
                                required property var modelData
                                implicitWidth: 30; implicitHeight: 30; radius: 8
                                opacity: modelData[2] ? 1 : 0.3
                                color: mv.containsMouse && modelData[2] ? Theme.surface2 : "transparent"
                                Icon { anchors.centerIn: parent; name: "chevron-right"; rotation: modelData[1]; size: 15; color: Theme.fg2 }
                                MouseArea { id: mv; anchors.fill: parent; hoverEnabled: true; enabled: modelData[2]; cursorShape: Qt.PointingHandCursor; onClicked: pg.area.act("move", { index: lay.index, by: modelData[0] }) }
                                Accessible.role: Accessible.Button
                                Accessible.name: modelData[0] < 0 ? "Move up" : "Move down"
                            }
                        }
                        Button { visible: pg.layouts.length > 1; text: "Remove"; kind: "plain"; onClicked: pg.area.act("remove", { index: lay.index }) }
                    }
                }
            }
        }
        // add: search every layout the system knows
        ColumnLayout {
            visible: pg.adding
            Layout.fillWidth: true
            spacing: 8
            RowLayout {
                spacing: 8
                Field { id: search; placeholder: "Search languages and layouts, e.g. German, Dvorak, Arabic" }
                Button { text: "Done"; kind: "plain"; onClicked: pg.adding = false }
            }
            Group {
                visible: pg.query.length > 0
                Repeater {
                    model: pg.query.length < 1 ? [] : (pg.st.catalog || []).filter(c => String(c.name).toLowerCase().indexOf(pg.query) >= 0 || String(c.code).toLowerCase() === pg.query).slice(0, 8)
                    delegate: Item {
                        id: hit
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        implicitHeight: 46
                        Rectangle { visible: hit.index > 0; width: parent.width; height: 1; color: Theme.surface3 }
                        Rectangle { anchors { fill: parent; margins: 4 } radius: 8; color: hm.containsMouse ? Theme.surface2 : "transparent" }
                        RowLayout {
                            anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: hit.modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                            Text { textFormat: Text.PlainText; text: hit.modelData.variant ? hit.modelData.code + " · " + hit.modelData.variant : hit.modelData.code; color: Theme.fg3; font.family: "JetBrains Mono"; font.pixelSize: 11 }
                            Icon { name: "plus"; size: 15; color: Theme.accent }
                        }
                        MouseArea { id: hm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { pg.area.act("add", { code: hit.modelData.code, variant: hit.modelData.variant }); pg.adding = false; } }
                    }
                }
            }
            Text { visible: pg.query.length > 0 && (pg.st.catalog || []).length === 0; text: "This computer's list of layouts couldn't be read."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        }
        SettingRow {
            divider: true
            label: "Switch layouts with"
            sub: "Meta+Alt+K always works too."
            Select {
                options: [["", "Meta+Alt+K only"], ["grp:alt_shift_toggle", "Alt+Shift"], ["grp:ctrl_shift_toggle", "Ctrl+Shift"], ["grp:caps_toggle", "Caps Lock"]]
                value: pg.st.switchKey || ""
                onPicked: v => pg.area.set("switchKey", v)
            }
        }
    }

    // ---- key repeat
    Card {
        Text { text: "Key repeat"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
        SettingRow {
            label: "Repeat a key while it's held"
            Toggle { on: !!pg.st.repeat; onToggled: pg.area.set("repeat", !pg.st.repeat) }
        }
        SettingRow {
            enabled: !!pg.st.repeat
            opacity: enabled ? 1 : 0.5
            label: "Wait before repeating"
            sub: (pg.st.delay || 600) + " ms"
            Slider { Layout.fillWidth: false; Layout.preferredWidth: 240; from: 100; to: 1000; stepSize: 25; value: pg.st.delay || 600; onCommitted: v => pg.area.set("delay", Math.round(v)) }
        }
        SettingRow {
            enabled: !!pg.st.repeat
            opacity: enabled ? 1 : 0.5
            label: "Repeat speed"
            sub: Math.round(pg.st.rate || 25) + " a second"
            Slider { Layout.fillWidth: false; Layout.preferredWidth: 240; from: 5; to: 100; stepSize: 1; value: pg.st.rate || 25; onCommitted: v => pg.area.set("rate", Math.round(v)) }
        }
        Field { placeholder: "Hold a key here to try it"; Layout.topMargin: 4 }
    }

    // ---- Num Lock
    Card {
        SettingRow {
            label: "Num Lock when the computer starts"
            Seg { options: [[0, "On"], [1, "Off"], [2, "Leave it"]]; value: pg.st.numlock === undefined ? 2 : pg.st.numlock; onPicked: v => pg.area.set("numlock", v) }
        }
    }

    // ---- the rarer ones
    Advanced {
        Card {
            SettingRow {
                label: "Caps Lock key"
                sub: "What the Caps Lock key does."
                Select {
                    options: [["", "Caps Lock"], ["ctrl:nocaps", "Another Ctrl"], ["caps:escape", "Another Esc"], ["caps:swapescape", "Swap with Esc"], ["ctrl:swapcaps", "Swap with Ctrl"], ["caps:backspace", "Another Backspace"], ["caps:none", "Nothing"]]
                    value: pg.st.caps || ""
                    onPicked: v => pg.area.set("caps", v)
                }
            }
            SettingRow {
                divider: true
                label: "Compose key"
                sub: "Press it, then two keys, to type letters like é or ñ."
                Select {
                    options: [["", "None"], ["compose:ralt", "Right Alt"], ["compose:rwin", "Right Meta"], ["compose:menu", "Menu"], ["compose:caps", "Caps Lock"]]
                    value: pg.st.compose || ""
                    onPicked: v => pg.area.set("compose", v)
                }
            }
        }
    }
}
