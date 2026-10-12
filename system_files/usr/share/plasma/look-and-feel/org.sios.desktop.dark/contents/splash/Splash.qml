/*
    SIOS splash: the desktop's dusk photo, the wordmark and the tagline, fading in.
    Same type as the preview's boot screen (Jost ExtraLight, wide tracking).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import org.kde.kirigami as Kirigami

Rectangle {
    id: root
    color: "#1a1f2a"

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
        source: "file:///usr/share/wallpapers/SIOS-Dusk/contents/images_dark/2880x1920.jpg"
        sourceSize.width: 1920
        sourceSize.height: 1080
    }

    Item {
        id: content
        anchors.fill: parent
        opacity: 0

        Column {
            anchors.horizontalCenter: parent.horizontalCenter
            y: parent.height * 0.16
            spacing: Kirigami.Units.gridUnit

            Text {
                id: wordmark
                anchors.horizontalCenter: parent.horizontalCenter
                text: "SIOS"
                color: "#ffffff"
                font.family: "Jost"
                font.weight: Font.ExtraLight
                font.pixelSize: Math.max(56, Math.min(104, Math.round(root.width * 0.072)))
                font.letterSpacing: Math.max(56, Math.min(104, Math.round(root.width * 0.072))) * 0.5
                leftPadding: Math.max(56, Math.min(104, Math.round(root.width * 0.072))) * 0.5
                Accessible.name: "SIOS"
                Accessible.role: Accessible.StaticText
            }
            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "A MORE HUMAN OPERATING SYSTEM"
                color: Qt.rgba(1, 1, 1, 0.85)
                font.family: "Jost"
                font.pixelSize: 13
                font.letterSpacing: 13 * 0.62
                leftPadding: 13 * 0.62
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
