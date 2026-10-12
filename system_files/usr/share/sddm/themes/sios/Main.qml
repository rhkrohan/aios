/*
    The SIOS login screen (SDDM theme), like the preview's lock screen
    (build_concept_html/src/components/shell/Power.tsx, LockScreen):
      - the dusk photo, blurred and darkened (done ahead of time: background.jpg)
      - the date and a big light clock near the top
      - the person's initial, name and a round password field near the bottom
        (arrows to switch person when there is more than one)
      - Sleep, Restart and Shut down at the bottom right
    Plain QtQuick only, so it works without a GPU.
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    width: 1920
    height: 1080
    color: "#0a0f1a"

    readonly property string ui: "Instrument Sans"
    readonly property string display: "Jost"

    // the people who can log in, read once from SDDM's userModel
    property var users: []
    property int current: 0
    readonly property var person: users.length ? users[current] : ({ name: "", realName: "", icon: "" })
    property bool failed: false

    Repeater {
        model: userModel
        delegate: Item {
            required property string name
            required property string realName
            required property string icon
            required property int index
            Component.onCompleted: {
                const list = root.users.slice();
                list[index] = { name: name, realName: realName || name, icon: icon };
                root.users = list;
                if (name === userModel.lastUser) root.current = index;
            }
        }
    }

    Connections {
        target: sddm
        function onLoginFailed() {
            root.failed = true;
            password.text = "";
            password.forceActiveFocus();
            shake.restart();
        }
    }

    function login() {
        if (!person.name) return;
        root.failed = false;
        sddm.login(person.name, password.text, sessionModel.lastIndex);
    }

    Image {
        anchors.fill: parent
        source: config.background || "background.jpg"
        fillMode: Image.PreserveAspectCrop
        asynchronous: false
    }

    // ---- date and clock
    property date now: new Date()
    Timer { interval: 1000; running: true; repeat: true; onTriggered: root.now = new Date() }

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height * 0.12
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.now.toLocaleDateString(Qt.locale(), "dddd, MMMM d")
            color: Qt.rgba(1, 1, 1, 0.85)
            font.family: root.ui
            font.pixelSize: 18
            font.weight: Font.Medium
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.now.toLocaleTimeString(Qt.locale(), "h:mm")
            color: "white"
            font.family: root.display
            font.weight: Font.ExtraLight
            font.pixelSize: 120
            font.letterSpacing: -2
        }
    }

    // ---- who's logging in
    Column {
        id: who
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: parent.height * 0.16
        spacing: 0

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 24

            RoundButton {
                visible: root.users.length > 1
                anchors.verticalCenter: parent.verticalCenter
                iconSource: "icons/left.svg"
                size: 36
                onActivated: { root.current = (root.current + root.users.length - 1) % root.users.length; password.text = ""; root.failed = false; }
                label: "Previous person"
            }

            Rectangle {
                width: 80
                height: 80
                radius: 40
                color: Qt.rgba(1, 1, 1, 0.2)
                border.width: 1
                border.color: Qt.rgba(1, 1, 1, 0.3)
                clip: true
                Text {
                    anchors.centerIn: parent
                    visible: !face.visible
                    text: (root.person.realName || "?").charAt(0).toUpperCase()
                    color: "white"
                    font.family: root.ui
                    font.pixelSize: 30
                    font.weight: Font.DemiBold
                }
                Image {
                    id: face
                    anchors.fill: parent
                    anchors.margins: 1
                    source: root.person.icon && root.person.icon.indexOf("default") < 0 ? root.person.icon : ""
                    visible: status === Image.Ready
                    fillMode: Image.PreserveAspectCrop
                }
            }

            RoundButton {
                visible: root.users.length > 1
                anchors.verticalCenter: parent.verticalCenter
                iconSource: "icons/right.svg"
                size: 36
                onActivated: { root.current = (root.current + 1) % root.users.length; password.text = ""; root.failed = false; }
                label: "Next person"
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 12
            text: root.person.realName
            color: "white"
            font.family: root.ui
            font.pixelSize: 18
            font.weight: Font.DemiBold
        }

        Item { width: 1; height: 16 }

        // the round password field
        Rectangle {
            id: field
            anchors.horizontalCenter: parent.horizontalCenter
            width: 260
            height: 44
            radius: 22
            color: Qt.rgba(1, 1, 1, 0.2)
            border.width: 1
            border.color: root.failed ? Qt.rgba(1, 0.75, 0.7, 0.7) : Qt.rgba(1, 1, 1, 0.25)

            TextField {
                id: password
                anchors.left: parent.left
                anchors.right: go.left
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: 16
                anchors.rightMargin: 4
                echoMode: TextInput.Password
                placeholderText: "Password"
                placeholderTextColor: Qt.rgba(1, 1, 1, 0.6)
                color: "white"
                font.family: root.ui
                font.pixelSize: 14
                background: null
                focus: true
                padding: 0
                selectByMouse: true
                Keys.onReturnPressed: root.login()
                Keys.onEnterPressed: root.login()
                Accessible.name: "Password"
            }

            RoundButton {
                id: go
                anchors.right: parent.right
                anchors.rightMargin: 4
                anchors.verticalCenter: parent.verticalCenter
                size: 36
                fill: 0.25
                iconSource: "icons/arrow.svg"
                onActivated: root.login()
                label: "Log in"
            }

            SequentialAnimation {
                id: shake
                NumberAnimation { target: field; property: "anchors.horizontalCenterOffset"; to: -10; duration: 50 }
                NumberAnimation { target: field; property: "anchors.horizontalCenterOffset"; to: 10; duration: 70 }
                NumberAnimation { target: field; property: "anchors.horizontalCenterOffset"; to: -6; duration: 70 }
                NumberAnimation { target: field; property: "anchors.horizontalCenterOffset"; to: 6; duration: 70 }
                NumberAnimation { target: field; property: "anchors.horizontalCenterOffset"; to: 0; duration: 50 }
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 10
            text: root.failed ? "That password didn't work. Try again." : (keyboard.capsLock ? "Caps Lock is on" : " ")
            color: Qt.rgba(1, 1, 1, 0.7)
            font.family: root.ui
            font.pixelSize: 12
        }
    }

    // ---- power
    Row {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 24
        spacing: 8
        PowerButton { visible: sddm.canSuspend; label: "Sleep"; iconSource: "icons/sleep.svg"; onActivated: sddm.suspend() }
        PowerButton { visible: sddm.canReboot; label: "Restart"; iconSource: "icons/restart.svg"; onActivated: sddm.reboot() }
        PowerButton { visible: sddm.canPowerOff; label: "Shut down"; iconSource: "icons/shutdown.svg"; onActivated: sddm.powerOff() }
    }

    component RoundButton: Rectangle {
        id: rb
        property string iconSource
        property string label
        property int size: 40
        property real fill: 0.15
        signal activated()
        width: size
        height: size
        radius: size / 2
        color: Qt.rgba(1, 1, 1, ma.containsMouse ? fill + 0.1 : fill)
        border.width: 1
        border.color: Qt.rgba(1, 1, 1, 0.2)
        Image { anchors.centerIn: parent; source: rb.iconSource; width: 16; height: 16; sourceSize: Qt.size(32, 32) }
        MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: rb.activated() }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }

    component PowerButton: Column {
        id: pb
        property string label
        property string iconSource
        signal activated()
        width: 64
        spacing: 6
        RoundButton { anchors.horizontalCenter: parent.horizontalCenter; iconSource: pb.iconSource; label: pb.label; onActivated: pb.activated() }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: pb.label
            color: Qt.rgba(1, 1, 1, 0.8)
            font.family: root.ui
            font.pixelSize: 12
        }
    }
}
