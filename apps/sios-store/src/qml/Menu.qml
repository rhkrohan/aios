// A popup menu in the preview's style (shell/Popover.tsx and TopBar MenuItem):
// a rounded card with a soft shadow, roomy rows, a soft blue hover with blue
// text, light separators and shortcut hints on the right.
import QtQuick
import QtQuick.Controls as QQC2

QQC2.Menu {
    id: menu
    padding: 6
    implicitWidth: 236
    margins: 8

    background: Item {
        implicitWidth: 236
        // shadow: a few faint rings, so it needs no GPU
        Repeater {
            model: [[0, 10, 0.05], [0, 6, 0.07], [0, 3, 0.08]]
            Rectangle {
                required property var modelData
                anchors.fill: parent
                anchors.margins: -modelData[1] / 2
                anchors.topMargin: -modelData[1] / 2 + modelData[1] / 2
                radius: 14 + modelData[1] / 2
                color: Qt.rgba(10 / 255, 20 / 255, 40 / 255, modelData[2])
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: 14
            color: Theme.surface
            border.width: 1
            border.color: Theme.line
        }
    }

    delegate: MenuItem {}
}
