// Bluetooth: on/off, this computer's name and visibility, your devices, adding
// one, and Advanced (bluetooth.cpp: BlueZ over D-Bus). Pairing questions open a
// real window. Device names come from the devices themselves: plain text only.
// Reads `bluetooth.state`, changes with `bluetooth.set(key, value)` and `bluetooth.act(name, params)`.
import QtQuick
import QtQuick.Layouts
import QtQuick.Window

ColumnLayout {
    id: pg
    spacing: 18
    readonly property var st: bluetooth.state
    readonly property var adapter: st.adapter || ({})
    readonly property bool on: !!adapter.powered
    readonly property var paired: (st.devices || []).filter(d => d.paired)
    // nearby devices that can be paired; ones that only show an address are left out
    readonly property var nearby: (st.devices || []).filter(d => !d.paired && d.named)
    // opened on this page from the start, `visible` never changes: read once now too
    Component.onCompleted: if (visible) bluetooth.refresh()
    onVisibleChanged: {
        if (visible) bluetooth.refresh();
        else if (adapter.scanning) bluetooth.act("scan", { on: false });
    }

    // a device's kind from BlueZ's icon name
    function iconFor(d) {
        const i = String(d.icon || "");
        if (i.indexOf("headset") >= 0 || i.indexOf("headphone") >= 0) return "headphones";
        if (i.indexOf("phone") >= 0) return "smartphone";
        if (i.indexOf("computer") >= 0) return "laptop";
        if (i.indexOf("keyboard") >= 0) return "keyboard";
        if (i.indexOf("mouse") >= 0 || i.indexOf("tablet") >= 0) return "mouse";
        if (i.indexOf("speaker") >= 0 || i.indexOf("audio") >= 0) return "speaker";
        if (i.indexOf("watch") >= 0) return "watch";
        if (i.indexOf("joypad") >= 0 || i.indexOf("gaming") >= 0) return "gamepad-2";
        return "bluetooth";
    }

    component DeviceRow: Item {
        id: dr
        property var dev
        property bool first: false
        // inside a Group the row keeps its own margins; inside a Card the card has them
        property int inset: 16
        default property alias actions: tail.data
        Layout.fillWidth: true
        implicitHeight: 64
        Rectangle { visible: !dr.first; width: parent.width; height: 1; color: Theme.surface3 }
        RowLayout {
            anchors { fill: parent; leftMargin: dr.inset; rightMargin: dr.inset }
            spacing: 14
            Rectangle {
                implicitWidth: 38; implicitHeight: 38; radius: 11
                color: dr.dev.connected ? Theme.accentSoft : Theme.surface2
                Icon { anchors.centerIn: parent; name: pg.iconFor(dr.dev); size: 18; color: dr.dev.connected ? Theme.accent : Theme.fg2 }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: dr.dev.name || dr.dev.address; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                Text {
                    Layout.fillWidth: true; elide: Text.ElideRight
                    text: dr.dev.paired ? (dr.dev.connected ? "Connected" : "Not connected") + (dr.dev.battery >= 0 ? " · battery " + dr.dev.battery + "%" : "") : "Ready to pair"
                    color: dr.dev.connected ? Theme.ok : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12
                }
            }
            RowLayout { id: tail; spacing: 8 }
        }
    }

    PageTitle { title: "Bluetooth"; sub: "Headphones, keyboards, mice, phones and other devices nearby." }

    // ---- no Bluetooth here
    Card {
        visible: pg.st.available === false
        RowLayout {
            spacing: 14
            Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 11; color: Theme.surface2; Icon { anchors.centerIn: parent; name: "bluetooth-off"; size: 20; color: Theme.fg3 } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "No Bluetooth on this computer"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "SIOS didn't find a Bluetooth adapter. A USB Bluetooth adapter works too: plug one in and it shows up here."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
    }

    // ---- on, name, visible
    Card {
        visible: pg.st.available === true
        SettingRow {
            label: "Bluetooth"
            sub: pg.on ? "On. Devices you've paired connect by themselves." : "Off. Paired devices can't connect."
            Toggle { on: pg.on; onToggled: bluetooth.set("powered", !pg.on) }
        }
        SettingRow {
            visible: pg.on
            divider: true
            label: "This computer's name"
            sub: "What other devices see when they look for this one."
            Field {
                id: nameField
                Layout.preferredWidth: 220
                text: pg.adapter.name || ""
                onAccepted: bluetooth.set("name", text)
                Connections { target: nameField.field; function onEditingFinished() { if (nameField.text !== pg.adapter.name) bluetooth.set("name", nameField.text); } }
            }
        }
        SettingRow {
            visible: pg.on
            divider: true
            label: "Others can find this computer"
            sub: pg.adapter.visible ? "Visible to devices nearby for the next few minutes." : "Only devices you've paired can see it."
            Toggle { on: !!pg.adapter.visible; onToggled: bluetooth.set("visible", !pg.adapter.visible) }
        }
    }

    // ---- your devices
    SectionLabel { visible: pg.st.available === true && pg.on; text: "Your devices" }
    Group {
        visible: pg.st.available === true && pg.on
        Text { visible: pg.paired.length === 0; Layout.margins: 16; text: "No devices yet. Add one below."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
        Repeater {
            model: pg.paired
            delegate: DeviceRow {
                required property var modelData
                required property int index
                dev: modelData
                first: index === 0
                Button { text: modelData.connected ? "Disconnect" : "Connect"; kind: "plain"; onClicked: bluetooth.act(modelData.connected ? "disconnect" : "connect", { path: modelData.path }) }
                Button { text: "Forget"; kind: "danger"; onClicked: { forget.dev = modelData; forget.show(); } }
            }
        }
    }

    // ---- add a device
    SectionLabel { visible: pg.st.available === true && pg.on; text: "Add a device"; Layout.topMargin: 10 }
    Card {
        visible: pg.st.available === true && pg.on
        RowLayout {
            spacing: 12
            Text {
                Layout.fillWidth: true; wrapMode: Text.WordWrap
                text: pg.adapter.scanning ? "Looking for devices nearby… Put your device in pairing mode." : "Put the device in pairing mode (often by holding its power or Bluetooth button), then look for it."
                color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
            }
            Button { text: pg.adapter.scanning ? "Stop" : "Look for devices"; kind: pg.adapter.scanning ? "plain" : "primary"; onClicked: bluetooth.act("scan", { on: !pg.adapter.scanning }) }
        }
        Repeater {
            model: pg.nearby
            delegate: DeviceRow {
                required property var modelData
                dev: modelData
                inset: 0
                Button {
                    text: "Pair"
                    busy: pg.st.pairing === modelData.path
                    onClicked: bluetooth.act("pair", { path: modelData.path })
                }
            }
        }
        Text { visible: !!pg.adapter.scanning && pg.nearby.length === 0; text: "Nothing found yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
    }

    Advanced {
        visible: pg.st.available === true
        Card {
            SettingRow {
                label: "When you sign in"
                sub: "Whether Bluetooth turns on by itself when you sign in."
                Select {
                    options: [["remember", "As it was"], ["enable", "Turn on"], ["disable", "Stay off"]]
                    value: pg.st.launch || "remember"
                    onPicked: v => bluetooth.set("launch", v)
                }
            }
            SettingRow {
                divider: true
                label: "Adapter address"
                sub: "This computer's Bluetooth address."
                Text { textFormat: Text.PlainText; text: pg.adapter.address || ""; color: Theme.fg2; font.family: "JetBrains Mono"; font.pixelSize: 12 }
            }
        }
    }

    // ---- forgetting asks first
    Window {
        id: forget
        property var dev: ({})
        flags: Qt.Dialog
        modality: Qt.ApplicationModal
        title: "Forget this device?"
        width: 460; height: fc.implicitHeight + 110
        minimumWidth: 460; maximumWidth: 460
        color: Theme.surface
        ColumnLayout {
            id: fc
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 24 }
            spacing: 10
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "Forget " + (forget.dev.name || "this device") + "?"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 20; font.weight: Font.DemiBold }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "It won't connect by itself any more. To use it again, pair it again."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14 }
        }
        Rectangle {
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: 62; color: Theme.surface2
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors { fill: parent; leftMargin: 20; rightMargin: 20 }
                spacing: 8
                Item { Layout.fillWidth: true }
                Button { text: "Cancel"; kind: "plain"; onClicked: forget.close() }
                Button { text: "Forget"; kind: "danger"; onClicked: { bluetooth.act("forget", { path: forget.dev.path }); forget.close(); } }
            }
        }
    }

    // ---- pairing questions from BlueZ: a real window, plain text
    Window {
        id: prompt
        readonly property var p: pg.st.prompt || null
        // shown and hidden from here (closing the window by hand would break a binding)
        onPChanged: p ? show() : hide()
        flags: Qt.Dialog
        modality: Qt.ApplicationModal
        title: "Pair with " + (p ? p.device : "")
        width: 480; height: pc.implicitHeight + 110
        minimumWidth: 480; maximumWidth: 480
        color: Theme.surface
        onVisibleChanged: if (visible) { codeIn.text = ""; requestActivate(); }
        onClosing: if (prompt.p && prompt.p.kind !== "display") bluetooth.act("answer", { id: prompt.p ? prompt.p.id : 0, ok: false })
        ColumnLayout {
            id: pc
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 24 }
            spacing: 12
            RowLayout {
                spacing: 14
                Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 11; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: "bluetooth"; size: 20; color: Theme.accent } }
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "Pair with " + (prompt.p ? prompt.p.device : ""); color: Theme.fg; font.family: Theme.display; font.pixelSize: 20; font.weight: Font.DemiBold }
            }
            Text {
                Layout.fillWidth: true; wrapMode: Text.WordWrap
                text: !prompt.p ? "" : ({
                    confirm: "Check that the device shows the same number, then pair.",
                    display: "Type this code on the device, then press its Enter key.",
                    pin: "Type the PIN the device shows or came with (often 0000 or 1234).",
                    passkey: "Type the six-digit number the device shows.",
                    authorize: "This device wants to pair with your computer. Only allow it if you started this.",
                    service: "A paired device wants to connect. Allow it?"
                })[prompt.p.kind] || ""
                color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14
            }
            Text {
                visible: !!prompt.p && !!prompt.p.code
                Layout.alignment: Qt.AlignHCenter
                textFormat: Text.PlainText
                text: prompt.p ? String(prompt.p.code).replace(/(\d{3})(\d{3})/, "$1 $2") : ""
                color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 34; font.weight: Font.DemiBold; font.letterSpacing: 2
            }
            Field { id: codeIn; visible: !!prompt.p && (prompt.p.kind === "pin" || prompt.p.kind === "passkey"); placeholder: prompt.p && prompt.p.kind === "pin" ? "PIN" : "000000"; onAccepted: okBtn.clicked() }
        }
        Rectangle {
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: 62; color: Theme.surface2
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors { fill: parent; leftMargin: 20; rightMargin: 20 }
                spacing: 8
                Item { Layout.fillWidth: true }
                Button { visible: !!prompt.p && prompt.p.kind !== "display"; text: "Cancel"; kind: "plain"; onClicked: bluetooth.act("answer", { id: prompt.p ? prompt.p.id : 0, ok: false }) }
                Button {
                    id: okBtn
                    text: !prompt.p ? "" : prompt.p.kind === "display" ? "Done" : prompt.p.kind === "confirm" ? "They match, pair" : (prompt.p.kind === "authorize" || prompt.p.kind === "service") ? "Allow" : "Pair"
                    onClicked: bluetooth.act("answer", { id: prompt.p ? prompt.p.id : 0, ok: true, value: codeIn.text })
                }
            }
        }
    }
}
