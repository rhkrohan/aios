/*
    The big "S I O S" and tagline on the desktop, as in the preview
    (build_concept_html/src/components/shell/Desktop.tsx, "hero wordmark").
    White Jost ExtraLight with wide tracking and a soft shadow so it reads on
    any photo. Decoration only. The shadow is a few faint offset copies rather
    than a blur, so it also works without a GPU (software rendering, VMs).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Window
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    // clamp(56px, 7.2vw, 104px) in the preview, from the screen width
    readonly property int nameSize: Math.max(56, Math.min(104, Math.round(Screen.width * 0.072)))

    component Words: Item {
        id: w
        property color nameColor: "white"
        property color tagColor: Qt.rgba(1, 1, 1, 0.85)
        width: parent.width
        height: parent.height
        Text {
            id: name
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            text: "SIOS"
            color: w.nameColor
            font.family: "Jost"
            font.weight: Font.ExtraLight
            font.pixelSize: root.nameSize
            font.letterSpacing: root.nameSize * 0.5
            leftPadding: root.nameSize * 0.5
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: name.bottom
            anchors.topMargin: 20
            text: "A MORE HUMAN OPERATING SYSTEM"
            color: w.tagColor
            font.family: "Jost"
            font.pixelSize: 13
            font.letterSpacing: 13 * 0.62
            leftPadding: 13 * 0.62
        }
    }

    fullRepresentation: Item {
        implicitWidth: 900
        implicitHeight: 220

        // soft shadow: rings of faint dark copies around a 2px drop
        Repeater {
            model: [[0, 2, 0.22], [0, 4, 0.12], [-2, 2, 0.08], [2, 2, 0.08], [0, 0, 0.08], [0, 6, 0.06]]
            delegate: Words {
                required property var modelData
                x: modelData[0]
                y: modelData[1]
                opacity: modelData[2]
                nameColor: "#141e32"
                tagColor: "#141e32"
            }
        }
        Words {}

        Accessible.name: "SIOS, a more human operating system"
        Accessible.role: Accessible.StaticText
    }
}
