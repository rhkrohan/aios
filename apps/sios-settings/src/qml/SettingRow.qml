// One setting in a Card or Group: its name, a line about it, and its control
// on the right (put the control inside). Daylight.
import QtQuick
import QtQuick.Layouts

Item {
    id: row
    property string label
    property string sub
    property bool divider: false
    default property alias control: slot.data
    Layout.fillWidth: true
    implicitHeight: Math.max(texts.implicitHeight, slot.implicitHeight) + 20
    Rectangle { visible: row.divider; width: parent.width; height: 1; color: Theme.surface3 }
    RowLayout {
        anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
        spacing: 16
        ColumnLayout {
            id: texts
            Layout.fillWidth: true
            spacing: 2
            Text { Layout.fillWidth: true; text: row.label; wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
            Text { Layout.fillWidth: true; visible: row.sub !== ""; text: row.sub; wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
        }
        RowLayout { id: slot; spacing: 8 }
    }
}
