// An agent's pet (D103): a soft round face in the agent's colour whose look
// follows what the broker knows about it. No blush.
//   idle      blinks now and then
//   working   bobs a little, eyes glancing side to side
//   thinking  eyes up, slow bob
//   asking    one brow raised and a "?" beside it
//   happy     eyes closed in a smile (a task ended well)
//   worried   brows tilted up in the middle (a task didn't finish)
//   sleepy    eyes shut as slits, a small "z" (paused or no working time)
import QtQuick
import QtQuick.Layouts

Item {
    id: pet
    property string tint: "mint"
    property string mood: "idle"
    property int size: 44
    // older callers only knew sleepy
    property bool sleepy: false
    readonly property string look: sleepy && mood === "idle" ? "sleepy" : mood
    readonly property var colors: ({ mint: "#9ee2c6", sky: "#a9cdff", violet: "#c4bbff", peach: "#ffc9a3", rose: "#ffb3c8", lemon: "#f7df8c", slate: "#c3cbd4", coral: "#ffb0a3" })
    readonly property real eye: size * 0.11
    readonly property real gap: size * 0.16
    readonly property bool calm: look === "sleepy" || look === "happy"
    implicitWidth: size
    implicitHeight: size
    Layout.preferredWidth: size
    Layout.preferredHeight: size

    // the bob: working and thinking move, the rest stay still
    property real bob: 0
    SequentialAnimation on bob {
        running: pet.visible && (pet.look === "working" || pet.look === "thinking")
        loops: Animation.Infinite
        NumberAnimation { to: -pet.size * 0.05; duration: pet.look === "working" ? 420 : 900; easing.type: Easing.InOutSine }
        NumberAnimation { to: 0; duration: pet.look === "working" ? 420 : 900; easing.type: Easing.InOutSine }
        onRunningChanged: if (!running) pet.bob = 0
    }
    // where the eyes look: side to side while working, up while thinking
    property real glance: 0
    SequentialAnimation on glance {
        running: pet.visible && pet.look === "working"
        loops: Animation.Infinite
        NumberAnimation { to: pet.size * 0.05; duration: 500; easing.type: Easing.InOutQuad }
        PauseAnimation { duration: 700 }
        NumberAnimation { to: -pet.size * 0.05; duration: 500; easing.type: Easing.InOutQuad }
        PauseAnimation { duration: 700 }
        onRunningChanged: if (!running) pet.glance = 0
    }
    // a blink: the eyes close for a moment every few seconds
    property real open: 1
    SequentialAnimation on open {
        running: pet.visible && !pet.calm
        loops: Animation.Infinite
        PauseAnimation { duration: 2600 + Math.random() * 2400 }
        NumberAnimation { to: 0.1; duration: 70 }
        NumberAnimation { to: 1; duration: 110 }
        onRunningChanged: if (!running) pet.open = 1
    }

    Rectangle {
        id: face
        width: pet.size; height: pet.size; radius: pet.size / 2
        y: pet.bob
        color: pet.colors[pet.tint] || pet.tint || "#9ee2c6"
        Behavior on color { ColorAnimation { duration: 200 } }

        Row {
            anchors.centerIn: parent
            anchors.horizontalCenterOffset: pet.glance
            anchors.verticalCenterOffset: pet.look === "thinking" ? -pet.size * 0.09 : 0
            Behavior on anchors.verticalCenterOffset { NumberAnimation { duration: 250 } }
            spacing: pet.gap
            Repeater {
                model: 2
                Item {
                    required property int index
                    width: pet.look === "sleepy" ? pet.size * 0.17 : pet.eye * 1.5
                    height: pet.eye * 1.6
                    // open eyes
                    Rectangle {
                        visible: pet.look !== "sleepy" && pet.look !== "happy"
                        anchors.centerIn: parent
                        width: pet.eye; height: Math.max(2, pet.eye * pet.open); radius: width / 2
                        color: "#1d1d1f"
                    }
                    // sleepy slits
                    Rectangle {
                        visible: pet.look === "sleepy"
                        anchors.centerIn: parent
                        width: parent.width; height: 2; radius: 1
                        color: "#1d1d1f"
                    }
                    // happy: closed in a smile, a small arch
                    Canvas {
                        visible: pet.look === "happy"
                        anchors.centerIn: parent
                        width: pet.eye * 1.7; height: pet.eye * 1.2
                        onVisibleChanged: requestPaint()
                        onWidthChanged: requestPaint()
                        onPaint: {
                            const c = getContext("2d");
                            c.reset();
                            c.strokeStyle = "#1d1d1f";
                            c.lineWidth = Math.max(1.6, pet.size * 0.035);
                            c.lineCap = "round";
                            c.beginPath();
                            c.arc(width / 2, height * 0.95, width * 0.36, Math.PI * 1.1, Math.PI * 1.9);
                            c.stroke();
                        }
                    }
                    // brows: asking raises the right one, worried tilts both up in the middle
                    Rectangle {
                        visible: (pet.look === "asking" && index === 1) || pet.look === "worried"
                        anchors.horizontalCenter: parent.horizontalCenter
                        y: -pet.eye * (pet.look === "asking" ? 1.1 : 0.7)
                        width: pet.eye * 1.5; height: Math.max(1.5, pet.size * 0.035); radius: height / 2
                        color: "#1d1d1f"
                        rotation: pet.look === "worried" ? (index === 0 ? -18 : 18) : -12
                    }
                }
            }
        }
    }

    // asking: a small "?" bubble at the top right
    Rectangle {
        visible: pet.look === "asking"
        x: pet.size * 0.72; y: -pet.size * 0.12 + pet.bob
        width: pet.size * 0.4; height: width; radius: width / 2
        color: "#ffffff"
        border.width: 1; border.color: "#d8d8de"
        Text { anchors.centerIn: parent; text: "?"; color: "#c06a00"; font.pixelSize: parent.width * 0.7; font.weight: Font.Bold }
        SequentialAnimation on scale {
            running: pet.visible && pet.look === "asking"; loops: Animation.Infinite
            NumberAnimation { to: 1.12; duration: 500; easing.type: Easing.InOutSine }
            NumberAnimation { to: 1; duration: 500; easing.type: Easing.InOutSine }
        }
    }
    // sleepy: a small z drifting up
    Text {
        id: zed
        visible: pet.look === "sleepy" && pet.size >= 30
        x: pet.size * 0.78
        text: "z"
        color: "#8a8a92"
        font.pixelSize: pet.size * 0.26; font.weight: Font.DemiBold
        property real t: 0
        y: -pet.size * 0.05 - t * pet.size * 0.18
        opacity: 1 - t
        NumberAnimation on t { running: zed.visible; from: 0; to: 1; duration: 2200; loops: Animation.Infinite }
    }
}
