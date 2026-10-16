// Settings' Field (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

Rectangle {
    property alias text: tf.text
    property alias placeholder: tf.placeholderText
    property alias secret: tf.echoMode
    property alias field: tf
    signal accepted()
    Layout.fillWidth: true
    implicitHeight: 32; radius: 8
    color: Theme.surface; border.width: 1; border.color: tf.activeFocus ? Theme.accent : Theme.line
    QQC2.TextField {
        id: tf
        anchors.fill: parent; anchors.leftMargin: 10
        placeholderTextColor: Theme.fg3; color: Theme.fg; background: null
        font.family: Theme.ui; font.pixelSize: 13
        onAccepted: parent.accepted()
    }
}
