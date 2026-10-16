// Settings' Card (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

Rectangle {
    default property alias content: inner.data
    Layout.fillWidth: true
    implicitHeight: inner.implicitHeight + 48
    radius: 16
    color: Theme.surface
    border.width: 1
    border.color: Theme.line
    ColumnLayout { id: inner; anchors { left: parent.left; right: parent.right; top: parent.top; margins: 24 } spacing: 14 }
}
