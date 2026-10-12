/*
    SIOS splash: the tunnel, the wordmark and the tagline, fading in.
    Same type as the preview's boot screen (Jost ExtraLight, wide tracking).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import org.kde.kirigami as Kirigami

Rectangle {
    id: root
    color: "#e9ece9"

    property int stage

    onStageChanged: {
        if (stage == 2) {
            intro.running = true;
        }
    }

    Image {
        anchors.fill: parent
        asynchronous: true
        fillMode: Image.PreserveAspectCrop
        source: "file:///usr/share/wallpapers/SIOS-Tunnel/contents/images/1920x1080.png"
        sourceSize.width: 1920
        sourceSize.height: 1080
    }

    Item {
        id: content
        anchors.fill: parent
        opacity: 0

        Column {
            anchors.horizontalCenter: parent.horizontalCenter
            y: parent.height * 0.24
            spacing: Kirigami.Units.gridUnit

            Text {
                id: wordmark
                anchors.horizontalCenter: parent.horizontalCenter
                text: "SIOS"
                color: "#1d1d1f"
                font.family: "Jost"
                font.weight: Font.ExtraLight
                font.pixelSize: Math.round(root.height * 0.095)
                font.letterSpacing: font.pixelSize * 0.5
                leftPadding: font.letterSpacing
                Accessible.name: "SIOS"
                Accessible.role: Accessible.StaticText
            }
            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "A MORE HUMAN OPERATING SYSTEM"
                color: "#5c5c59"
                font.family: "Instrument Sans"
                font.pixelSize: Math.max(11, Math.round(root.height * 0.012))
                font.letterSpacing: font.pixelSize * 0.62
                leftPadding: font.letterSpacing
            }
        }
    }

    OpacityAnimator {
        id: intro
        running: false
        target: content
        from: 0
        to: 1
        duration: Kirigami.Units.veryLongDuration * 2
        easing.type: Easing.InOutQuad
    }
}
