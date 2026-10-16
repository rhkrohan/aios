// Settings' Toggle (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: tg
    property bool on
    signal toggled()
    implicitWidth: 44; implicitHeight: 26; radius: 13
    color: on ? Theme.accent : Theme.lineStrong
    Rectangle { width: 20; height: 20; radius: 10; y: 3; x: tg.on ? 21 : 3; color: "white"; Behavior on x { NumberAnimation { duration: 140 } } }
    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: tg.toggled() }
    Accessible.role: Accessible.CheckBox
    Accessible.checked: on
}
