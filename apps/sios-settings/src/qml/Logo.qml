// A service's or AI's logo on a small tile (Connectors, Brain, windows).
// Unknown ids get a plug, never letters.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: logo
    property string key
    property int size: 40
    readonly property var entry: Theme.logos[key] || ["plug", ""]
    implicitWidth: size
    implicitHeight: size
    Layout.preferredWidth: size
    Layout.preferredHeight: size
    radius: Math.round(size * 0.28)
    color: Theme.surface
    border.width: 1
    border.color: Theme.line
    Icon {
        anchors.centerIn: parent
        name: logo.entry[0]
        size: Math.round(logo.size * 0.5)
        color: logo.entry[1] || (logo.entry[0].startsWith("logo-") ? Theme.fg : Theme.fg2)
    }
}
