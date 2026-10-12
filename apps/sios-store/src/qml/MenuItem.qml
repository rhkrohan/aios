// One row in a SIOS menu. "hint" shows a shortcut on the right.
import QtQuick
import QtQuick.Controls as QQC2

QQC2.MenuItem {
    id: row
    property string hint: ""
    property bool danger: false
    implicitHeight: 36
    implicitWidth: 224
    leftPadding: 12
    rightPadding: 12

    contentItem: Item {
        Text {
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: row.text
            color: !row.enabled ? Theme.fg3 : row.danger ? Theme.danger : row.highlighted ? Theme.aiInk : Theme.fg
            font.family: Theme.ui
            font.pixelSize: 13
            font.weight: row.highlighted ? Font.Medium : Font.Normal
        }
        Text {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            visible: row.hint !== ""
            text: row.hint
            color: Theme.fg3
            font.family: Theme.ui
            font.pixelSize: 12
        }
    }
    background: Rectangle {
        radius: 9
        color: row.highlighted && row.enabled ? Theme.aiSoft : "transparent"
    }
}
