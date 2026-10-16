// Settings' Soon (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

Rectangle {
    property string text
    Layout.fillWidth: true
    implicitHeight: soonText.implicitHeight + 24
    radius: 14
    color: Theme.aiSoft
    border.width: 1
    border.color: Qt.rgba(Theme.ai.r, Theme.ai.g, Theme.ai.b, 0.25)
    RowLayout {
        anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 18 }
        spacing: 12
        Icon { name: "sparkles"; size: 16; color: Theme.aiInk }
        Text { id: soonText; Layout.fillWidth: true; textFormat: Text.PlainText; text: parent.parent.text; wrapMode: Text.WordWrap; color: Theme.aiInk; font.family: Theme.ui; font.pixelSize: 13 }
    }
}
