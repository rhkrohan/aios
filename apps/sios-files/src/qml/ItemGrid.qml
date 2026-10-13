// The grid, like the preview's Files: a heading per group ("Folders", then
// files by when they changed), discs for folders, page icons or pictures for
// files. Click to select (Ctrl adds, Shift picks a range), double-click to
// open, drag to move (Ctrl to copy), drop on a folder to put things in it.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

Flickable {
    id: grid
    property var folder
    property var app          // Main: selection, renaming, actions
    contentHeight: column.height + 24
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}

    // clicking empty space clears the selection
    MouseArea {
        width: grid.width
        height: Math.max(grid.height, grid.contentHeight)
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: (m) => { grid.app.clearSelection(); if (m.button === Qt.RightButton) grid.app.backgroundMenu(); }
    }

    Column {
        id: column
        x: 28
        y: 20
        width: grid.width - 56
        spacing: 18

        Repeater {
            model: grid.folder.groups
            delegate: Column {
                required property var modelData
                width: column.width
                spacing: 10
                Text {
                    text: modelData.title
                    color: Theme.fg2
                    font.family: Theme.ui
                    font.pixelSize: 13
                    font.weight: Font.DemiBold
                    topPadding: 6
                    leftPadding: 4
                }
                Flow {
                    width: parent.width
                    spacing: 10
                    Repeater {
                        model: modelData.items
                        delegate: Tile { required property var modelData; item: modelData }
                    }
                }
            }
        }
    }

    component Tile: Rectangle {
        id: tile
        property var item
        readonly property bool selected: grid.app.isSelected(item.location)
        readonly property bool renaming: grid.app.renaming === item.location
        width: 140
        height: 152
        radius: 14
        color: selected ? Theme.accentSoft : (hover.containsMouse || drop.containsDrag ? Theme.surface2 : "transparent")
        border.width: selected || drop.containsDrag ? 1 : 0
        border.color: Theme.accentLine

        Drag.active: hover.drag.active
        Drag.dragType: Drag.Automatic
        Drag.supportedActions: Qt.MoveAction | Qt.CopyAction
        Drag.mimeData: ({ "text/uri-list": grid.app.dragLocations(item.location).join("\r\n") })

        Column {
            anchors.horizontalCenter: parent.horizontalCenter
            y: 14
            spacing: 8
            Item {
                width: 72
                height: 72
                anchors.horizontalCenter: parent.horizontalCenter
                Disc { visible: tile.item.isDir; anchors.centerIn: parent; size: 68; name: tile.item.name; stats: tile.item.stats || ({ total: 0, segments: [] }); open: hover.containsMouse || tile.selected }
                FileIcon { visible: !tile.item.isDir; anchors.centerIn: parent; size: 68; kind: tile.item.kind; ext: tile.item.ext; location: tile.item.location }
                // came from the web: a small amber mark, like the preview's trust badge
                Rectangle {
                    visible: !!tile.item.origin
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.rightMargin: 4
                    width: 18; height: 18; radius: 9
                    color: "#c9852e"
                    border.width: 2
                    border.color: Theme.surface
                    Icon { anchors.centerIn: parent; name: "globe"; size: 10; color: "white" }
                }
            }
            Text {
                visible: !tile.renaming
                width: 124
                horizontalAlignment: Text.AlignHCenter
                text: tile.item.name
                color: tile.selected ? Theme.aiInk : Theme.fg
                font.family: Theme.ui
                font.pixelSize: 13
                font.weight: tile.selected ? Font.Medium : Font.Normal
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideMiddle
            }
            QQC2.TextField {
                visible: tile.renaming
                width: 128
                horizontalAlignment: Text.AlignHCenter
                text: tile.item.name
                font.family: Theme.ui
                font.pixelSize: 13
                color: Theme.fg
                selectByMouse: true
                background: Rectangle { radius: 6; color: Theme.surface; border.width: 1; border.color: Theme.ai }
                onVisibleChanged: if (visible) { forceActiveFocus(); const dot = text.lastIndexOf("."); select(0, dot > 0 && !tile.item.isDir ? dot : text.length); }
                onAccepted: grid.app.finishRename(tile.item.location, text)
                Keys.onEscapePressed: grid.app.renaming = ""
                onActiveFocusChanged: if (!activeFocus && tile.renaming) grid.app.finishRename(tile.item.location, text)
            }
            Text {
                width: 124
                horizontalAlignment: Text.AlignHCenter
                text: tile.item.isDir ? ((tile.item.stats ? tile.item.stats.total : 0) + ((tile.item.stats && tile.item.stats.total === 1) ? " item" : " items")) : tile.item.sizeText
                color: Theme.fg3
                font.family: Theme.ui
                font.pixelSize: 12
            }
        }

        MouseArea {
            id: hover
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            drag.target: dragProxy
            onPressed: (m) => { if (!tile.selected || m.modifiers & (Qt.ControlModifier | Qt.ShiftModifier)) grid.app.choose(tile.item, m.modifiers); }
            onClicked: (m) => { if (m.button === Qt.RightButton) grid.app.itemMenu(tile.item); }
            onDoubleClicked: grid.app.activate(tile.item)
        }
        Item { id: dragProxy }

        DropArea {
            id: drop
            anchors.fill: parent
            enabled: tile.item.isDir && !grid.app.isSelected(tile.item.location)
            keys: ["text/uri-list"]
            onDropped: (d) => { grid.app.dropInto(d.urls.map(u => String(u)), tile.item.location, d.proposedAction === Qt.CopyAction); d.accept(); }
        }
        Accessible.role: Accessible.ListItem
        Accessible.name: item.name
        Accessible.selected: selected
    }
}
