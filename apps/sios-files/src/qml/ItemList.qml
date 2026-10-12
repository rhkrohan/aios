// The list view: one row per item with when it changed, its size and kind,
// grouped the same way as the grid.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

Flickable {
    id: list
    property var folder
    property var app
    contentHeight: column.height + 16
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}

    MouseArea {
        width: list.width
        height: Math.max(list.height, list.contentHeight)
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: (m) => { list.app.clearSelection(); if (m.button === Qt.RightButton) list.app.backgroundMenu(); }
    }

    Column {
        id: column
        x: 12
        width: list.width - 24

        // column headings
        RowLayout {
            width: parent.width
            height: 34
            spacing: 12
            component Head: Text { color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
            Item { Layout.preferredWidth: 28 }
            Head { text: "Name"; Layout.fillWidth: true }
            Head { text: "Changed"; Layout.preferredWidth: 110 }
            Head { text: "Size"; Layout.preferredWidth: 80; horizontalAlignment: Text.AlignRight }
            Head { text: "Kind"; Layout.preferredWidth: 140 }
        }

        Repeater {
            model: list.folder.groups
            delegate: Column {
                required property var modelData
                width: column.width
                Text {
                    text: modelData.title
                    color: Theme.fg2
                    font.family: Theme.ui
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                    topPadding: 10
                    bottomPadding: 4
                    leftPadding: 8
                }
                Repeater {
                    model: modelData.items
                    delegate: Rectangle {
                        id: row
                        required property var modelData
                        readonly property var item: modelData
                        readonly property bool selected: list.app.isSelected(item.location)
                        width: column.width
                        height: 38
                        radius: 8
                        color: selected ? Theme.accentSoft : (m.containsMouse || drop.containsDrag ? Theme.surface2 : "transparent")

                        Drag.active: m.drag.active
                        Drag.dragType: Drag.Automatic
                        Drag.supportedActions: Qt.MoveAction | Qt.CopyAction
                        Drag.mimeData: ({ "text/uri-list": list.app.dragLocations(item.location).join("\r\n") })

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 8
                            spacing: 12
                            Item {
                                Layout.preferredWidth: 28
                                Layout.preferredHeight: 28
                                Disc { visible: row.item.isDir; anchors.centerIn: parent; size: 26; name: row.item.name; stats: row.item.stats || ({ total: 0, segments: [] }) }
                                FileIcon { visible: !row.item.isDir; anchors.centerIn: parent; size: 28; kind: row.item.kind; ext: ""; location: row.item.location; thumbnail: false }
                            }
                            Text {
                                Layout.fillWidth: true
                                visible: list.app.renaming !== row.item.location
                                text: row.item.name
                                color: row.selected ? Theme.aiInk : Theme.fg
                                font.family: Theme.ui
                                font.pixelSize: 13
                                elide: Text.ElideMiddle
                            }
                            QQC2.TextField {
                                Layout.fillWidth: true
                                visible: list.app.renaming === row.item.location
                                text: row.item.name
                                font.family: Theme.ui
                                font.pixelSize: 13
                                color: Theme.fg
                                background: Rectangle { radius: 6; color: Theme.surface; border.width: 1; border.color: Theme.ai }
                                onVisibleChanged: if (visible) { forceActiveFocus(); const dot = text.lastIndexOf("."); select(0, dot > 0 && !row.item.isDir ? dot : text.length); }
                                onAccepted: list.app.finishRename(row.item.location, text)
                                Keys.onEscapePressed: list.app.renaming = ""
                            }
                            Text { Layout.preferredWidth: 110; text: row.item.modifiedText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                            Text { Layout.preferredWidth: 80; horizontalAlignment: Text.AlignRight; text: row.item.isDir ? ((row.item.stats ? row.item.stats.total : 0) + " items") : row.item.sizeText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                            Text { Layout.preferredWidth: 140; text: row.item.isDir ? "Folder" : (row.item.mimeComment || row.item.kind); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; elide: Text.ElideRight }
                        }
                        MouseArea {
                            id: m
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            drag.target: proxy
                            onPressed: (e) => { if (!row.selected || e.modifiers & (Qt.ControlModifier | Qt.ShiftModifier)) list.app.choose(row.item, e.modifiers); }
                            onClicked: (e) => { if (e.button === Qt.RightButton) list.app.itemMenu(row.item); }
                            onDoubleClicked: list.app.activate(row.item)
                        }
                        Item { id: proxy }
                        DropArea {
                            id: drop
                            anchors.fill: parent
                            enabled: row.item.isDir && !row.selected
                            keys: ["text/uri-list"]
                            onDropped: (d) => { list.app.dropInto(d.urls.map(u => String(u)), row.item.location, d.proposedAction === Qt.CopyAction); d.accept(); }
                        }
                    }
                }
            }
        }
    }
}
