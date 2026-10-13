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

        // Home > Documents > ...
        Row {
            Layout.leftMargin: 10
            Layout.fillWidth: true
            spacing: 4
            clip: true
            Repeater {
                model: bar.folder.crumbs
                delegate: Row {
                    required property var modelData
                    required property int index
                    spacing: 4
                    Icon { visible: index > 0; name: "chevron-right"; size: 14; color: Theme.fg3; anchors.verticalCenter: parent.verticalCenter }
                    Text {
                        readonly property bool last: index === bar.folder.crumbs.length - 1
                        text: modelData.name
                        color: last ? Theme.fg : Theme.fg2
                        font.family: Theme.ui
                        font.pixelSize: 14
                        font.weight: last ? Font.DemiBold : Font.Normal
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bar.folder.go(modelData.location) }
                    }
                }
            }
        }

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
