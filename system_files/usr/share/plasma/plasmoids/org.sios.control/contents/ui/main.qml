/*
    The SIOS Control Center, like the preview's ControlCenter.tsx: a sliders
    icon in the top bar that opens one panel with
      - tiles: Wi-Fi, Bluetooth, Do not disturb, Dark mode
      - sliders: brightness and volume
      - recent notifications, with "Clear all"
    Everything is real: NetworkManager for Wi-Fi, bluetoothctl, KDE's
    notification settings, the SIOS light/dark looks, KDE's ScreenBrightness
    service and PipeWire (wpctl) for volume.
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import org.kde.plasma.networkmanagement as PlasmaNM
import org.kde.notificationmanager as NotificationManager
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    readonly property bool dark: Kirigami.Theme.backgroundColor.hslLightness < 0.5
    readonly property string ink: dark ? "-light" : ""
    readonly property color fg: dark ? "#ececea" : "#1d1d1f"
    readonly property color fg2: dark ? "#a9a9a4" : "#5c5c59"
    readonly property color fg3: dark ? "#7c7c77" : "#8b8b86"
    readonly property color surface: dark ? "#1e2023" : "#ffffff"
    readonly property color surface2: dark ? "#24272b" : "#f7f7f5"
    readonly property color surface3: dark ? "#2c3034" : "#efefeb"
    readonly property color line: dark ? "#33373c" : "#e4e4df"
    readonly property color accent: dark ? "#8fb3d9" : "#2f5d8a"
    readonly property string ui: "Instrument Sans"

    function icon(name) { return Qt.resolvedUrl("../images/" + name + ".svg"); }

    toolTipMainText: "Control Center"
    toolTipSubText: "Wi-Fi, Bluetooth, Do not disturb, Dark mode, brightness and volume"

    compactRepresentation: MouseArea {
        Layout.minimumWidth: 28
        Layout.preferredWidth: 28
        onClicked: root.expanded = !root.expanded
        Kirigami.Icon {
            anchors.centerIn: parent
            width: 16
            height: 16
            source: root.icon("sliders" + root.ink)
        }
        Accessible.role: Accessible.Button
        Accessible.name: "Control Center"
    }

    // ---- the system, read and changed
    P5Support.DataSource {
        id: sh
        engine: "executable"
        onNewData: (source, data) => {
            const out = String(data.stdout).trim();
            if (source === root.readBt) root.btOn = out === "yes";
            else if (source === root.readVol) { const m = out.match(/([0-9.]+)/); if (m) root.volume = Math.round(parseFloat(m[1]) * 100); root.muted = out.indexOf("MUTED") >= 0; }
            else if (source === root.readBright) { const v = parseInt(out); if (!isNaN(v)) root.brightness = Math.round(v / 100); }
            disconnectSource(source);
        }
    }
    function run(cmd) { sh.connectSource(cmd); }

    readonly property string readBt: "bluetoothctl show 2>/dev/null | awk '/Powered:/ {print $2; exit}'"
    readonly property string readVol: "wpctl get-volume @DEFAULT_AUDIO_SINK@"
    readonly property string readBright: "qdbus-qt6 org.kde.ScreenBrightness /org/kde/ScreenBrightness/display0 org.freedesktop.DBus.Properties.Get org.kde.ScreenBrightness.Display Brightness"
    function refresh() { run(readBt); run(readVol); run(readBright); }
    onExpandedChanged: if (root.expanded) refresh()

    property bool btOn: false
    property int volume: 50
    property bool muted: false
    property int brightness: 100

    PlasmaNM.EnabledConnections { id: nm }

    NotificationManager.Settings { id: notifySettings }
    readonly property bool dnd: notifySettings.notificationsInhibitedUntil > new Date()
    function setDnd(on) {
        notifySettings.notificationsInhibitedUntil = on ? new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000) : new Date(0);
        notifySettings.save();
    }

    readonly property bool darkLook: dark
    function setDark(on) { run("plasma-apply-lookandfeel -a " + (on ? "org.sios.desktop.dark" : "org.sios.desktop")); }

    NotificationManager.Notifications {
        id: history
        showExpired: true
        showDismissed: true
        showJobs: false
        showNotifications: true
        groupMode: NotificationManager.Notifications.GroupDisabled
        sortMode: NotificationManager.Notifications.SortByDate
        limit: 6
    }

    // ---- the panel
    component Tile: Rectangle {
        id: tile
        property string iconName
        property string label
        property string sub
        property bool on
        property bool available: true
        signal toggled()
        Layout.fillWidth: true
        implicitHeight: 52
        radius: 16
        color: on ? root.surface : (m.containsMouse ? root.surface3 : root.surface2)
        border.width: 1
        border.color: root.line
        opacity: available ? 1 : 0.5
        RowLayout {
            anchors.fill: parent
            anchors.margins: 10
            spacing: 10
            Rectangle {
                implicitWidth: 32
                implicitHeight: 32
                radius: 16
                color: tile.on ? root.accent : root.surface3
                Kirigami.Icon { anchors.centerIn: parent; width: 15; height: 15; source: root.icon(tile.iconName + (tile.on ? "-white" : root.ink)) }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Text { text: tile.label; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold; elide: Text.ElideRight; Layout.fillWidth: true }
                Text { text: tile.sub; color: root.fg2; font.family: root.ui; font.pixelSize: 12; elide: Text.ElideRight; Layout.fillWidth: true }
            }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; enabled: tile.available; cursorShape: Qt.PointingHandCursor; onClicked: tile.toggled() }
        Accessible.role: Accessible.CheckBox
        Accessible.checked: on
        Accessible.name: label
    }

    component Level: RowLayout {
        id: level
        property string iconName
        property string label
        property int value
        signal moved(int v)
        spacing: 10
        Kirigami.Icon { width: 15; height: 15; Layout.preferredWidth: 15; Layout.preferredHeight: 15; source: root.icon(level.iconName + root.ink); opacity: 0.75 }
        QQC2.Slider {
            Layout.fillWidth: true
            from: 0
            to: 100
            value: level.value
            onMoved: level.moved(Math.round(value))
            Accessible.name: level.label
        }
    }

    fullRepresentation: ColumnLayout {
        Layout.preferredWidth: 340
        Layout.minimumWidth: 340
        Layout.maximumWidth: 340
        spacing: 8

        GridLayout {
            Layout.fillWidth: true
            columns: 2
            rowSpacing: 8
            columnSpacing: 8
            Tile {
                iconName: nm.wirelessEnabled ? "wifi" : "wifi-off"
                label: "Wi-Fi"
                sub: !nm.wirelessHwEnabled ? "No Wi-Fi here" : nm.wirelessEnabled ? "On" : "Off"
                on: nm.wirelessEnabled && nm.wirelessHwEnabled
                available: nm.wirelessHwEnabled
                onToggled: root.run("nmcli radio wifi " + (nm.wirelessEnabled ? "off" : "on"))
            }
            Tile {
                iconName: "bluetooth"
                label: "Bluetooth"
                sub: root.btOn ? "On" : "Off"
                on: root.btOn
                onToggled: { root.run("bluetoothctl power " + (root.btOn ? "off" : "on")); root.btOn = !root.btOn; }
            }
            Tile {
                iconName: "moon"
                label: "Do not disturb"
                sub: root.dnd ? "Notifications held" : "Off"
                on: root.dnd
                onToggled: root.setDnd(!root.dnd)
            }
            Tile {
                iconName: "contrast"
                label: "Dark mode"
                sub: root.darkLook ? "On" : "Off"
                on: root.darkLook
                onToggled: root.setDark(!root.darkLook)
            }
        }

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: levels.implicitHeight + 24
            radius: 16
            color: root.surface2
            border.width: 1
            border.color: root.line
            ColumnLayout {
                id: levels
                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 12 }
                spacing: 4
                Level {
                    Layout.fillWidth: true
                    iconName: "sun"; label: "Brightness"; value: root.brightness
                    onMoved: (v) => { root.brightness = v; root.run("qdbus-qt6 org.kde.ScreenBrightness /org/kde/ScreenBrightness/display0 org.kde.ScreenBrightness.Display.SetBrightness " + Math.max(100, v * 100) + " 0"); }
                }
                Level {
                    Layout.fillWidth: true
                    iconName: "volume"; label: "Volume"; value: root.volume
                    onMoved: (v) => { root.volume = v; root.run("wpctl set-volume @DEFAULT_AUDIO_SINK@ " + (v / 100).toFixed(2) + " && wpctl set-mute @DEFAULT_AUDIO_SINK@ 0"); }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: 4
            Layout.leftMargin: 4
            Layout.rightMargin: 4
            Text { text: "Notifications"; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
            Item { Layout.fillWidth: true }
            Text {
                visible: history.count > 0
                text: "Clear all"
                color: root.fg2
                font.family: root.ui
                font.pixelSize: 12
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: history.clear(NotificationManager.Notifications.ClearExpired) }
            }
        }

        Text {
            visible: history.count === 0
            Layout.fillWidth: true
            Layout.topMargin: 12
            Layout.bottomMargin: 12
            horizontalAlignment: Text.AlignHCenter
            text: "You're all caught up"
            color: root.fg3
            font.family: root.ui
            font.pixelSize: 13
        }

        Repeater {
            model: history
            delegate: Rectangle {
                required property var model
                Layout.fillWidth: true
                implicitHeight: note.implicitHeight + 20
                radius: 12
                color: root.surface2
                border.width: 1
                border.color: root.line
                ColumnLayout {
                    id: note
                    anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; leftMargin: 12; rightMargin: 12 }
                    spacing: 1
                    RowLayout {
                        Layout.fillWidth: true
                        Text { Layout.fillWidth: true; text: model.summary || model.applicationName || ""; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.Medium; elide: Text.ElideRight }
                        Text { text: model.applicationName || ""; color: root.fg3; font.family: root.ui; font.pixelSize: 11 }
                    }
                    Text { visible: !!model.body; Layout.fillWidth: true; text: model.body || ""; textFormat: Text.PlainText; color: root.fg2; font.family: root.ui; font.pixelSize: 12; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight }
                }
            }
        }
    }
}
