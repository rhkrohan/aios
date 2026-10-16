// The rarer options of a page, folded away under "Advanced" until opened.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: adv
    property bool open: false
    default property alias content: box.data
    Layout.fillWidth: true
    spacing: 10
    Rectangle {
        Layout.fillWidth: true
        implicitHeight: 40; radius: 10
        color: m.containsMouse ? Theme.surface2 : "transparent"
        RowLayout {
            anchors { fill: parent; leftMargin: 12; rightMargin: 12 }
            Text { Layout.fillWidth: true; text: "Advanced"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
            Icon { name: "chevron-right"; size: 15; color: Theme.fg3; rotation: adv.open ? 90 : 0 }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: adv.open = !adv.open }
    }
    ColumnLayout { id: box; visible: adv.open; Layout.fillWidth: true; spacing: 14 }
}
