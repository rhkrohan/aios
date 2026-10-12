/*
    SIOS splash, after you log in, while the desktop loads: the same screen as
    the boot (and the preview's BootScreen in Power.tsx): black, the string
    orb at work, SIOS, a light blue to violet bar that follows the desktop
    starting up, and "Getting your desktop ready".
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick

Rectangle {
    id: root
    color: "#000000"

    property int stage   // set by KSplash, 1 to 6 as the desktop starts

    Column {
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -20
        spacing: 0

        Orb {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 170
            height: 170
            strands: 24
            lively: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 32
            text: "SIOS"
            color: "white"
            font.family: "Jost"
            font.weight: Font.ExtraLight
            font.pixelSize: 44
            font.letterSpacing: 22
            leftPadding: 22
        }
        Item { width: 1; height: 40 }
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 224
            height: 3
            radius: 1.5
            color: Qt.rgba(1, 1, 1, 0.10)
            Rectangle {
                height: parent.height
                radius: 1.5
                width: parent.width * Math.max(0.5, Math.min(1, 0.5 + root.stage / 12))
                Behavior on width { NumberAnimation { duration: 500; easing.type: Easing.OutCubic } }
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: "#7fd0ff" }
                    GradientStop { position: 0.5; color: "#7d9dff" }
                    GradientStop { position: 1; color: "#9b7bff" }
                }
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 16
            text: "Getting your desktop ready"
            color: Qt.rgba(1, 1, 1, 0.45)
            font.family: "Instrument Sans"
            font.pixelSize: 13
        }
    }
}
