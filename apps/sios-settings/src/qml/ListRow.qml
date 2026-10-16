// Settings' ListRow (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: lr
    property string logo
    property string name
    property string sub
    property color subColor: Theme.fg2
    property bool chevron: true
    property bool expanded: false
    property bool first: false
    default property alias trailing: tail.data
    signal clicked()
    Layout.fillWidth: true
    implicitHeight: 68
    color: "transparent"
    // hover shows inside the row, so the group's rounded corners stay clean
    Rectangle { anchors { fill: parent; margins: 4 } radius: 10; color: rm.containsMouse && lr.chevron ? Theme.surface2 : "transparent" }
    Rectangle { visible: !lr.first; width: parent.width; height: 1; color: Theme.surface3 }
    MouseArea { id: rm; anchors.fill: parent; hoverEnabled: true; enabled: lr.chevron; cursorShape: Qt.PointingHandCursor; onClicked: lr.clicked() }
    RowLayout {
        anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
        spacing: 14
        Logo { key: lr.logo }
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 1
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: lr.name; elide: Text.ElideRight; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: lr.sub; elide: Text.ElideRight; color: lr.subColor; font.family: Theme.ui; font.pixelSize: 13 }
        }
        RowLayout { id: tail; spacing: 8 }
        Icon { visible: lr.chevron; name: "chevron-right"; size: 16; color: Theme.fg3; rotation: lr.expanded ? 90 : 0 }
    }
    Accessible.role: Accessible.Button
    Accessible.name: name
}
