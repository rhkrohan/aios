// A segmented choice (Daylight): options [[value, label], ...], one picked.
import QtQuick
import QtQuick.Layouts

Row {
    id: sg
    property var options: []
    property var value
    signal picked(var v)
    Repeater {
        model: sg.options
        delegate: Rectangle {
            required property var modelData
            required property int index
            readonly property bool on: sg.value === modelData[0]
            width: sl.implicitWidth + 28; height: 34
            radius: 0
            color: on ? Theme.accent : (m.containsMouse ? Theme.surface2 : Theme.surface)
            border.width: 1; border.color: Theme.lineStrong
            Text { id: sl; anchors.centerIn: parent; text: modelData[1]; textFormat: Text.PlainText; color: parent.on ? "white" : Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: parent.on ? Font.DemiBold : Font.Normal }
            MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: sg.picked(modelData[0]) }
        }
    }
}
