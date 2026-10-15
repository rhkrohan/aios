// Daylight's pill buttons: "primary" (filled accent), "plain" (outlined), "danger".
import QtQuick

Rectangle {
    id: b
    property string text
    property string kind: "primary"
    property bool busy: false
    property real progress: -1
    signal clicked()
    implicitWidth: Math.max(72, label.implicitWidth + 28)
    implicitHeight: 32
    radius: height / 2
    color: kind === "primary" ? (m.containsMouse ? Qt.darker(Theme.accent, 1.12) : Theme.accent) : (m.containsMouse ? Theme.surface2 : Theme.surface)
    border.width: kind === "primary" ? 0 : 1
    border.color: kind === "danger" ? Qt.rgba(Theme.danger.r, Theme.danger.g, Theme.danger.b, 0.4) : Theme.line
    clip: true

    // progress fills the button while something runs
    Rectangle {
        visible: b.busy && b.progress >= 0
        width: parent.width * Math.max(0, Math.min(100, b.progress)) / 100
        height: parent.height
        color: Qt.rgba(1, 1, 1, 0.22)
        Behavior on width { NumberAnimation { duration: 200 } }
    }
    Text {
        id: label
        anchors.centerIn: parent
        textFormat: Text.PlainText
        text: b.busy ? (b.progress >= 0 ? b.progress + "%" : "Working…") : b.text
        color: b.kind === "primary" ? "white" : b.kind === "danger" ? Theme.danger : Theme.fg
        font.family: Theme.ui
        font.pixelSize: 13
        font.weight: Font.DemiBold
    }
    MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; enabled: !b.busy; cursorShape: Qt.PointingHandCursor; onClicked: b.clicked() }
    Accessible.role: Accessible.Button
    Accessible.name: text
}
