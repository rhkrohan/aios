// The Ask bar, the preview's CommandBar (CommandBar.tsx): above the dock, a
// card with suggestions or results, a footer with key hints, and the input
// with the orb. Placed as an overlay with KDE's layer-shell, so it sits
// exactly above the dock and takes the keyboard while open.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.layershell as LayerShell

Window {
    id: bar
    width: 760
    height: card.implicitHeight + 40
    color: "transparent"
    visible: !startHidden
    title: "Ask SIOS"

    LayerShell.Window.scope: "sios-ask"
    LayerShell.Window.layer: LayerShell.Window.LayerOverlay
    LayerShell.Window.anchors: LayerShell.Window.AnchorBottom
    LayerShell.Window.margins.bottom: 104
    LayerShell.Window.keyboardInteractivity: LayerShell.Window.KeyboardInteractivityOnDemand
    LayerShell.Window.exclusionZone: -1

    property var results: []
    property int current: 0
    readonly property var rows: input.text.trim() === "" ? search.suggestions : results

    function open() {
        input.text = "";
        results = [];
        current = 0;
        bar.visible = true;
        bar.requestActivate();
        input.forceActiveFocus();
    }
    function close() { bar.visible = false; }
    function go(i) {
        const item = rows[i];
        if (!item) return;
        search.run(item);
        close();
    }

    Connections { target: toggler; function onToggled() { bar.visible ? bar.close() : bar.open(); } }
    onActiveChanged: if (!active && visible) close()
    Component.onCompleted: if (visible) open()

    // a soft shadow, drawn as faint rings so it needs no GPU
    Repeater {
        model: [[14, 0.04], [9, 0.05], [5, 0.07]]
        Rectangle {
            required property var modelData
            x: card.x - modelData[0] / 2
            y: card.y - modelData[0] / 2 + 6
            width: card.width + modelData[0]
            height: card.height + modelData[0]
            radius: 28 + modelData[0] / 2
            color: Qt.rgba(10 / 255, 20 / 255, 40 / 255, modelData[1])
        }
    }

    Rectangle {
        id: card
        x: 20
        y: 14
        width: bar.width - 40
        implicitHeight: body.implicitHeight
        radius: 28
        color: Theme.dark ? Qt.rgba(30 / 255, 32 / 255, 35 / 255, 0.97) : Qt.rgba(246 / 255, 247 / 255, 250 / 255, 0.97)
        border.width: 1
        border.color: Theme.dark ? Qt.rgba(1, 1, 1, 0.08) : Qt.rgba(1, 1, 1, 0.9)
        clip: true

        ColumnLayout {
            id: body
            width: parent.width
            spacing: 0

            // ---- suggestions or results
            Text {
                Layout.leftMargin: 28
                Layout.topMargin: 20
                Layout.bottomMargin: 8
                text: input.text.trim() === "" ? "Try one, or type anything" : bar.results.length ? "Best matches" : "Nothing matches “" + input.text.trim() + "”"
                color: Theme.fg2
                font.family: Theme.ui
                font.pixelSize: 15
                font.weight: Font.DemiBold
            }
            Repeater {
                model: bar.rows
                delegate: Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    readonly property bool on: index === bar.current
                    Layout.fillWidth: true
                    Layout.leftMargin: 12
                    Layout.rightMargin: 12
                    implicitHeight: 72
                    radius: 18
                    color: on ? (Theme.dark ? Qt.rgba(125 / 255, 157 / 255, 1, 0.14) : "#eceffd") : (m.containsMouse ? Theme.surface2 : "transparent")
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 16
                        anchors.rightMargin: 20
                        spacing: 16
                        Rectangle {
                            implicitWidth: 44
                            implicitHeight: 44
                            radius: 13
                            color: Theme.surface
                            border.width: 1
                            border.color: Theme.line
                            Image {
                                anchors.centerIn: parent
                                visible: !!row.modelData.themed
                                width: 30; height: 30
                                sourceSize: Qt.size(60, 60)
                                source: row.modelData.themed ? "image://icon/theme/" + row.modelData.icon : ""
                            }
                            Icon { anchors.centerIn: parent; visible: !row.modelData.themed; name: row.modelData.icon || "search"; size: 20; color: row.on ? Theme.aiInk : Theme.fg }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            Text { Layout.fillWidth: true; text: row.modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.Medium; elide: Text.ElideRight }
                            Text { Layout.fillWidth: true; text: row.modelData.sub || ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14; elide: Text.ElideRight }
                        }
                        Icon { visible: row.on; name: "corner-down-left"; size: 20; color: Theme.aiInk }
                    }
                    MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onEntered: bar.current = row.index; onClicked: bar.go(row.index) }
                }
            }
            Item { implicitHeight: 10 }

            // ---- footer: what it does, and the keys
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 28
                Layout.rightMargin: 24
                Layout.topMargin: 12
                Layout.bottomMargin: 12
                spacing: 10
                Icon { name: "cpu"; size: 16; color: Theme.ok }
                Text {
                    Layout.fillWidth: true
                    text: "Finds apps, files and settings. Asking SIOS arrives with the assistant."
                    color: Theme.fg2
                    font.family: Theme.ui
                    font.pixelSize: 13
                    elide: Text.ElideRight
                }
                component Key: Rectangle {
                    property string icon
                    implicitWidth: 30; implicitHeight: 28; radius: 8
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    Icon { anchors.centerIn: parent; name: parent.icon; size: 14; color: Theme.fg2 }
                }
                Key { icon: "arrow-up" }
                Key { icon: "arrow-down" }
                Text { text: "to choose"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                Key { icon: "corner-down-left"; Layout.leftMargin: 8 }
                Text { text: "to open"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }

            // ---- the input, with the orb
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 22
                Layout.rightMargin: 18
                Layout.topMargin: 14
                Layout.bottomMargin: 16
                spacing: 14
                Orb { implicitWidth: 40; implicitHeight: 40; width: 40; height: 40; strands: 16; lively: input.text !== "" }
                QQC2.TextField {
                    id: input
                    Layout.fillWidth: true
                    placeholderText: "Search apps, files and settings…"
                    placeholderTextColor: Theme.fg3
                    color: Theme.fg
                    font.family: Theme.ui
                    font.pixelSize: 19
                    background: null
                    padding: 0
                    focus: true
                    onTextChanged: { bar.results = text.trim() ? search.find(text) : []; bar.current = 0; }
                    Keys.onEscapePressed: bar.close()
                    Keys.onDownPressed: bar.current = Math.min(bar.rows.length - 1, bar.current + 1)
                    Keys.onUpPressed: bar.current = Math.max(0, bar.current - 1)
                    Keys.onReturnPressed: bar.go(bar.current)
                    Keys.onEnterPressed: bar.go(bar.current)
                }
                Rectangle {
                    implicitWidth: 52; implicitHeight: 34; radius: 10
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    Text { anchors.centerIn: parent; text: "esc"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bar.close() }
                }
            }
        }
    }
}
