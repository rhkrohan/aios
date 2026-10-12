// What an app may reach, in one line, like the preview's TrustBadge:
// stays in its sandbox (calm), reaches some of your things (blue), full access (ember).
import QtQuick

Rectangle {
    id: badge
    property int level: 0
    property string label: ""
    readonly property color tone: level === 2 ? Theme.warn : level === 1 ? Theme.accent : Theme.ok
    visible: label !== ""
    implicitWidth: text.implicitWidth + 30
    implicitHeight: 24
    radius: 12
    color: Qt.rgba(tone.r, tone.g, tone.b, Theme.dark ? 0.18 : 0.1)
    border.width: 1
    border.color: Qt.rgba(tone.r, tone.g, tone.b, 0.3)
    Icon { x: 9; anchors.verticalCenter: parent.verticalCenter; name: badge.level === 2 ? "shield-alert" : "shield-check"; size: 13; color: badge.tone }
    Text { id: text; x: 26; anchors.verticalCenter: parent.verticalCenter; text: badge.label; color: badge.tone; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.Medium }
}
