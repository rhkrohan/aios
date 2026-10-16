// Sound: what you hear and what your microphone picks up (sound.cpp: PipeWire).
// Reads `sound.state`, changes with `sound.set(key, value)` and `sound.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    readonly property var st: sound.state
    readonly property var output: st.output || ({})
    readonly property var input: st.input || ({})
    readonly property var notify: st.notify || ({})
    readonly property int most: st.louder ? 150 : 100
    // opened on this page from the start, `visible` never changes: read once now too
    Component.onCompleted: if (visible) sound.refresh()
    onVisibleChanged: {
        if (visible) sound.refresh();
        else if (st.metering) sound.act("meter", { on: false });   // the microphone closes with the page
    }

    // a volume with its mute button and the number
    component Volume: RowLayout {
        id: vol
        property int value
        property bool muted
        property int maximum: 100
        property string icon: "volume-2"
        signal changed(int v)
        signal muteToggled()
        Layout.fillWidth: true
        spacing: 12
        Rectangle {
            implicitWidth: 34; implicitHeight: 34; radius: 10
            color: mm.containsMouse ? Theme.surface3 : Theme.surface2
            Icon { anchors.centerIn: parent; name: vol.muted ? (vol.icon === "mic" ? "mic-off" : "volume-x") : vol.icon; size: 17; color: vol.muted ? Theme.danger : Theme.fg2 }
            MouseArea { id: mm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: vol.muteToggled() }
            Accessible.role: Accessible.Button
            Accessible.name: vol.muted ? "Unmute" : "Mute"
        }
        Slider {
            from: 0; to: vol.maximum; stepSize: 1
            value: vol.value
            enabled: !vol.muted
            onMoved: vol.changed(Math.round(value))
        }
        Text { Layout.preferredWidth: 44; horizontalAlignment: Text.AlignRight; text: vol.muted ? "Off" : vol.value + "%"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
    }

    PageTitle { title: "Sound"; sub: "What you hear, and what your microphone picks up." }

    Soon {
        visible: pg.st.available === false
        text: "Sound isn't available right now: the sound service isn't answering. Restarting the computer usually brings it back."
    }

    // ---- what you hear
    Card {
        visible: pg.st.available === true
        Text { text: "Output"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
        SettingRow {
            label: "Play sound through"
            Select {
                options: (pg.st.outputs || []).map(o => [o.name, o.label])
                value: pg.output.name
                onPicked: v => sound.set("output", v)
            }
        }
        Text { visible: (pg.st.outputs || []).length === 0; text: "No speakers or headphones found."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
        Volume {
            visible: !!pg.output.name
            value: pg.output.volume || 0
            muted: !!pg.output.mute
            maximum: pg.most
            onChanged: v => sound.set("volume", v)
            onMuteToggled: sound.set("mute", !pg.output.mute)
        }
        RowLayout {
            visible: !!pg.output.name
            Text { Layout.fillWidth: true; text: "Plays “front left”, then “front right”."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            Button { text: "Play a test sound"; kind: "plain"; onClicked: sound.act("test", {}) }
        }
    }

    // ---- what your microphone picks up
    Card {
        visible: pg.st.available === true
        Text { text: "Input"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
        SettingRow {
            label: "Microphone"
            Select {
                options: (pg.st.inputs || []).map(o => [o.name, o.label])
                value: pg.input.name
                onPicked: v => sound.set("input", v)
            }
        }
        Text { visible: (pg.st.inputs || []).length === 0; text: "No microphone found."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
        Volume {
            visible: !!pg.input.name
            icon: "mic"
            value: pg.input.volume || 0
            muted: !!pg.input.mute
            onChanged: v => sound.set("inputVolume", v)
            onMuteToggled: sound.set("inputMute", !pg.input.mute)
        }
        SettingRow {
            visible: !!pg.input.name
            label: "Test your microphone"
            sub: pg.st.metering ? "Speak: the bar moves with your voice. It stops listening when you turn this off or leave the page." : "Shows how loud your microphone hears you. Nothing is recorded."
            Toggle { on: !!pg.st.metering; onToggled: sound.act("meter", { on: !pg.st.metering }) }
        }
        Rectangle {
            visible: !!pg.st.metering
            Layout.fillWidth: true
            implicitHeight: 8; radius: 4; color: Theme.surface3
            Rectangle {
                width: parent.width * Math.min(1, pg.st.level || 0); height: parent.height; radius: 4
                color: (pg.st.level || 0) > 0.9 ? Theme.danger : Theme.ok
                Behavior on width { NumberAnimation { duration: 60 } }
            }
        }
    }

    // ---- the computer's own sounds
    Card {
        visible: pg.st.available === true
        Text { text: "System sounds"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
        SettingRow {
            label: "Notification sounds"
            sub: "Sounds for new messages, reminders and alerts."
            Toggle { on: !pg.notify.mute; onToggled: sound.set("notifyMute", !pg.notify.mute) }
        }
        Volume {
            visible: !pg.notify.mute
            icon: "bell"
            value: pg.notify.volume === undefined ? 100 : pg.notify.volume
            onChanged: v => sound.set("notifyVolume", v)
            onMuteToggled: sound.set("notifyMute", true)
        }
        SettingRow {
            divider: true
            label: "Play a sound when the volume changes"
            Toggle { on: !!pg.st.feedback; onToggled: sound.set("feedback", !pg.st.feedback) }
        }
    }

    Advanced {
        visible: pg.st.available === true
        Card {
            SettingRow {
                visible: pg.output.channels === 2
                label: "Balance"
                sub: "Between the left and right speaker."
            }
            RowLayout {
                visible: pg.output.channels === 2
                spacing: 12
                Text { text: "Left"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                Slider {
                    from: -1; to: 1; stepSize: 0.05
                    value: pg.output.balance || 0
                    onMoved: sound.set("balance", Math.abs(value) < 0.04 ? 0 : value)
                }
                Text { text: "Right"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            }
            SettingRow {
                divider: pg.output.channels === 2
                visible: (pg.st.profiles || []).length > 0
                label: "Profile"
                sub: "How this sound card is used (for example stereo, surround or HDMI)."
                Select { options: pg.st.profiles || []; value: pg.st.profile; onPicked: v => sound.set("profile", v) }
            }
            SettingRow {
                divider: true
                label: "Allow louder than 100%"
                sub: "Up to 150%. Sound can distort, and loud sound can hurt your ears or your speakers."
                Toggle { on: !!pg.st.louder; onToggled: sound.set("louder", !pg.st.louder) }
            }
        }
        Card {
            Text { text: "Apps playing now"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
            Text { visible: (pg.st.apps || []).length === 0; text: "Nothing is playing."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            Repeater {
                model: pg.st.apps || []
                delegate: ColumnLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 4
                    Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.name || "An app"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.Medium }
                    Volume {
                        value: modelData.volume
                        muted: modelData.mute
                        maximum: pg.most
                        onChanged: v => sound.act("appVolume", { index: modelData.index, volume: v })
                        onMuteToggled: sound.act("appMute", { index: modelData.index, mute: !modelData.mute })
                    }
                }
            }
        }
    }
}
