// The details panel, like the preview's files/Inspector.tsx: a big icon,
// what the item is, its size and dates, and where it came from. A file from
// the web shows the address it was downloaded from; one made here says so.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: panel
    property var item: null
    property int selectedCount: 0
    signal openItem(var item)

    implicitWidth: 268
    color: Theme.surface2
    Rectangle { width: 1; height: parent.height; color: Theme.line }

    component Fact: ColumnLayout {
        property string label
        property string value
        visible: value !== ""
        Layout.fillWidth: true
        spacing: 1
        Text { text: parent.label; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        Text { Layout.fillWidth: true; text: parent.value; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; wrapMode: Text.WrapAnywhere; maximumLineCount: 3; elide: Text.ElideRight }
    }

    // nothing chosen
    Text {
        visible: !panel.item
        anchors.centerIn: parent
        width: parent.width - 40
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        text: panel.selectedCount > 1 ? panel.selectedCount + " items selected" : "Select something to see its details."
        color: Theme.fg3
        font.family: Theme.ui
        font.pixelSize: 13
    }

    ColumnLayout {
        visible: !!panel.item
        anchors.fill: parent
        anchors.margins: 20
        spacing: 14

        Item {
            Layout.alignment: Qt.AlignHCenter
            Layout.topMargin: 6
            implicitWidth: 120
            implicitHeight: 120
            Disc { visible: !!panel.item && panel.item.isDir; anchors.centerIn: parent; size: 110; name: panel.item ? panel.item.name : ""; stats: panel.item && panel.item.stats ? panel.item.stats : ({ total: 0, segments: [] }); open: true }
            FileIcon { visible: !!panel.item && !panel.item.isDir; anchors.centerIn: parent; size: 112; kind: panel.item ? panel.item.kind : "text"; ext: panel.item ? panel.item.ext : ""; location: panel.item ? panel.item.location : "" }
        }
        Text {
            Layout.fillWidth: true
            horizontalAlignment: Text.AlignHCenter
            text: panel.item ? panel.item.name : ""
            color: Theme.fg
            font.family: Theme.ui
            font.pixelSize: 15
            font.weight: Font.DemiBold
            wrapMode: Text.WrapAnywhere
            maximumLineCount: 3
            elide: Text.ElideRight
        }

        // where it came from: the preview's trust line
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: origin.implicitHeight + 20
            radius: 12
            color: panel.item && panel.item.origin ? (Theme.dark ? "#34281b" : "#fbf3e6") : Theme.surface
            border.width: 1
            border.color: panel.item && panel.item.origin ? (Theme.dark ? "#5c4a2d" : "#efd9b4") : Theme.line
            RowLayout {
                id: origin
                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 10 }
                spacing: 10
                Icon { name: panel.item && panel.item.origin ? "globe" : "house"; size: 16; color: panel.item && panel.item.origin ? "#c9852e" : Theme.fg2 }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 1
                    Text {
                        text: panel.item && panel.item.origin ? "From the web" : (panel.item && panel.item.isDir ? "On this computer" : "Made on this computer")
                        color: Theme.fg
                        font.family: Theme.ui
                        font.pixelSize: 13
                        font.weight: Font.Medium
                    }
                    Text {
                        visible: !!(panel.item && panel.item.origin)
                        Layout.fillWidth: true
                        text: panel.item && panel.item.origin ? panel.item.origin.replace(/^https?:\/\//, "") : ""
                        color: Theme.fg2
                        font.family: Theme.ui
                        font.pixelSize: 12
                        elide: Text.ElideMiddle
                    }
                }
            }
        }

        Fact { label: "Kind"; value: panel.item ? (panel.item.isDir ? "Folder" : (panel.item.mimeComment || panel.item.kind)) : "" }
        Fact { label: "Size"; value: panel.item ? (panel.item.isDir ? ((panel.item.stats ? panel.item.stats.total : 0) + " items") : panel.item.sizeText) : "" }
        Fact { label: "Changed"; value: panel.item ? panel.item.modifiedText : "" }
        Fact { label: "Where"; value: panel.item && panel.item.path ? panel.item.path.replace(/^\/var\/home\/[^/]+|^\/home\/[^/]+/, "~").replace(/\/[^/]*$/, "") || "~" : "" }

        Item { Layout.fillHeight: true }

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 36
            radius: 10
            color: Theme.accent
            Text { anchors.centerIn: parent; text: "Open"; color: "white"; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: panel.openItem(panel.item) }
        }
    }
}
