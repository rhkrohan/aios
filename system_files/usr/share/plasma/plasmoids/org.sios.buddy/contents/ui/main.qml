/*
    The SIOS buddy, like the preview's pet (build_concept_html/src/components/
    pet/Pet.tsx): the assistant's string orb with eyes and a mouth, floating
    above your windows. It breathes and bounces, blinks, falls asleep when
    nothing happens for a while, wakes when the pointer comes near, and
    ripples with light when you tap it. Drag it anywhere; it remembers.

    It lives in a small floating window of its own (a Plasma dialog), so it
    stays above apps. This widget itself takes no space in the top bar.

    Beside it sit the agents' pets (D103), one per agent, each with its mood
    from the broker; a dot shows new reports, and a click opens the team.

    Not yet: flying to where the AI is working, carrying files, the chat.

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
    // idle | listen | think | work | ask | happy | proud | surprised | confused | sad | sleeping
    property string mood: "idle"
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

                // the face (owner's pick, 2026-10-14: glossy eyes, no blush), drawn on the
                // same 100-unit grid as the design board, in front of the orb's centre.
                // Moods: idle listen think work ask happy proud surprised confused sad sleeping
                Canvas {
                    id: faceCanvas
                    anchors.centerIn: parent
                    width: Math.round(root.size * 1.28)
                    height: width
                    property string m: root.mood
                    property real blink: 1
                    property real ex: root.eye.x
                    property real ey: root.eye.y
                    onMChanged: requestPaint()
                    onBlinkChanged: requestPaint()
                    onExChanged: requestPaint()
                    onEyChanged: requestPaint()
                    Behavior on ex { NumberAnimation { duration: 140 } }
                    Behavior on ey { NumberAnimation { duration: 140 } }
                    SequentialAnimation on blink {
                        loops: Animation.Infinite
                        running: pet.visible && !root.still
                        PauseAnimation { duration: 3900 }
                        NumberAnimation { to: 0.1; duration: 80 }
                        NumberAnimation { to: 1; duration: 90 }
                    }
                    readonly property color ink: "#1a1640"
                    onPaint: {
                        const c = getContext("2d");
                        c.reset();
                        c.scale(width / 100, height / 100);
                        const ink = "#1a1640";
                        const L = 39 + ex * 0.5, R = 61 + ex * 0.5, Y = 50 + ey * 0.5;
                        // a glossy eye: dark oval, a big shine and a small one
                        function eye(x, y, ry) {
                            ry = ry * blink;
                            c.fillStyle = ink;
                            c.beginPath(); c.ellipse(x - 5.4, y - ry, 10.8, ry * 2); c.fill();
                            if (blink < 0.5) return;
                            c.fillStyle = "#ffffff";
                            c.beginPath(); c.arc(x + 1.9, y - ry * 0.42, 2.1, 0, Math.PI * 2); c.fill();
                            c.globalAlpha = 0.8;
                            c.beginPath(); c.arc(x - 1.6, y + ry * 0.45, 1, 0, Math.PI * 2); c.fill();
                            c.globalAlpha = 1;
                        }
                        function stroke(w) { c.strokeStyle = ink; c.lineWidth = w; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(); }
                        function arcUp(x, y, w) { c.beginPath(); c.moveTo(x - w / 2, y + 1.5); c.quadraticCurveTo(x, y - w * 0.8, x + w / 2, y + 1.5); stroke(2.6); }
                        function arcDown(x, y, w) { c.beginPath(); c.moveTo(x - w / 2, y - 1); c.quadraticCurveTo(x, y + w * 0.6, x + w / 2, y - 1); stroke(2.6); }
                        function bar(x, y, w) { c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x + w / 2, y); stroke(2.6); }
                        function brow(x, y, deg) {
                            const a = deg * Math.PI / 180, dx = 4 * Math.cos(a), dy = 4 * Math.sin(a);
                            c.beginPath(); c.moveTo(x - dx, y - dy); c.lineTo(x + dx, y + dy); stroke(2.2);
                        }
                        function mouth(kind) {
                            c.beginPath();
                            if (kind === "smile") { c.moveTo(46, 60); c.quadraticCurveTo(50, 64, 54, 60); stroke(2); }
                            else if (kind === "big") { c.moveTo(44, 59); c.quadraticCurveTo(50, 66, 56, 59); c.closePath(); c.fillStyle = ink; c.fill(); }
                            else if (kind === "o") { c.ellipse(47.2, 57.6, 5.6, 6.8); c.fillStyle = ink; c.fill(); }
                            else if (kind === "O") { c.ellipse(46.4, 57.4, 7.2, 9.2); c.fillStyle = ink; c.fill(); }
                            else if (kind === "flat") { c.moveTo(47, 61); c.lineTo(53, 61); stroke(2); }
                            else if (kind === "wavy") { c.moveTo(45, 61); c.quadraticCurveTo(47.5, 59, 50, 61); c.quadraticCurveTo(52.5, 63, 55, 61); stroke(2); }
                            else if (kind === "frown") { c.moveTo(46, 62); c.quadraticCurveTo(50, 58, 54, 62); stroke(2); }
                        }
                        switch (m) {
                        case "listen": eye(L, Y, 7.1); eye(R, Y, 7.1); brow(39, 40, -8); brow(61, 40, 8); mouth("o"); break;
                        case "think": eye(L - 1, Y - 3, 6.6); eye(R - 1, Y - 3, 6.6); brow(39, 40, -12); brow(61, 39, 0); mouth("flat"); break;
                        case "work": bar(39, 50, 8); bar(61, 50, 8); brow(39, 42, 10); brow(61, 42, -10); mouth("flat"); break;
                        case "ask": eye(L, Y, 7.9); eye(R, Y, 7.9); brow(39, 38, -14); brow(61, 38, 14); mouth("o"); break;
                        case "happy": arcUp(39, 50, 9); arcUp(61, 50, 9); mouth("big"); break;
                        case "proud": arcUp(39, 49, 9); arcUp(61, 49, 9); mouth("smile"); break;
                        case "surprised": eye(L, Y, 8.6); eye(R, Y, 8.6); brow(39, 36, 0); brow(61, 36, 0); mouth("O"); break;
                        case "confused": eye(L, Y, 5.9); eye(R, Y, 7.3); brow(39, 40, -15); brow(61, 38, 12); mouth("wavy"); break;
                        case "sad": eye(L, Y + 2, 6.3); eye(R, Y + 2, 6.3); brow(39, 41, 18); brow(61, 41, -18); mouth("frown"); break;
                        case "sleeping": arcDown(39, 51, 8); arcDown(61, 51, 8); mouth("smile"); break;
                        default: eye(L, Y, 6.6); eye(R, Y, 6.6); mouth("smile");
                        }
                    }
                }

                // a few moods carry a small sign: thinking dots, a question mark, sparkles
                Text {
                    visible: root.mood === "confused" || root.mood === "think" || root.mood === "proud"
                    x: faceCanvas.x + faceCanvas.width * 0.70
                    y: faceCanvas.y + faceCanvas.height * 0.12
                    textFormat: Text.PlainText
                    text: root.mood === "confused" ? "?" : root.mood === "think" ? "\u2026" : "\u2726"
                    color: root.mood === "proud" ? "#ffe08a" : "white"
                    font.pixelSize: Math.round(root.size * 0.2)
                    font.weight: Font.Bold
                    style: Text.Raised
                    styleColor: Qt.rgba(0, 0, 0, 0.35)
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

    // something is waiting for the owner's OK: look up, wide-eyed, until it's answered
    property int waiting: 0
    // the agents' pets and their unread reports (-1 until the first answer, so old news isn't announced)
    property var pets: []
    property int unread: -1
    P5Support.DataSource {
        id: status
        engine: "executable"
        onNewData: (source, data) => {
            try {
                const ok = JSON.parse(String(data.stdout)).ok;
                root.waiting = ok.pending || 0;
                root.pets = (ok.pets || []).slice(0, 6);
                const unread = ok.reports_unread || 0;
                if (unread > root.unread && root.unread >= 0) root.say(unread === 1 ? "An agent has news for you." : "Your agents have " + unread + " new reports.", 4000);
                root.unread = unread;
            } catch (e) { root.waiting = 0; }
            disconnectSource(source);
        }
    }
    Timer { interval: 4000; running: true; repeat: true; triggeredOnStart: true; onTriggered: status.connectSource("capd status 2>/dev/null") }
    onWaitingChanged: {
        if (waiting > 0 && (mood === "idle" || mood === "sleeping")) { mood = "ask"; lastActivity = Date.now(); }
        else if (waiting === 0 && mood === "ask") mood = "idle";
    }

    // ---- the agents' pets, in a small window to the buddy's left (D103)
    PlasmaCore.Dialog {
        id: petsWin
        visible: pet.visible && root.pets.length > 0
        type: PlasmaCore.Dialog.Notification
        flags: Qt.WindowStaysOnTopHint | Qt.WindowDoesNotAcceptFocus | Qt.FramelessWindowHint
        location: PlasmaCore.Types.Floating
        backgroundHints: PlasmaCore.Dialog.NoBackground
        hideOnWindowDeactivate: false
        x: root.spot.x - width + 10
        y: root.spot.y + root.box - height - 14
        mainItem: Row {
            spacing: 6
            Repeater {
                model: root.pets
                Item {
                    required property var modelData
                    width: 40; height: 46
                    Pet { anchors.bottom: parent.bottom; size: 34; tint: modelData.color; mood: modelData.mood; x: 3 }
                    // new reports: a small dot
                    Rectangle {
                        visible: modelData.unread > 0
                        x: 28; y: 6; width: 10; height: 10; radius: 5
                        color: "#e5484d"; border.width: 1.5; border.color: "white"
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        // the desktop knows no names (status is open to any program): open the team
                        onClicked: run.connectSource("sios-agents --page agents")
                    }
                    Accessible.role: Accessible.Button
                    Accessible.name: "An agent, " + modelData.mood + ". Open your team"
                }
            }
        }
    }

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
                textFormat: Text.PlainText
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
