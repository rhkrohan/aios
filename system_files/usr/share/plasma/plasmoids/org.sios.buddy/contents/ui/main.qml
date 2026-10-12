/*
    The SIOS buddy, like the preview's pet (build_concept_html/src/components/
    pet/Pet.tsx): the assistant's string orb with eyes and a mouth, floating
    above your windows. It breathes and bounces, blinks, falls asleep when
    nothing happens for a while, wakes when the pointer comes near, and
    ripples with light when you tap it. Drag it anywhere; it remembers.

    It lives in a small floating window of its own (a Plasma dialog), so it
    stays above apps. This widget itself takes no space in the top bar.

    Not yet (needs brain-d, Stage B): flying to where the AI is working,
    carrying files, the chat, and the helper pets.

    The eyes follow the pointer only while it's over the buddy: on Wayland no
    app can see the cursor elsewhere, which is the point (core rule 7).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import org.kde.plasma.extras as PlasmaExtras
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation
    fullRepresentation: Item {
        Layout.minimumWidth: 0
        Layout.maximumWidth: 0
        Layout.preferredWidth: 0
    }

    readonly property int size: 76
    // reduced motion (KDE animation speed set to Instant): no bouncing, blinking or floating z's
    readonly property bool still: Kirigami.Units.longDuration === 0
    readonly property int box: 112          // the window around it, room for the strands and the bounce
    property string mood: "idle"            // idle | happy | sleeping
    property string bubble: ""
    property real lastActivity: Date.now()
    property point eye: Qt.point(0, 0)

    readonly property rect screenRect: Qt.rect(0, 0, Screen.width, Screen.height)
    function home() { return Qt.point(screenRect.width - box - 24, screenRect.height - box - 110); }
    function clamp(p) {
        return Qt.point(Math.max(0, Math.min(screenRect.width - box, p.x)), Math.max(36, Math.min(screenRect.height - box, p.y)));
    }
    property point spot: clamp(Plasmoid.configuration.petX >= 0 ? Qt.point(Plasmoid.configuration.petX, Plasmoid.configuration.petY) : home())

    P5Support.DataSource {
        id: run
        engine: "executable"
        onNewData: (source) => disconnectSource(source)
    }

    Plasmoid.contextualActions: [
        PlasmaCore.Action {
            text: Plasmoid.configuration.visible ? "Hide buddy" : "Show buddy"
            icon.name: Plasmoid.configuration.visible ? "view-hidden" : "view-visible"
            onTriggered: Plasmoid.configuration.visible = !Plasmoid.configuration.visible
        },
        PlasmaCore.Action {
            text: "Send buddy home"
            icon.name: "go-home"
            onTriggered: { Plasmoid.configuration.petX = -1; Plasmoid.configuration.petY = -1; }
        }
    ]

    PlasmaExtras.Menu {
        id: petMenu
        PlasmaExtras.MenuItem { text: "Hide buddy"; icon: "view-hidden"; onClicked: Plasmoid.configuration.visible = false }
        PlasmaExtras.MenuItem { text: "Send buddy home"; icon: "go-home"; onClicked: { Plasmoid.configuration.petX = -1; Plasmoid.configuration.petY = -1; root.spot = root.clamp(root.home()); } }
    }

    function wake() {
        lastActivity = Date.now();
        if (mood === "sleeping") mood = "idle";
    }
    function say(text, ms) {
        bubble = text;
        bubbleTimer.interval = ms || 3500;
        bubbleTimer.restart();
    }
    Timer { id: bubbleTimer; onTriggered: root.bubble = "" }

    // fall asleep when nothing has happened for a while
    Timer {
        interval: 3000
        repeat: true
        running: Plasmoid.configuration.visible
        onTriggered: if (root.mood === "idle" && Date.now() - root.lastActivity > 25000) root.mood = "sleeping"
    }

    // ---- the buddy's own window
    PlasmaCore.Dialog {
        id: pet
        visible: Plasmoid.configuration.visible
        type: PlasmaCore.Dialog.Notification
        flags: Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus | Qt.FramelessWindowHint
        location: PlasmaCore.Types.Floating
        backgroundHints: PlasmaCore.Dialog.NoBackground
        hideOnWindowDeactivate: false
        x: root.spot.x
        y: root.spot.y

        mainItem: Item {
            id: stage
            width: root.box
            height: root.box

            // soft shadow on the "ground"
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                y: parent.height - 16
                width: 38
                height: 8
                radius: 4
                color: Qt.rgba(0, 0, 0, 0.22)
            }

            Item {
                id: body
                width: root.size
                height: root.size
                anchors.horizontalCenter: parent.horizontalCenter
                y: (parent.height - height) / 2 - 6 + bob

                property real bob: 0
                property real sx: 1
                property real sy: 1
                transform: Scale { origin.x: root.size / 2; origin.y: root.size; xScale: body.sx; yScale: body.sy }

                // breathing and bouncing on its toes (idle), slow breaths (asleep), a hop (happy)
                SequentialAnimation {
                    running: root.mood === "idle" && pet.visible && !root.still
                    loops: Animation.Infinite
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: -6; duration: 600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sx"; to: 0.96; duration: 600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sy"; to: 1.05; duration: 600; easing.type: Easing.InOutSine }
                    }
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: 0; duration: 600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sx"; to: 1.06; duration: 600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sy"; to: 0.94; duration: 600; easing.type: Easing.InOutSine }
                    }
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "sx"; to: 1; duration: 1200; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sy"; to: 1; duration: 1200; easing.type: Easing.InOutSine }
                    }
                }
                SequentialAnimation {
                    running: root.mood === "sleeping" && pet.visible && !root.still
                    loops: Animation.Infinite
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: 2; duration: 1600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sx"; to: 1.05; duration: 1600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sy"; to: 0.97; duration: 1600; easing.type: Easing.InOutSine }
                    }
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: 0; duration: 1600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sx"; to: 1; duration: 1600; easing.type: Easing.InOutSine }
                        NumberAnimation { target: body; property: "sy"; to: 1; duration: 1600; easing.type: Easing.InOutSine }
                    }
                }
                SequentialAnimation {
                    id: hop
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: -16; duration: 220; easing.type: Easing.OutQuad }
                        NumberAnimation { target: body; property: "sx"; to: 0.92; duration: 220 }
                        NumberAnimation { target: body; property: "sy"; to: 1.1; duration: 220 }
                    }
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: 0; duration: 220; easing.type: Easing.InQuad }
                        NumberAnimation { target: body; property: "sx"; to: 1.1; duration: 220 }
                        NumberAnimation { target: body; property: "sy"; to: 0.9; duration: 220 }
                    }
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: -8; duration: 180 }
                        NumberAnimation { target: body; property: "sx"; to: 0.96; duration: 180 }
                        NumberAnimation { target: body; property: "sy"; to: 1.04; duration: 180 }
                    }
                    ParallelAnimation {
                        NumberAnimation { target: body; property: "bob"; to: 0; duration: 180 }
                        NumberAnimation { target: body; property: "sx"; to: 1; duration: 180 }
                        NumberAnimation { target: body; property: "sy"; to: 1; duration: 180 }
                    }
                    ScriptAction { script: root.mood = "idle" }
                }

                // the orb, a little bigger than the body so the strands reach out
                Orb {
                    anchors.centerIn: parent
                    width: Math.round(root.size * 1.28)
                    height: width
                    strands: 22
                    lively: true
                }

                // eyes (drawn for a 58px pet in the preview; scaled)
                Item {
                    id: face
                    anchors.fill: parent
                    readonly property real k: root.size / 58

                    Row {
                        visible: root.mood === "idle"
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: parent.height * 0.30
                        spacing: 7 * face.k
                        Repeater {
                            model: 2
                            Rectangle {
                                id: eyeWhite
                                width: 11 * face.k
                                height: 14 * face.k
                                radius: width / 2
                                color: "white"
                                clip: true
                                property real blink: 1
                                transform: Scale { origin.y: eyeWhite.height / 2; yScale: eyeWhite.blink }
                                SequentialAnimation on blink {
                                    loops: Animation.Infinite
                                    running: pet.visible && !root.still
                                    PauseAnimation { duration: 3900 }
                                    NumberAnimation { to: 0.1; duration: 80 }
                                    NumberAnimation { to: 1; duration: 90 }
                                }
                                Rectangle {
                                    width: 6 * face.k
                                    height: width
                                    radius: width / 2
                                    color: "#1a1d3a"
                                    x: (parent.width - width) / 2 + root.eye.x * face.k
                                    y: (parent.height - height) / 2 + root.eye.y * face.k
                                    Behavior on x { NumberAnimation { duration: 120 } }
                                    Behavior on y { NumberAnimation { duration: 120 } }
                                }
                            }
                        }
                    }
                    // happy: closed upturned eyes
                    Row {
                        visible: root.mood === "happy"
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: parent.height * 0.34
                        spacing: 8 * face.k
                        Repeater {
                            model: 2
                            Canvas {
                                width: 11 * face.k
                                height: 7 * face.k
                                onPaint: {
                                    const c = getContext("2d"); const k = face.k;
                                    c.reset(); c.scale(k, k);
                                    c.strokeStyle = "#1a1d3a"; c.lineWidth = 2.2; c.lineCap = "round";
                                    c.beginPath(); c.moveTo(1, 6); c.quadraticCurveTo(5.5, 0, 10, 6); c.stroke();
                                }
                            }
                        }
                    }
                    // asleep: closed lines
                    Row {
                        visible: root.mood === "sleeping"
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: parent.height * 0.38
                        spacing: 9 * face.k
                        Repeater { model: 2; Rectangle { width: 9 * face.k; height: 2.5 * face.k; radius: height / 2; color: "#1a1d3a" } }
                    }

                    // mouth
                    Canvas {
                        id: mouth
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: parent.height * 0.57
                        width: 12 * face.k
                        height: 8 * face.k
                        property string m: root.mood
                        onMChanged: requestPaint()
                        onPaint: {
                            const c = getContext("2d"); const k = face.k;
                            c.reset(); c.scale(k, k);
                            c.strokeStyle = "#1a1d3a"; c.lineWidth = 1.8; c.lineCap = "round"; c.lineJoin = "round";
                            if (m === "sleeping") {
                                c.fillStyle = "rgba(26,29,58,0.8)";
                                c.beginPath(); c.ellipse(3, 1, 6, 5); c.fill();
                            } else {
                                c.beginPath();
                                if (m === "happy") { c.moveTo(1.5, 1.5); c.quadraticCurveTo(6, 7.5, 10.5, 1.5); c.fillStyle = "#ff7a9a"; c.fill(); }
                                else { c.moveTo(2.5, 2); c.quadraticCurveTo(6, 5.5, 9.5, 2); }
                                c.stroke();
                            }
                        }
                    }
                }

                // a ripple of the orb's light when you tap it
                Repeater {
                    model: 2
                    Rectangle {
                        id: ripple
                        anchors.centerIn: parent
                        width: root.size
                        height: root.size
                        radius: width / 2
                        color: "transparent"
                        border.width: 1.5
                        border.color: Qt.rgba(150 / 255, 160 / 255, 1, 0.85)
                        opacity: 0
                        scale: 0.7
                        Connections {
                            target: root
                            function onTapped() { rippleAnim.restart(); }
                        }
                        SequentialAnimation {
                            id: rippleAnim
                            PauseAnimation { duration: index * 180 }
                            ScriptAction { script: { ripple.opacity = 0.9; ripple.scale = 0.7; } }
                            ParallelAnimation {
                                NumberAnimation { target: ripple; property: "opacity"; to: 0; duration: 900; easing.type: Easing.OutQuad }
                                NumberAnimation { target: ripple; property: "scale"; to: 1.6; duration: 900; easing.type: Easing.OutQuad }
                            }
                        }
                    }
                }

                // z z z
                Repeater {
                    model: root.mood === "sleeping" && !root.still ? 3 : 0
                    Text {
                        id: z
                        text: "z"
                        color: "#2f56d0"
                        font.bold: true
                        font.pixelSize: 10 + index * 3
                        x: root.size - 6 + index * 7
                        property real rise: 0
                        y: -4 - index * 8 - rise
                        opacity: 0
                        SequentialAnimation {
                            running: true
                            loops: Animation.Infinite
                            PauseAnimation { duration: index * 600 }
                            ParallelAnimation {
                                SequentialAnimation {
                                    NumberAnimation { target: z; property: "opacity"; to: 1; duration: 1200 }
                                    NumberAnimation { target: z; property: "opacity"; to: 0; duration: 1200 }
                                }
                                NumberAnimation { target: z; property: "rise"; from: -4; to: 6; duration: 2400 }
                            }
                        }
                    }
                }
            }

            // drag to move, tap for a hello; eyes look at the pointer while it's here
            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
                property point grab
                property bool moved: false
                onEntered: root.wake()
                onPositionChanged: (m) => {
                    const dx = m.x - width / 2, dy = m.y - height / 2;
                    const d = Math.max(1, Math.hypot(dx, dy));
                    root.eye = Qt.point(dx / d * 3, dy / d * 2.5);
                    if (pressed) {
                        const g = mapToGlobal(m.x, m.y);
                        if (!moved && Math.hypot(g.x - grab.x, g.y - grab.y) < 4) return;
                        moved = true;
                        root.spot = root.clamp(Qt.point(g.x - grab.x + start.x, g.y - grab.y + start.y));
                    }
                }
                property point start
                onExited: root.eye = Qt.point(0, 0)
                onPressed: (m) => {
                    if (m.button === Qt.RightButton) { petMenu.visualParent = body; petMenu.openRelative(); return; }
                    grab = mapToGlobal(m.x, m.y); start = root.spot; moved = false; root.wake();
                }
                onReleased: (m) => {
                    if (m.button === Qt.RightButton) return;
                    if (moved) {
                        Plasmoid.configuration.petX = Math.round(root.spot.x);
                        Plasmoid.configuration.petY = Math.round(root.spot.y);
                    } else {
                        root.tapped();
                        root.mood = "happy";
                        hop.restart();
                        root.say("Hi! I'm your SIOS buddy. Soon you can tell me what you need right here.");
                    }
                }
            }
        }
    }
    signal tapped()

    // ---- speech bubble, in its own small window above the buddy
    PlasmaCore.Dialog {
        visible: pet.visible && root.bubble !== ""
        type: PlasmaCore.Dialog.Notification
        flags: Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus | Qt.FramelessWindowHint
        location: PlasmaCore.Types.Floating
        backgroundHints: PlasmaCore.Dialog.NoBackground
        hideOnWindowDeactivate: false
        x: root.spot.x + root.box - width + 4
        y: root.spot.y - height + 6
        mainItem: Rectangle {
            width: Math.min(260, label.implicitWidth + 24)
            height: label.implicitHeight + 14
            radius: 16
            color: Qt.rgba(253 / 255, 253 / 255, 1, 0.95)
            border.width: 1
            border.color: Qt.rgba(20 / 255, 24 / 255, 30 / 255, 0.08)
            Text {
                id: label
                anchors.centerIn: parent
                width: Math.min(236, implicitWidth)
                text: root.bubble
                wrapMode: Text.WordWrap
                color: "#1d1d1f"
                font.family: "Instrument Sans"
                font.pixelSize: 13
                font.weight: Font.Medium
            }
        }
    }

    // ---- hidden: a small orb peeks from the right edge; tap to bring it back
    PlasmaCore.Dialog {
        visible: !Plasmoid.configuration.visible
        type: PlasmaCore.Dialog.Notification
        flags: Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus | Qt.FramelessWindowHint
        location: PlasmaCore.Types.Floating
        backgroundHints: PlasmaCore.Dialog.NoBackground
        hideOnWindowDeactivate: false
        x: root.screenRect.width - 46
        y: root.screenRect.height - 196
        mainItem: Rectangle {
            width: 46
            height: 42
            radius: 21
            color: Qt.rgba(253 / 255, 253 / 255, 1, 0.9)
            border.width: 1
            border.color: Qt.rgba(1, 1, 1, 0.7)
            Orb { anchors.verticalCenter: parent.verticalCenter; x: 8; width: 26; height: 26; strands: 12 }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: Plasmoid.configuration.visible = true
            }
            Accessible.role: Accessible.Button
            Accessible.name: "Show your SIOS buddy"
        }
    }
}
