// Printers: the printers this computer knows, with their state, ink and default;
// a test page, remove; adding one found on the network or USB (no driver needed);
// jobs waiting; advanced: your paper size and two-sided defaults per printer.
// Reads `printers.state`, changes with `printers.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    readonly property QtObject area: printers
    readonly property var st: area.state
    readonly property var list: st.printers || []
    readonly property var jobs: st.jobs || []
    property bool adding: false
    property string opened: ""
    onVisibleChanged: if (visible) area.refresh()
    Component.onCompleted: if (visible) area.refresh()

    component Empty: Rectangle {
        property string icon
        property string text
        Layout.fillWidth: true
        implicitHeight: et.implicitHeight + 40; radius: 14
        color: Theme.surface2; border.width: 1; border.color: Theme.line
        RowLayout {
            anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; leftMargin: 18; rightMargin: 18 }
            spacing: 12
            Icon { name: parent.parent.icon; size: 18; color: Theme.fg3 }
            Text { id: et; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: parent.parent.text; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
        }
    }

    RowLayout {
        PageTitle { title: "Printers"; sub: "Printers this computer can use. Adding or removing one asks for your password." }
        Button { Layout.alignment: Qt.AlignTop; visible: !pg.adding && pg.st.available !== false; text: "Add a printer"; onClicked: { pg.adding = true; pg.area.act("discover", {}); } }
    }

    Empty { visible: pg.st.available === false; icon: "printer"; text: "Printing isn't available on this computer right now (the print service isn't running)." }
    Empty { visible: pg.st.available === true && pg.list.length === 0 && !pg.adding; icon: "printer"; text: "No printers yet. Turn your printer on, connect it to the same network or by USB, then choose Add a printer." }

    // ---- adding: printers found nearby
    Card {
        visible: pg.adding
        RowLayout {
            Text { Layout.fillWidth: true; text: pg.st.discovering ? "Looking for printers…" : "Printers found"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
            Button { visible: !pg.st.discovering; text: "Look again"; kind: "plain"; onClicked: pg.area.act("discover", {}) }
            Button { text: "Done"; kind: "plain"; onClicked: pg.adding = false }
        }
        Text { visible: !pg.st.discovering && (pg.st.found || []).length === 0; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "None found. Check the printer is on and on the same network (or plugged in), then look again."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
        Group {
            visible: (pg.st.found || []).length > 0
            Repeater {
                model: pg.st.found || []
                delegate: Item {
                    id: fd
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    implicitHeight: 62
                    readonly property bool already: pg.list.some(p => p.uri === modelData.uri)
                    Rectangle { visible: fd.index > 0; width: parent.width; height: 1; color: Theme.surface3 }
                    RowLayout {
                        anchors { fill: parent; leftMargin: 16; rightMargin: 12 }
                        spacing: 12
                        Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.surface3; Icon { anchors.centerIn: parent; name: "printer"; size: 18; color: Theme.fg2 } }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 1
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: fd.modelData.info || fd.modelData.model || fd.modelData.uri; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: (fd.modelData.kind || "Network") + (fd.modelData.model && fd.modelData.model !== fd.modelData.info ? " · " + fd.modelData.model : ""); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                        Pill { visible: fd.already; kind: "muted"; text: "Added" }
                        Button { visible: !fd.already; text: "Add"; busy: pg.st.adding === fd.modelData.uri; onClicked: pg.area.act("add", { uri: fd.modelData.uri }) }
                    }
                }
            }
        }
        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "SIOS adds printers that print without a driver (most printers from the last ten years)."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
    }

    // ---- the printers
    Group {
        visible: pg.list.length > 0
        Repeater {
            model: pg.list
            delegate: ColumnLayout {
                id: pr
                required property var modelData
                required property int index
                readonly property bool open: pg.opened === modelData.name
                Layout.fillWidth: true
                spacing: 0
                Item {
                    Layout.fillWidth: true
                    implicitHeight: 68
                    Rectangle { visible: pr.index > 0; width: parent.width; height: 1; color: Theme.surface3 }
                    Rectangle { anchors { fill: parent; margins: 4 } radius: 10; color: rowM.containsMouse ? Theme.surface2 : "transparent" }
                    MouseArea { id: rowM; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: pg.opened = pr.open ? "" : pr.modelData.name }
                    RowLayout {
                        anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
                        spacing: 14
                        Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 11; color: Theme.surface; border.width: 1; border.color: Theme.line; Icon { anchors.centerIn: parent; name: "printer"; size: 20; color: Theme.fg2 } }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 1
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: pr.modelData.info || pr.modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: pr.modelData.model || pr.modelData.name; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                        }
                        Pill { visible: !!pr.modelData.isDefault; kind: "muted"; text: "Default" }
                        Pill { text: pr.modelData.state === "printing" ? "Printing" : pr.modelData.state === "stopped" ? "Stopped" : "Ready"; kind: pr.modelData.state === "stopped" ? "danger" : "ok" }
                        Icon { name: "chevron-right"; size: 16; color: Theme.fg3; rotation: pr.open ? 90 : 0 }
                    }
                }
                // the open printer: ink, actions, your defaults
                ColumnLayout {
                    visible: pr.open
                    Layout.fillWidth: true
                    Layout.leftMargin: 70
                    Layout.rightMargin: 20
                    Layout.bottomMargin: 18
                    spacing: 12
                    Repeater {
                        model: pr.modelData.ink || []
                        delegate: RowLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 10
                            Text { Layout.preferredWidth: 110; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.name; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            Rectangle {
                                Layout.fillWidth: true
                                implicitHeight: 6; radius: 3; color: Theme.surface3
                                Rectangle { width: parent.width * Math.max(0, Math.min(100, modelData.level)) / 100; height: 6; radius: 3; color: modelData.color || Theme.accent; border.width: modelData.color === "#ffffff" || modelData.color === "#FFFFFF" ? 1 : 0; border.color: Theme.lineStrong }
                            }
                            Text { Layout.preferredWidth: 40; horizontalAlignment: Text.AlignRight; text: modelData.level >= 0 ? modelData.level + "%" : "?"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                    }
                    Text { visible: (pr.modelData.ink || []).length === 0; text: "This printer doesn't report its ink or toner."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    Flow {
                        Layout.fillWidth: true
                        spacing: 8
                        Button { text: "Print a test page"; kind: "plain"; onClicked: pg.area.act("test", { name: pr.modelData.name }) }
                        Button { visible: !pr.modelData.isDefault; text: "Make default"; kind: "plain"; onClicked: pg.area.act("default", { name: pr.modelData.name }) }
                        Button { text: "Remove"; kind: "danger"; onClicked: { pg.area.act("remove", { name: pr.modelData.name }); pg.opened = ""; } }
                    }
                    Advanced {
                        SettingRow {
                            label: "Paper size"
                            sub: "Your default for this printer."
                            Select {
                                options: [["A4", "A4"], ["Letter", "Letter"], ["Legal", "Legal"], ["A5", "A5"], ["A3", "A3"]]
                                value: pr.modelData.media || "A4"
                                onPicked: v => pg.area.act("option", { name: pr.modelData.name, key: "media", value: v })
                            }
                        }
                        SettingRow {
                            divider: true
                            label: "Print on both sides"
                            sub: "When the printer can."
                            Select {
                                options: [["one-sided", "Off"], ["two-sided-long-edge", "Flip on the long edge"], ["two-sided-short-edge", "Flip on the short edge"]]
                                value: pr.modelData.sides || "one-sided"
                                onPicked: v => pg.area.act("option", { name: pr.modelData.name, key: "sides", value: v })
                            }
                        }
                    }
                }
            }
        }
    }

    // ---- jobs waiting
    Card {
        visible: pg.jobs.length > 0
        Text { text: pg.jobs.length === 1 ? "1 job waiting" : pg.jobs.length + " jobs waiting"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
        Repeater {
            model: pg.jobs
            delegate: SettingRow {
                required property var modelData
                required property int index
                divider: index > 0
                label: modelData.id
                sub: modelData.printer + " · " + Math.max(1, Math.round(modelData.size / 1024)) + " KB · " + modelData.when
                Button { text: "Cancel"; kind: "plain"; onClicked: pg.area.act("cancel", { id: modelData.id }) }
            }
        }
    }
}
