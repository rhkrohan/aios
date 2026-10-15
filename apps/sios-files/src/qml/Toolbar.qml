// The toolbar, like the preview's Files: back and forward, where you are,
// then search, sort, grid or list, new folder and the details panel.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

Rectangle {
    id: bar
    property var folder
    property string view: "grid"
    property bool inspector: false
    property alias searchField: search
    signal newFolder()
    signal emptyTrash()
    signal copied()

    implicitHeight: 60
    color: Theme.surface

    component ToolButton: Rectangle {
        id: tb
        property string icon
        property string tip
        property bool on: false
        property bool active: true
        signal clicked()
        implicitWidth: 36
        implicitHeight: 36
        radius: 8
        color: on ? Theme.surface3 : (m.containsMouse && active ? Theme.surface2 : "transparent")
        opacity: active ? 1 : 0.35
        Icon { anchors.centerIn: parent; name: tb.icon; size: 17; color: tb.on ? Theme.fg : Theme.fg2 }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; enabled: tb.active; onClicked: tb.clicked() }
        Accessible.role: Accessible.Button
        Accessible.name: tip
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 18
        anchors.rightMargin: 18
        spacing: 6

        ToolButton { icon: "arrow-left"; tip: "Back"; active: bar.folder.canGoBack; onClicked: bar.folder.back() }
        ToolButton { icon: "arrow-right"; tip: "Forward"; active: bar.folder.canGoForward; onClicked: bar.folder.forward() }

        // the address bar, like Windows: where you are as clickable pieces
        // (Home > Documents > ...); click the empty part, or Ctrl+L, to type a path
        Rectangle {
            id: address
            property bool editing: false
            property bool wrong: false
            Layout.leftMargin: 8
            Layout.rightMargin: 6
            Layout.fillWidth: true
            implicitHeight: 36
            radius: 10
            color: editing ? Theme.surface : Theme.surface2
            border.width: 1
            border.color: wrong ? Theme.danger : (editing ? Theme.accentLine : (addressHover.containsMouse ? Theme.line : Qt.rgba(0, 0, 0, 0)))
            Behavior on border.color { ColorAnimation { duration: 120 } }

            function edit() {
                wrong = false;
                pathField.text = bar.folder.pathText();
                editing = true;
                pathField.forceActiveFocus();
                pathField.selectAll();
            }
            function done() { editing = false; wrong = false; }

            // click on the empty part of the bar to type
            MouseArea {
                id: addressHover
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: address.editing ? Qt.IBeamCursor : Qt.ArrowCursor
                onClicked: if (!address.editing) address.edit()
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 10
                anchors.rightMargin: 6
                spacing: 6
                Icon { name: bar.folder.isTrash ? "trash-2" : "folder"; size: 16; color: Theme.fg2 }

                // Home > Documents > ...
                Flickable {
                    id: crumbsView
                    visible: !address.editing
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    contentWidth: crumbsRow.width
                    contentX: Math.max(0, contentWidth - width)  // keep the deepest folder in view
                    interactive: false
                    clip: true
                    Row {
                        id: crumbsRow
                        height: parent.height
                        spacing: 0
                        Repeater {
                            model: bar.folder.crumbs
                            delegate: Row {
                                required property var modelData
                                required property int index
                                height: crumbsRow.height
                                Icon { visible: index > 0; name: "chevron-right"; size: 14; color: Theme.fg3; anchors.verticalCenter: parent.verticalCenter }
                                Rectangle {
                                    readonly property bool last: index === bar.folder.crumbs.length - 1
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: crumbText.implicitWidth + 14
                                    height: 26
                                    radius: 6
                                    color: crumbMouse.containsMouse ? Theme.surface3 : "transparent"
                                    Text {
                                        id: crumbText
                                        anchors.centerIn: parent
                                        textFormat: Text.PlainText
                                        text: modelData.name
                                        color: parent.last ? Theme.fg : Theme.fg2
                                        font.family: Theme.ui
                                        font.pixelSize: 14
                                        font.weight: parent.last ? Font.DemiBold : Font.Normal
                                    }
                                    MouseArea { id: crumbMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: bar.folder.go(modelData.location) }
                                    Accessible.role: Accessible.Button
                                    Accessible.name: "Go to " + modelData.name
                                }
                            }
                        }
                    }
                }

                // typing a path
                QQC2.TextField {
                    id: pathField
                    visible: address.editing
                    Layout.fillWidth: true
                    color: Theme.fg
                    selectionColor: Theme.accentSoft
                    selectedTextColor: Theme.fg
                    font.family: Theme.ui
                    font.pixelSize: 14
                    background: null
                    padding: 0
                    selectByMouse: true
                    onTextEdited: address.wrong = false
                    onAccepted: { if (bar.folder.goTo(text)) address.done(); else address.wrong = true; }
                    Keys.onEscapePressed: address.done()
                    onActiveFocusChanged: if (!activeFocus) address.done()
                    Accessible.name: "Folder path"
                }
                Text {
                    visible: address.wrong
                    text: "No such folder"
                    color: Theme.danger
                    font.family: Theme.ui
                    font.pixelSize: 12
                }
                // copy where you are
                Rectangle {
                    visible: !address.editing && addressHover.containsMouse
                    implicitWidth: 26; implicitHeight: 26; radius: 6
                    color: copyMouse.containsMouse ? Theme.surface3 : "transparent"
                    Icon { anchors.centerIn: parent; name: "copy"; size: 14; color: Theme.fg2 }
                    MouseArea {
                        id: copyMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: { pathField.text = bar.folder.pathText(); pathField.selectAll(); pathField.copy(); bar.copied(); }
                    }
                    Accessible.role: Accessible.Button
                    Accessible.name: "Copy path"
                }
            }
        }
        Shortcut { sequences: ["Ctrl+L", "Alt+D", "F4"]; onActivated: address.edit() }

        // empty the trash, when in it
        Rectangle {
            visible: bar.folder.isTrash && bar.folder.count > 0
            implicitWidth: emptyText.implicitWidth + 20
            implicitHeight: 30
            radius: 8
            color: Theme.surface2
            border.width: 1
            border.color: Theme.line
            Text { id: emptyText; anchors.centerIn: parent; text: "Empty Trash"; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.Medium }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bar.emptyTrash() }
        }

        // search this folder
        Rectangle {
            implicitWidth: 230
            implicitHeight: 36
            radius: 10
            color: Theme.surface3
            border.width: search.activeFocus ? 1 : 0
            border.color: Theme.accentLine
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 10
                anchors.rightMargin: 6
                spacing: 6
                Icon { name: "search"; size: 15; color: Theme.fg3 }
                QQC2.TextField {
                    id: search
                    Layout.fillWidth: true
                    placeholderText: "Search " + bar.folder.title
                    placeholderTextColor: Theme.fg3
                    color: Theme.fg
                    font.family: Theme.ui
                    font.pixelSize: 13
                    background: null
                    padding: 0
                    text: bar.folder.filter
                    onTextEdited: bar.folder.filter = text
                    Keys.onEscapePressed: { text = ""; bar.folder.filter = ""; focus = false; }
                }
                Icon {
                    visible: search.text !== ""
                    name: "x"; size: 13; color: Theme.fg3
                    MouseArea { anchors.fill: parent; onClicked: { search.text = ""; bar.folder.filter = ""; } }
                }
            }
        }

        ToolButton {
            icon: "arrow-up-down"
            tip: "Sort"
            Layout.leftMargin: 4
            onClicked: sortMenu.open()
            Menu {
                id: sortMenu
                implicitWidth: 200
                y: parent.height + 4
                Repeater {
                    model: [["name", "Name"], ["date", "Date changed"], ["kind", "Kind"], ["size", "Size"]]
                    MenuItem {
                        required property var modelData
                        text: modelData[1]
                        hint: bar.folder.sortBy === modelData[0] ? "✓" : ""
                        onTriggered: bar.folder.sortBy = modelData[0]
                    }
                }
            }
        }

        // grid or list
        Rectangle {
            implicitWidth: 76
            implicitHeight: 36
            radius: 9
            color: Theme.surface2
            border.width: 1
            border.color: Theme.line
            Row {
                anchors.centerIn: parent
                spacing: 2
                ToolButton { icon: "layout-grid"; tip: "Grid"; on: bar.view === "grid"; implicitWidth: 34; implicitHeight: 30; onClicked: bar.view = "grid" }
                ToolButton { icon: "list"; tip: "List"; on: bar.view === "list"; implicitWidth: 34; implicitHeight: 30; onClicked: bar.view = "list" }
            }
        }

        Rectangle { implicitWidth: 1; implicitHeight: 20; color: Theme.line; Layout.leftMargin: 6; Layout.rightMargin: 6 }

        ToolButton { icon: "folder-plus"; tip: "New folder"; active: bar.folder.location.startsWith("file:"); onClicked: bar.newFolder() }
        ToolButton { icon: "panel-right"; tip: "Details"; on: bar.inspector; onClicked: bar.inspector = !bar.inspector }
    }

    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
}
