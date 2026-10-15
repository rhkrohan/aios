/*
    The middle island of the top bar (owner's pick 2026-10-14: three islands,
    search "S2"): the orb and "Search or ask SIOS" in a glass pill whose edge is
    a slowly drifting SIOS gradient. Clicking it opens the Ask bar (apps, files,
    settings, and Ask SIOS), the same as Meta+Space.
    The edge also says how SIOS is: blue and calm when idle, amber when
    something waits for the owner's OK, grey when the broker isn't running.
    It reads only the broker's public status (`capd status`), never what waits.
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    property bool siosUp: true
    property int waiting: 0

    P5Support.DataSource {
        id: sh
        engine: "executable"
        onNewData: (source, data) => {
            if (source === root.readSios) {
                try { const v = JSON.parse(String(data.stdout)).ok; root.waiting = v.pending || 0; root.siosUp = true; }
                catch (e) { root.siosUp = false; }
            }
            disconnectSource(source);
        }
    }
    readonly property string readSios: "capd status 2>/dev/null"
    Timer { interval: 4000; running: true; repeat: true; triggeredOnStart: true; onTriggered: sh.connectSource(root.readSios) }

    // edge colours per state: SIOS blue, cyan and violet; amber; grey
    readonly property var edge: !siosUp ? ["#5b6270", "#7a8190", "#5b6270"]
        : waiting > 0 ? ["#f0a43a", "#ffd27a", "#f0a43a"]
        : ["#6f7cff", "#4fc3f7", "#b48cff"]

    fullRepresentation: Item {
        id: island
        Layout.minimumWidth: 280
        Layout.preferredWidth: 280
        Layout.fillHeight: true

        // the glowing edge: a gradient pill, and the solid pill 1.5px inside it
        // (siblings, so the edge can dim without the inside showing the wallpaper)
        Item {
            id: ring
            anchors.centerIn: parent
            width: 276
            height: 38   // as tall as the side islands
            property real drift: 0
            NumberAnimation on drift { from: 0; to: 1; duration: 9000; loops: Animation.Infinite; running: Kirigami.Units.longDuration > 0 }

            Rectangle {
                anchors.fill: parent
                radius: height / 2
                opacity: hover.containsMouse ? 1 : 0.8
                Behavior on opacity { NumberAnimation { duration: 200 } }
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: root.edge[0] }
                    GradientStop { position: Math.min(0.98, 0.15 + 0.7 * Math.abs(Math.sin(ring.drift * Math.PI))); color: root.edge[1] }
                    GradientStop { position: 1; color: root.edge[2] }
                }
            }

            Rectangle {
                anchors.fill: parent
                anchors.margins: 1.5
                radius: height / 2
                // the side islands' colour (the theme's panel)
                color: hover.pressed ? "#30343c" : hover.containsMouse ? "#2a2e35" : "#24272b"
                Behavior on color { ColorAnimation { duration: 150 } }

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 6
                    anchors.rightMargin: 8
                    spacing: 8

                    Orb {
                        Layout.preferredWidth: 26
                        Layout.preferredHeight: 26
                        lively: hover.containsMouse || root.waiting > 0
                    }
                    Text {
                        Layout.fillWidth: true
                        text: root.waiting > 0 ? (root.waiting === 1 ? "1 request waits for your OK" : root.waiting + " requests wait for your OK") : "Search or ask SIOS"
                        color: root.waiting > 0 ? "#ffd19a" : "#c9cfe0"
                        elide: Text.ElideRight
                        font.family: "Instrument Sans"
                        font.pixelSize: 13
                        font.weight: Font.Medium
                    }
                    Rectangle {
                        Layout.preferredHeight: 20
                        Layout.preferredWidth: key.implicitWidth + 12
                        radius: 6
                        color: Qt.rgba(1, 1, 1, 0.08)
                        Text {
                            id: key
                            anchors.centerIn: parent
                            text: "Meta Space"
                            color: "#c8ced6"
                            font.family: "Instrument Sans"
                            font.pixelSize: 11
                        }
                    }
                }
            }
        }

        MouseArea {
            id: hover
            anchors.fill: ring
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            // with something waiting, open the approval window; else the Ask bar
            onClicked: sh.connectSource(root.waiting > 0 ? "sios-approve" : "sios-ask")
        }
        Accessible.role: Accessible.Button
        Accessible.name: root.waiting > 0 ? "Requests waiting for your OK" : "Search or ask SIOS"
    }
}
