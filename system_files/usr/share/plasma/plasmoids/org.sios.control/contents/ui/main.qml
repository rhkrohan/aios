/*
    The SIOS Control Center (owner's pick, 2026-10-14: "C2, pill toggles"): the
    sliders icon in the top bar opens one panel that holds everything the tray
    used to.
      - pill toggles, name and state in each: Network (its chevron opens a page
        of connections to join or leave), Bluetooth, Focus, Dark mode, Night
        light, Airplane mode
      - big sliders with the icon inside: brightness and volume
      - the SIOS row: which AI SIOS thinks with, and requests waiting for you
      - Clipboard (when there's something) and Notifications
    On laptops the top-bar icon also shows the battery level.
    Everything is real: NetworkManager (KDE's PlasmaNM), bluetoothctl, KDE's
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
import org.kde.plasma.private.clipboard as Clipboard
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
    // notifications may carry markup ("<?xml ...><html>Bell in ...</html>"); show plain words
    function plain(t) {
        return String(t || "").replace(/<\?xml[^>]*>/g, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
            .replace(/\s+/g, " ").trim();
    }

    toolTipMainText: "Control Center"
    toolTipSubText: "Wi-Fi, Bluetooth, Do not disturb, Dark mode, brightness and volume"

    compactRepresentation: MouseArea {
        Layout.minimumWidth: compactRow.implicitWidth + 12
        Layout.preferredWidth: compactRow.implicitWidth + 12
        onClicked: root.expanded = !root.expanded
        RowLayout {
            id: compactRow
            anchors.centerIn: parent
            spacing: 6
            Text {
                visible: root.batteryPercent >= 0
                text: root.batteryPercent + "%"
                color: Kirigami.Theme.textColor
                font.family: root.ui
                font.pixelSize: 13
            }
            Kirigami.Icon {
                visible: root.batteryPercent >= 0
                implicitWidth: 18
                implicitHeight: 18
                source: root.icon("battery" + root.ink)
            }
            Kirigami.Icon {
                implicitWidth: 16
                implicitHeight: 16
                source: root.icon("sliders" + root.ink)
            }
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
            else if (source === root.readBattery) { const b = parseInt(out); root.batteryPercent = isNaN(b) ? -1 : b; }
            else if (source === root.readBright) { const v = parseInt(out); if (!isNaN(v)) root.brightness = Math.round(v / 100); }
            else if (source === root.readNight) root.nightOn = out === "true";
            else if (source === root.readSios) {
                try { const v = JSON.parse(out).ok; root.aiName = v.ai || ""; root.waiting = v.pending || 0; root.siosUp = true; }
                catch (e) { root.siosUp = false; }
            }
            disconnectSource(source);
        }
    }
    function run(cmd) { sh.connectSource(cmd); }

    readonly property string readBt: "bluetoothctl show 2>/dev/null | awk '/Powered:/ {print $2; exit}'"
    readonly property string readVol: "wpctl get-volume @DEFAULT_AUDIO_SINK@"
    readonly property string readBattery: "cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -1"
    property int batteryPercent: -1
    Timer { interval: 60000; running: true; repeat: true; triggeredOnStart: true; onTriggered: root.run(root.readBattery) }
    readonly property string readBright: "qdbus-qt6 org.kde.ScreenBrightness /org/kde/ScreenBrightness/display0 org.freedesktop.DBus.Properties.Get org.kde.ScreenBrightness.Display Brightness"
    readonly property string readNight: "kreadconfig6 --file kwinrc --group NightColor --key Active"
    // the broker's public status: the AI in use and how many requests wait (never what)
    readonly property string readSios: "capd status 2>/dev/null"
    function refresh() { run(readBt); run(readVol); run(readBright); run(readNight); run(readSios); }
    property bool nightOn: false
    property bool siosUp: false
    property string aiName: ""
    property int waiting: 0
    function setNight(on) { nightOn = on; run("kwriteconfig6 --file kwinrc --group NightColor --key Active " + on + " && qdbus-qt6 org.kde.KWin /KWin reconfigure"); }
    readonly property bool airplane: PlasmaNM.Configuration.airplaneModeEnabled
    Connections { target: root; function onExpandedChanged() { if (root.expanded) root.refresh(); } }

    property bool btOn: false
    property int volume: 50
    property bool muted: false
    property int brightness: 100

    PlasmaNM.EnabledConnections { id: nm }
    PlasmaNM.AvailableDevices { id: devices }
    PlasmaNM.NetworkStatus { id: netStatus }
    PlasmaNM.Handler { id: nmHandler }
    PlasmaNM.NetworkModel { id: netModel }
    PlasmaNM.AppletProxyModel { id: networks; sourceModel: netModel }
    Timer { interval: 10000; repeat: true; running: root.expanded && root.page === "network"; triggeredOnStart: true; onTriggered: nmHandler.requestScan() }

    // what the Network row says: the first active connection's name
    readonly property string netName: {
        const first = String(netStatus.activeConnections || "").split("\n")[0];
        return first.split(":")[0].trim();
    }
    readonly property bool netUp: netName !== ""
    readonly property bool wifiHere: devices.wirelessDeviceAvailable

    property string page: "home"   // home | network
    onExpandedChanged: if (!expanded) page = "home"

    NotificationManager.Settings { id: notifySettings }
    readonly property bool dnd: notifySettings.notificationsInhibitedUntil > new Date()
    function setDnd(on) {
        notifySettings.notificationsInhibitedUntil = on ? new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000) : new Date(0);
        notifySettings.save();
    }

    readonly property bool darkLook: dark
    function setDark(on) { run("plasma-apply-lookandfeel -a " + (on ? "org.sios.desktop.dark" : "org.sios.desktop")); }

    // KDE's clipboard manager lives here instead of in the tray
    Clipboard.HistoryModel { id: clip }

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
    readonly property color card: dark ? Qt.rgba(1, 1, 1, 0.06) : Qt.rgba(1, 1, 1, 0.78)
    readonly property color cardLine: dark ? Qt.rgba(1, 1, 1, 0.08) : Qt.rgba(0, 0, 0, 0.07)
    readonly property color blue: "#3b74f0"

    // pills: light blue when on (dark ink in dark mode, white ink in light mode)
    readonly property color pillOn: dark ? "#a9c4ff" : "#3b74f0"
    readonly property color pillOnInk: dark ? "#0d1b2e" : "#ffffff"
    readonly property color pillOff: dark ? Qt.rgba(1, 1, 1, 0.07) : Qt.rgba(0, 0, 0, 0.05)
    function onIcon(name) { return root.icon(name + (root.dark ? "" : "-white")); }

    // one quick-settings pill: tap to switch; a chevron when there's a page behind it
    component Pill: Rectangle {
        id: pill
        property string iconName
        property string label
        property string sub
        property bool on
        property bool more: false
        signal toggled()
        signal opened()
        Layout.fillWidth: true
        implicitHeight: 52
        radius: 26
        color: on ? root.pillOn : (pm.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.11) : Qt.rgba(0, 0, 0, 0.08)) : root.pillOff)
        Behavior on color { ColorAnimation { duration: 180 } }
        MouseArea { id: pm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: pill.toggled() }
        RowLayout {
            anchors { fill: parent; leftMargin: 16; rightMargin: pill.more ? 6 : 14 }
            spacing: 10
            Kirigami.Icon { implicitWidth: 18; implicitHeight: 18; source: pill.on ? root.onIcon(pill.iconName) : root.icon(pill.iconName + root.ink) }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Text { Layout.fillWidth: true; text: pill.label; color: pill.on ? root.pillOnInk : root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold; elide: Text.ElideRight }
                Text { Layout.fillWidth: true; text: pill.sub; color: pill.on ? Qt.rgba(root.pillOnInk.r, root.pillOnInk.g, root.pillOnInk.b, 0.7) : root.fg2; font.family: root.ui; font.pixelSize: 11; elide: Text.ElideRight }
            }
            Rectangle {
                visible: pill.more
                implicitWidth: 30; implicitHeight: 30; radius: 15
                color: mm.containsMouse ? (pill.on ? Qt.rgba(0, 0, 0, 0.08) : Qt.rgba(1, 1, 1, 0.08)) : "transparent"
                Kirigami.Icon { anchors.centerIn: parent; width: 14; height: 14; source: pill.on ? root.onIcon("chevron-right") : root.icon("chevron-right" + root.ink); opacity: 0.8 }
                MouseArea { id: mm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: pill.opened() }
            }
        }
        Accessible.role: Accessible.CheckBox
        Accessible.checked: on
        Accessible.name: label
    }

    // a big slider: the whole bar is the track, filled from the left, icon inside
    component BigSlider: Rectangle {
        id: bs
        property string iconName
        property int value
        property string label
        signal moved(int v)
        signal iconClicked()
        Layout.fillWidth: true
        implicitHeight: 44
        radius: 22
        color: root.pillOff
        clip: true
        Rectangle {
            width: Math.max(bs.height, bs.width * bs.value / 100)
            height: parent.height
            radius: 22
            color: root.pillOn
            Behavior on width { enabled: !drag.pressed; NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
        }
        Kirigami.Icon {
            x: 14; anchors.verticalCenter: parent.verticalCenter
            width: 18; height: 18
            source: root.onIcon(bs.iconName)
            MouseArea { anchors.fill: parent; anchors.margins: -6; cursorShape: Qt.PointingHandCursor; onClicked: bs.iconClicked() }
        }
        MouseArea {
            id: drag
            anchors { fill: parent; leftMargin: 44 }
            cursorShape: Qt.PointingHandCursor
            function set(x) { bs.moved(Math.max(0, Math.min(100, Math.round((x + 44) / bs.width * 100)))); }
            onPressed: (e) => set(e.x)
            onPositionChanged: (e) => { if (pressed) set(e.x); }
        }
        Accessible.role: Accessible.Slider
        Accessible.name: label
    }

    // a rounded module, like macOS's control center cards
    component Card: Rectangle {
        default property alias content: inner.data
        property int pad: 12
        Layout.fillWidth: true
        implicitHeight: inner.implicitHeight + pad * 2
        radius: 18
        color: root.card
        border.width: 1
        border.color: root.cardLine
        ColumnLayout { id: inner; anchors { left: parent.left; right: parent.right; top: parent.top; margins: parent.pad } spacing: 8 }
    }

    // a round icon button: blue when on
    component Round: Rectangle {
        id: rnd
        property string iconName
        property bool on
        signal clicked()
        implicitWidth: 30
        implicitHeight: 30
        radius: 15
        color: on ? root.blue : (rm.containsMouse ? root.surface3 : (root.dark ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(0, 0, 0, 0.06)))
        Kirigami.Icon { anchors.centerIn: parent; width: 15; height: 15; source: root.icon(rnd.iconName + (rnd.on ? "-white" : root.ink)) }
        MouseArea { id: rm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: rnd.clicked() }
    }

    // one row in the connectivity card: round toggle, name and status, a chevron to more
    component ConnRow: Item {
        id: cr
        property string iconName
        property string label
        property string sub
        property bool on
        property bool more: true
        signal toggled()
        signal opened()
        Layout.fillWidth: true
        implicitHeight: 40
        Rectangle { anchors.fill: parent; anchors.margins: -4; radius: 12; color: crm.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.05) : Qt.rgba(0, 0, 0, 0.04)) : "transparent" }
        MouseArea { id: crm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: cr.opened() }
        RowLayout {
            anchors.fill: parent
            spacing: 10
            Round { iconName: cr.iconName; on: cr.on; onClicked: cr.toggled() }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Text { Layout.fillWidth: true; text: cr.label; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold; elide: Text.ElideRight }
                Text { Layout.fillWidth: true; text: cr.sub; color: root.fg2; font.family: root.ui; font.pixelSize: 12; elide: Text.ElideRight }
            }
            Kirigami.Icon { visible: cr.more; width: 14; height: 14; Layout.preferredWidth: 14; Layout.preferredHeight: 14; source: root.icon("chevron-right" + root.ink); opacity: 0.5 }
        }
        Accessible.role: Accessible.Button
        Accessible.name: label + ", " + sub
    }

    // a square tile: icon on top, name below (Focus, Dark mode)
    component Square: Rectangle {
        id: sq
        property string iconName
        property string label
        property string sub
        property bool on
        signal toggled()
        Layout.fillWidth: true
        Layout.fillHeight: true
        radius: 18
        color: sqm.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.09) : "#ffffff") : root.card
        border.width: 1
        border.color: root.cardLine
        ColumnLayout {
            anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 12 }
            spacing: 6
            Round { iconName: sq.iconName; on: sq.on; onClicked: sq.toggled() }
            Text { Layout.fillWidth: true; text: sq.label; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold; elide: Text.ElideRight }
            Text { Layout.fillWidth: true; text: sq.sub; color: root.fg2; font.family: root.ui; font.pixelSize: 11; elide: Text.ElideRight }
        }
        MouseArea { id: sqm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: sq.toggled() }
        Accessible.role: Accessible.CheckBox
        Accessible.checked: on
        Accessible.name: label
    }

    // a titled slider card (Display, Sound), like macOS
    component LevelCard: Card {
        id: lc
        property string title
        property string iconName
        property int value
        signal moved(int v)
        signal iconClicked()
        Text { text: lc.title; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
        RowLayout {
            Layout.fillWidth: true
            spacing: 10
            Kirigami.Icon {
                width: 16; height: 16; Layout.preferredWidth: 16; Layout.preferredHeight: 16
                source: root.icon(lc.iconName + root.ink); opacity: 0.75
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: lc.iconClicked() }
            }
            QQC2.Slider {
                Layout.fillWidth: true
                from: 0; to: 100
                value: lc.value
                onMoved: lc.moved(Math.round(value))
                Accessible.name: lc.title
            }
        }
    }

    component SectionHead: RowLayout {
        id: sh2
        property string title
        property string action
        signal acted()
        Layout.fillWidth: true
        Text { text: sh2.title; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
        Item { Layout.fillWidth: true }
        Text {
            visible: sh2.action !== ""
            text: sh2.action
            color: root.fg2
            font.family: root.ui
            font.pixelSize: 12
            MouseArea { anchors.fill: parent; anchors.margins: -4; cursorShape: Qt.PointingHandCursor; onClicked: sh2.acted() }
        }
    }

    fullRepresentation: Item {
        Layout.preferredWidth: 360
        Layout.minimumWidth: 360
        Layout.maximumWidth: 360
        Layout.preferredHeight: (root.page === "home" ? home.implicitHeight : netPage.implicitHeight) + 8
        Layout.minimumHeight: Layout.preferredHeight

        // ---------------- home
        ColumnLayout {
            id: home
            visible: root.page === "home"
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 4 }
            spacing: 10

            // quick settings, two to a row
            GridLayout {
                Layout.fillWidth: true
                columns: 2
                columnSpacing: 8
                rowSpacing: 8
                Pill {
                    iconName: root.wifiHere ? (nm.wirelessEnabled ? "wifi" : "wifi-off") : "ethernet-port"
                    label: root.wifiHere ? "Wi-Fi" : "Network"
                    sub: root.netUp ? root.netName : (root.wifiHere && !nm.wirelessEnabled ? "Off" : "Not connected")
                    on: root.netUp && (!root.wifiHere || nm.wirelessEnabled)
                    more: true
                    onToggled: if (root.wifiHere) nmHandler.enableWireless(!nm.wirelessEnabled); else root.page = "network"
                    onOpened: root.page = "network"
                }
                Pill {
                    iconName: "bluetooth"
                    label: "Bluetooth"
                    sub: root.btOn ? "On" : "Off"
                    on: root.btOn
                    more: true
                    onToggled: { root.run("bluetoothctl power " + (root.btOn ? "off" : "on")); root.btOn = !root.btOn; }
                    onOpened: { root.run("systemsettings kcm_bluetooth"); root.expanded = false; }
                }
                Pill {
                    iconName: "moon"
                    label: "Focus"
                    sub: root.dnd ? "Do not disturb" : "Off"
                    on: root.dnd
                    onToggled: root.setDnd(!root.dnd)
                }
                Pill {
                    iconName: "contrast"
                    label: "Dark mode"
                    sub: root.darkLook ? "On" : "Off"
                    on: root.darkLook
                    onToggled: root.setDark(!root.darkLook)
                }
                Pill {
                    iconName: "sun-moon"
                    label: "Night light"
                    sub: root.nightOn ? "On" : "Off"
                    on: root.nightOn
                    onToggled: root.setNight(!root.nightOn)
                }
                Pill {
                    iconName: "plane"
                    label: "Airplane"
                    sub: root.airplane ? "On" : "Off"
                    on: root.airplane
                    onToggled: nmHandler.enableAirplaneMode(!root.airplane)
                }
            }

            BigSlider {
                label: "Brightness"
                iconName: "sun"
                value: root.brightness
                onMoved: (v) => { root.brightness = v; root.run("qdbus-qt6 org.kde.ScreenBrightness /org/kde/ScreenBrightness/display0 org.kde.ScreenBrightness.Display.SetBrightness " + Math.max(100, v * 100) + " 0"); }
            }
            BigSlider {
                label: "Volume"
                iconName: root.muted || root.volume === 0 ? "volume-x" : "volume"
                value: root.muted ? 0 : root.volume
                onMoved: (v) => { root.volume = v; root.muted = false; root.run("wpctl set-volume @DEFAULT_AUDIO_SINK@ " + (v / 100).toFixed(2) + " && wpctl set-mute @DEFAULT_AUDIO_SINK@ 0"); }
                onIconClicked: { root.muted = !root.muted; root.run("wpctl set-mute @DEFAULT_AUDIO_SINK@ " + (root.muted ? 1 : 0)); }
            }

            // SIOS: the AI it thinks with, and requests waiting for you
            Rectangle {
                visible: root.siosUp
                Layout.fillWidth: true
                implicitHeight: 54
                radius: 16
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0; color: Qt.rgba(111 / 255, 124 / 255, 1, root.dark ? 0.22 : 0.16) }
                    GradientStop { position: 1; color: Qt.rgba(111 / 255, 124 / 255, 1, 0.05) }
                }
                border.width: 1
                border.color: Qt.rgba(140 / 255, 150 / 255, 1, 0.25)
                RowLayout {
                    anchors { fill: parent; leftMargin: 8; rightMargin: 10 }
                    spacing: 10
                    Orb { implicitWidth: 38; implicitHeight: 38; width: 38; height: 38; strands: 14; lively: sr.containsMouse }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Text { text: "SIOS"; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                        Text {
                            Layout.fillWidth: true
                            elide: Text.ElideRight
                            text: (root.aiName ? root.aiName + " connected" : "No AI connected yet") + (root.waiting > 0 ? " · " + root.waiting + (root.waiting === 1 ? " request waiting" : " requests waiting") : "")
                            color: root.fg2; font.family: root.ui; font.pixelSize: 12
                        }
                    }
                    Rectangle {
                        implicitWidth: btn.implicitWidth + 20; implicitHeight: 28; radius: 9
                        color: root.blue
                        Text { id: btn; anchors.centerIn: parent; text: root.waiting > 0 ? "Review" : (root.aiName ? "Brain" : "Set up"); color: "white"; font.family: root.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                        MouseArea {
                            id: sr
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: { root.run(root.waiting > 0 ? "capd window approve" : "sios-settings --page brain"); root.expanded = false; }
                        }
                    }
                }
            }

            // clipboard: only when there's something
            Card {
                visible: clipList.count > 0
                SectionHead { title: "Clipboard"; action: "Clear"; onActed: clip.clearHistory() }
                Repeater {
                    id: clipList
                    model: clip
                    delegate: Rectangle {
                        required property var model
                        required property int index
                        visible: index < 3
                        Layout.fillWidth: true
                        implicitHeight: visible ? 32 : 0
                        radius: 9
                        color: cm.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.06) : Qt.rgba(0, 0, 0, 0.04)) : "transparent"
                        RowLayout {
                            anchors { fill: parent; leftMargin: 8; rightMargin: 8 }
                            spacing: 8
                            Kirigami.Icon { width: 14; height: 14; Layout.preferredWidth: 14; Layout.preferredHeight: 14; source: root.icon((index === 0 ? "check" : "clipboard") + root.ink); opacity: 0.6 }
                            Text {
                                Layout.fillWidth: true
                                text: String(model.display || "").replace(/\s+/g, " ").trim()
                                elide: Text.ElideRight
                                textFormat: Text.PlainText
                                color: root.fg
                                font.family: root.ui
                                font.pixelSize: 12
                            }
                        }
                        MouseArea { id: cm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: clip.moveToTop(model.uuid) }
                    }
                }
            }

            // notifications
            Card {
                SectionHead { title: "Notifications"; action: noteList.count > 0 ? "Clear all" : ""; onActed: history.clear(NotificationManager.Notifications.ClearExpired) }
                Text {
                    visible: noteList.count === 0
                    Layout.fillWidth: true
                    Layout.topMargin: 6
                    Layout.bottomMargin: 6
                    horizontalAlignment: Text.AlignHCenter
                    text: "You're all caught up"
                    color: root.fg3
                    font.family: root.ui
                    font.pixelSize: 12
                }
                Repeater {
                    id: noteList
                    model: history
                    delegate: RowLayout {
                        required property var model
                        required property int index
                        visible: index < 4
                        Layout.fillWidth: true
                        spacing: 10
                        Kirigami.Icon {
                            Layout.alignment: Qt.AlignTop
                            Layout.topMargin: 2
                            width: 22; height: 22; Layout.preferredWidth: 22; Layout.preferredHeight: 22
                            source: model.applicationIconName || "preferences-desktop-notification-bell"
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 1
                            RowLayout {
                                Layout.fillWidth: true
                                Text { Layout.fillWidth: true; text: root.plain(model.summary || model.applicationName); color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: Font.Medium; elide: Text.ElideRight }
                                Text { text: model.applicationName || ""; color: root.fg3; font.family: root.ui; font.pixelSize: 11 }
                            }
                            Text { visible: text !== ""; Layout.fillWidth: true; text: root.plain(model.body); textFormat: Text.PlainText; color: root.fg2; font.family: root.ui; font.pixelSize: 12; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight }
                        }
                    }
                }
            }

            // to the full settings
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 6
                Layout.rightMargin: 6
                Layout.bottomMargin: 2
                Text {
                    text: "Settings…"
                    color: root.fg2
                    font.family: root.ui
                    font.pixelSize: 12
                    MouseArea { anchors.fill: parent; anchors.margins: -4; cursorShape: Qt.PointingHandCursor; onClicked: { root.run("sios-settings || systemsettings"); root.expanded = false; } }
                }
                Item { Layout.fillWidth: true }
            }
        }

        // ---------------- network
        ColumnLayout {
            id: netPage
            visible: root.page === "network"
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 4 }
            spacing: 10

            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Rectangle {
                    implicitWidth: 28; implicitHeight: 28; radius: 14
                    color: backm.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(0, 0, 0, 0.06)) : "transparent"
                    Kirigami.Icon { anchors.centerIn: parent; width: 16; height: 16; source: root.icon("chevron-left" + root.ink) }
                    MouseArea { id: backm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.page = "home" }
                    Accessible.role: Accessible.Button
                    Accessible.name: "Back"
                }
                Text { Layout.fillWidth: true; text: root.wifiHere ? "Wi-Fi" : "Network"; color: root.fg; font.family: root.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                QQC2.Switch {
                    visible: root.wifiHere
                    checked: nm.wirelessEnabled
                    onToggled: nmHandler.enableWireless(checked)
                    Accessible.name: "Wi-Fi"
                }
            }

            Card {
                pad: 8
                Text {
                    visible: netList.count === 0
                    Layout.fillWidth: true
                    Layout.margins: 10
                    horizontalAlignment: Text.AlignHCenter
                    text: root.wifiHere && !nm.wirelessEnabled ? "Wi-Fi is off" : "Looking for networks…"
                    color: root.fg3
                    font.family: root.ui
                    font.pixelSize: 12
                }
                Repeater {
                    id: netList
                    model: networks
                    delegate: ColumnLayout {
                        id: net
                        required property var model
                        required property int index
                        readonly property bool connected: model.ConnectionState === PlasmaNM.Enums.Activated
                        readonly property bool busy: model.ConnectionState === PlasmaNM.Enums.Activating || model.ConnectionState === PlasmaNM.Enums.Deactivating
                        readonly property bool secure: model.SecurityType !== PlasmaNM.Enums.NoneSecurity && model.SecurityType !== undefined && model.Type === PlasmaNM.Enums.Wireless
                        property bool askPassword: false
                        visible: index < 8
                        Layout.fillWidth: true
                        spacing: 4
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 40
                            radius: 10
                            color: nm2.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.06) : Qt.rgba(0, 0, 0, 0.04)) : "transparent"
                            RowLayout {
                                anchors { fill: parent; leftMargin: 8; rightMargin: 8 }
                                spacing: 10
                                Rectangle {
                                    implicitWidth: 26; implicitHeight: 26; radius: 13
                                    color: net.connected ? root.blue : (root.dark ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(0, 0, 0, 0.06))
                                    Kirigami.Icon {
                                        anchors.centerIn: parent; width: 14; height: 14
                                        source: root.icon((net.model.Type === PlasmaNM.Enums.Wireless ? "wifi" : "ethernet-port") + (net.connected ? "-white" : root.ink))
                                    }
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 0
                                    Text { Layout.fillWidth: true; text: net.model.ItemUniqueName || ""; color: root.fg; font.family: root.ui; font.pixelSize: 13; font.weight: net.connected ? Font.DemiBold : Font.Normal; elide: Text.ElideRight }
                                    Text {
                                        Layout.fillWidth: true
                                        text: net.busy ? "Connecting…" : net.connected ? "Connected" : net.model.Uuid ? "Saved" : (net.secure ? "Needs a password" : "Open")
                                        color: root.fg2; font.family: root.ui; font.pixelSize: 11; elide: Text.ElideRight
                                    }
                                }
                                Kirigami.Icon { visible: net.secure; width: 13; height: 13; Layout.preferredWidth: 13; Layout.preferredHeight: 13; source: root.icon("lock" + root.ink); opacity: 0.5 }
                                Text { text: net.connected ? "Disconnect" : "Connect"; visible: nm2.containsMouse; color: root.blue; font.family: root.ui; font.pixelSize: 12; font.weight: Font.Medium }
                            }
                            MouseArea {
                                id: nm2
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    const m = net.model;
                                    if (net.connected || net.busy) nmHandler.deactivateConnection(m.ConnectionPath, m.DevicePath);
                                    else if (m.Uuid) nmHandler.activateConnection(m.ConnectionPath, m.DevicePath, m.SpecificPath);
                                    else if (net.secure) { net.askPassword = true; pw.forceActiveFocus(); }
                                    else nmHandler.addAndActivateConnection(m.DevicePath, m.SpecificPath);
                                }
                            }
                        }
                        // a new secured network: ask for its password right here
                        RowLayout {
                            visible: net.askPassword
                            Layout.fillWidth: true
                            Layout.leftMargin: 44
                            Layout.rightMargin: 8
                            Layout.bottomMargin: 4
                            spacing: 6
                            QQC2.TextField {
                                id: pw
                                Layout.fillWidth: true
                                echoMode: TextInput.Password
                                placeholderText: "Password"
                                onAccepted: join.clicked()
                                Keys.onEscapePressed: net.askPassword = false
                            }
                            QQC2.Button {
                                id: join
                                text: "Join"
                                enabled: pw.text.length > 0
                                onClicked: { nmHandler.addAndActivateConnection(net.model.DevicePath, net.model.SpecificPath, pw.text); pw.text = ""; net.askPassword = false; }
                            }
                        }
                    }
                }
            }

            Text {
                Layout.leftMargin: 6
                Layout.bottomMargin: 2
                text: "Network settings…"
                color: root.fg2
                font.family: root.ui
                font.pixelSize: 12
                MouseArea { anchors.fill: parent; anchors.margins: -4; cursorShape: Qt.PointingHandCursor; onClicked: { root.run("sios-settings --page wifi || systemsettings kcm_networkmanagement"); root.expanded = false; } }
            }
        }
    }
}
