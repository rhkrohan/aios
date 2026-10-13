// SIOS Settings, the preview's Settings (SettingsApp.tsx) on the real machine.
//   Assistant: Brain, Permissions, Connected AI apps (they configure brain-d
//              and capd, so they arrive with the assistant, Stage B)
//   This computer: Appearance, Wi-Fi, Updates, About (real now)
//   More: KDE's System Settings pages (display, sound, Bluetooth, ...)
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 1080
    height: 740
    minimumWidth: 780
    minimumHeight: 520
    visible: true
    title: "Settings"
    color: Theme.surface

    property string page: startPage || "appearance"

    Connections { target: system; function onMessage(text, error) { toast.show(text, false, error); } }

    component NavItem: Rectangle {
        id: nav
        property string icon
        property string label
        property string key
        property string kcm: ""
        Layout.fillWidth: true
        implicitHeight: 40
        radius: 10
        readonly property bool on: win.page === key
        color: on ? Theme.aiSoft : (m.containsMouse ? Theme.surface3 : "transparent")
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 12
            Icon { name: nav.icon; size: 16; color: nav.on ? Theme.aiInk : Theme.fg2 }
            Text { Layout.fillWidth: true; text: nav.label; color: nav.on ? Theme.aiInk : Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: nav.on ? Font.Medium : Font.Normal }
            Icon { visible: nav.kcm !== ""; name: "external-link"; size: 13; color: Theme.fg3 }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: nav.kcm ? system.openKdePage(nav.kcm) : (win.page = nav.key) }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }
    component Header: Text { color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold; Layout.leftMargin: 12; Layout.topMargin: 18; Layout.bottomMargin: 4 }

    component Card: Rectangle {
        default property alias content: inner.data
        Layout.fillWidth: true
        implicitHeight: inner.implicitHeight + 48
        radius: 16
        color: Theme.surface
        border.width: 1
        border.color: Theme.line
        ColumnLayout { id: inner; anchors { left: parent.left; right: parent.right; top: parent.top; margins: 24 } spacing: 14 }
    }
    component Toggle: Rectangle {
        id: tg
        property bool on
        signal toggled()
        implicitWidth: 44; implicitHeight: 26; radius: 13
        color: on ? Theme.accent : Theme.lineStrong
        Rectangle { width: 20; height: 20; radius: 10; y: 3; x: tg.on ? 21 : 3; color: "white"; Behavior on x { NumberAnimation { duration: 140 } } }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: tg.toggled() }
        Accessible.role: Accessible.CheckBox
        Accessible.checked: on
    }
    component PageTitle: ColumnLayout {
        property string title
        property string sub
        spacing: 2
        Layout.bottomMargin: 8
        Text { text: parent.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 22; font.weight: Font.DemiBold }
        Text { text: parent.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14 }
    }
    component Soon: Rectangle {
        property string text
        Layout.fillWidth: true
        implicitHeight: soonText.implicitHeight + 24
        radius: 14
        color: Theme.aiSoft
        border.width: 1
        border.color: Qt.rgba(Theme.ai.r, Theme.ai.g, Theme.ai.b, 0.25)
        RowLayout {
            anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 18 }
            spacing: 12
            Icon { name: "sparkles"; size: 16; color: Theme.aiInk }
            Text { id: soonText; Layout.fillWidth: true; text: parent.parent.text; wrapMode: Text.WordWrap; color: Theme.aiInk; font.family: Theme.ui; font.pixelSize: 13 }
        }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ---- sidebar
        Rectangle {
            Layout.fillHeight: true
            implicitWidth: 232
            color: Theme.surface2
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }
            QQC2.ScrollView {
                anchors.fill: parent
                anchors.margins: 12
                ColumnLayout {
                    width: 212
                    spacing: 2
                    Header { text: "Assistant"; Layout.topMargin: 4 }
                    NavItem { icon: "brain"; label: "Brain"; key: "brain" }
                    NavItem { icon: "shield-check"; label: "Permissions"; key: "permissions" }
                    NavItem { icon: "plug"; label: "Connected AI apps"; key: "connections" }
                    Header { text: "This computer" }
                    NavItem { icon: "palette"; label: "Appearance"; key: "appearance" }
                    NavItem { icon: "wifi"; label: "Wi-Fi"; key: "wifi" }
                    NavItem { icon: "refresh-cw"; label: "Updates"; key: "updates" }
                    NavItem { icon: "info"; label: "About"; key: "about" }
                    Header { text: "More" }
                    NavItem { icon: "monitor"; label: "Display"; kcm: "kcm_kscreen" }
                    NavItem { icon: "volume-2"; label: "Sound"; kcm: "kcm_pulseaudio" }
                    NavItem { icon: "bluetooth"; label: "Bluetooth"; kcm: "kcm_bluetooth" }
                    NavItem { icon: "bell"; label: "Notifications"; kcm: "kcm_notifications" }
                    NavItem { icon: "users"; label: "Users"; kcm: "kcm_users" }
                    NavItem { icon: "clock"; label: "Date & time"; kcm: "kcm_clock" }
                    NavItem { icon: "keyboard"; label: "Keyboard"; kcm: "kcm_keyboard" }
                    NavItem { icon: "mouse"; label: "Mouse & touchpad"; kcm: "kcm_mouse" }
                    NavItem { icon: "battery"; label: "Power"; kcm: "kcm_powerdevilprofilesconfig" }
                    NavItem { icon: "printer"; label: "Printers"; kcm: "kcm_printer_manager" }
                    NavItem { icon: "accessibility"; label: "Accessibility"; kcm: "kcm_access" }
                }
            }
        }

        // ---- pages
        Flickable {
            id: body
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentHeight: pages.height + 60
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            QQC2.ScrollBar.vertical: QQC2.ScrollBar {}

            ColumnLayout {
                id: pages
                x: Math.max(40, (body.width - 680) / 2)
                y: 40
                width: Math.min(680, body.width - 80)
                spacing: 18

                // Brain (Stage B)
                ColumnLayout {
                    visible: win.page === "brain"
                    Layout.fillWidth: true
                    spacing: 18
                    PageTitle { title: "Brain"; sub: "Where SIOS thinks, and what it may share." }
                    Soon { text: "These settings arrive with the assistant, which runs on this computer in the next stage." }
                    Repeater {
                        model: [["cpu", "On this computer", "Handles everyday tasks. Private, and works without internet."], ["cloud", "Online AI for hard tasks", "Long writing, research and complex plans: Claude, ChatGPT or Gemini, or none."], ["lock", "What online AI may see", "Nothing personal, only what the task needs, or full context. Personal details are swapped for placeholders and put back on this computer."]]
                        delegate: Card {
                            required property var modelData
                            opacity: 0.6
                            RowLayout {
                                spacing: 12
                                Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: modelData[0]; size: 17; color: Theme.accent } }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text { text: modelData[1]; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                    Text { Layout.fillWidth: true; text: modelData[2]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; wrapMode: Text.WordWrap }
                                }
                            }
                        }
                    }
                }

                // Permissions (Stage B)
                ColumnLayout {
                    visible: win.page === "permissions"
                    Layout.fillWidth: true
                    spacing: 18
                    PageTitle { title: "Permissions"; sub: "What the assistant and connected apps may do without asking." }
                    Soon { text: "Every action the assistant takes passes the permission broker. Your standing rules and what you've allowed for a session show here once it runs." }
                }

                // Connected AI apps (Stage B)
                ColumnLayout {
                    visible: win.page === "connections"
                    Layout.fillWidth: true
                    spacing: 18
                    PageTitle { title: "Connected AI apps"; sub: "Other AIs that can use this computer through SIOS." }
                    Soon { text: "Apps like Claude Desktop connect through SIOS's door (MCP) and get only the roles you give them. They show here once the assistant runs." }
                }

                // Appearance (real)
                ColumnLayout {
                    visible: win.page === "appearance"
                    Layout.fillWidth: true
                    spacing: 14
                    PageTitle { title: "Appearance"; sub: "Light or dark, and what's behind your windows." }
                    Card {
                        Text { text: "Look"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        RowLayout {
                            spacing: 12
                            Repeater {
                                model: [[false, "Light", "sun"], [true, "Dark", "moon"]]
                                delegate: Rectangle {
                                    required property var modelData
                                    readonly property bool on: system.dark === modelData[0]
                                    Layout.fillWidth: true
                                    implicitHeight: 112
                                    radius: 14
                                    color: modelData[0] ? "#1e2023" : "#f7f7f5"
                                    border.width: on ? 2 : 1
                                    border.color: on ? Theme.ai : Theme.line
                                    Column {
                                        anchors.centerIn: parent
                                        spacing: 8
                                        Icon { anchors.horizontalCenter: parent.horizontalCenter; name: modelData[2]; size: 22; color: modelData[0] ? "#ececea" : "#1d1d1f" }
                                        Text { anchors.horizontalCenter: parent.horizontalCenter; text: modelData[1]; color: modelData[0] ? "#ececea" : "#1d1d1f"; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.Medium }
                                    }
                                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: system.setDark(modelData[0]) }
                                }
                            }
                        }
                    }
                    Card {
                        Text { text: "Wallpaper"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        RowLayout {
                            spacing: 12
                            Repeater {
                                model: system.wallpapers
                                delegate: ColumnLayout {
                                    required property var modelData
                                    Layout.fillWidth: true
                                    Layout.preferredWidth: 1
                                    spacing: 6
                                    Rectangle {
                                        Layout.fillWidth: true
                                        Layout.preferredHeight: width * 0.62
                                        radius: 12
                                        color: Theme.surface2
                                        border.width: system.wallpaper === modelData.id ? 2 : 1
                                        border.color: system.wallpaper === modelData.id ? Theme.ai : Theme.line
                                        clip: true
                                        Image { anchors.fill: parent; anchors.margins: 2; source: modelData.preview; fillMode: Image.PreserveAspectCrop; asynchronous: true; sourceSize.width: 400 }
                                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: system.setWallpaper(modelData.id) }
                                    }
                                    Text { text: modelData.name; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                                }
                            }
                        }
                    }
                }

                // Wi-Fi (real)
                ColumnLayout {
                    visible: win.page === "wifi"
                    Layout.fillWidth: true
                    spacing: 18
                    PageTitle { title: "Wi-Fi"; sub: system.wired ? "Connected by cable (" + system.wired + ")" : "Networks around you." }
                    Card {
                        RowLayout {
                            Icon { name: system.wifiEnabled ? "wifi" : "wifi-off"; size: 18; color: Theme.fg2 }
                            Text { Layout.fillWidth: true; text: system.wifiHardware ? "Wi-Fi" : "No Wi-Fi on this computer"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                            Toggle { visible: system.wifiHardware; on: system.wifiEnabled; onToggled: system.setWifi(!system.wifiEnabled) }
                        }
                    }
                    Card {
                        visible: system.wifiHardware && system.wifiEnabled
                        RowLayout {
                            Text { Layout.fillWidth: true; text: "Networks"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                            Text { text: "Look again"; color: Theme.accent; font.family: Theme.ui; font.pixelSize: 12; MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: system.scanWifi() } }
                        }
                        Text { visible: system.networks.length === 0; text: "Looking for networks…"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                        Repeater {
                            model: system.networks
                            delegate: Rectangle {
                                id: net
                                required property var modelData
                                property bool asking: false
                                Layout.fillWidth: true
                                implicitHeight: asking ? 92 : 44
                                radius: 10
                                color: nm.containsMouse || asking ? Theme.surface2 : "transparent"
                                MouseArea { id: nm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: if (!net.modelData.connected) { if (net.modelData.secure) net.asking = true; else system.connectWifi(net.modelData.ssid, ""); } }
                                ColumnLayout {
                                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 10 }
                                    spacing: 8
                                    RowLayout {
                                        spacing: 10
                                        Icon { name: "wifi"; size: 16; color: net.modelData.signal > 60 ? Theme.fg : Theme.fg3 }
                                        Text { Layout.fillWidth: true; text: net.modelData.ssid; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: net.modelData.connected ? Font.DemiBold : Font.Normal }
                                        Icon { visible: net.modelData.secure; name: "lock"; size: 13; color: Theme.fg3 }
                                        Text { visible: net.modelData.connected; text: "Connected"; color: Theme.ok; font.family: Theme.ui; font.pixelSize: 12 }
                                    }
                                    RowLayout {
                                        visible: net.asking
                                        spacing: 8
                                        Rectangle {
                                            Layout.fillWidth: true
                                            implicitHeight: 32
                                            radius: 8
                                            color: Theme.surface
                                            border.width: 1
                                            border.color: Theme.accentLine
                                            QQC2.TextField {
                                                id: pw
                                                anchors.fill: parent
                                                anchors.leftMargin: 10
                                                echoMode: TextInput.Password
                                                placeholderText: "Password"
                                                placeholderTextColor: Theme.fg3
                                                color: Theme.fg
                                                background: null
                                                font.family: Theme.ui
                                                font.pixelSize: 13
                                                onVisibleChanged: if (visible) forceActiveFocus()
                                                onAccepted: { system.connectWifi(net.modelData.ssid, text); net.asking = false; text = ""; }
                                                Keys.onEscapePressed: net.asking = false
                                            }
                                        }
                                        Button { text: "Join"; onClicked: { system.connectWifi(net.modelData.ssid, pw.text); net.asking = false; pw.text = ""; } }
                                    }
                                }
                            }
                        }
                    }
                }

                // Updates (real)
                ColumnLayout {
                    visible: win.page === "updates"
                    Layout.fillWidth: true
                    spacing: 18
                    PageTitle { title: "Updates"; sub: "SIOS updates as a whole, and you can always go back." }
                    Card {
                        RowLayout {
                            spacing: 14
                            Image { source: "image://theme/sios-logo"; sourceSize: Qt.size(96, 96); Layout.preferredWidth: 48; Layout.preferredHeight: 48 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text {
                                    text: ({ checking: "Checking for updates…", current: "SIOS is up to date", available: "An update is ready to download", installing: "Downloading and installing…", ready: "Restart to finish updating" })[system.update.state || ""] || ("SIOS " + (system.update.version || ""))
                                    color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold
                                }
                                Text { text: "Version " + (system.update.version || "?") + (system.update.built ? ", built " + system.update.built : ""); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                                Text { visible: !!system.update.staged; text: "Waiting for a restart: " + (system.update.staged || ""); color: Theme.accent; font.family: Theme.ui; font.pixelSize: 12 }
                                Text { visible: !!system.update.checked; text: "Last checked at " + (system.update.checked || ""); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            }
                            Button {
                                readonly property string st: system.update.state || ""
                                text: st === "available" ? "Install" : st === "ready" || system.update.staged ? "Restart" : "Check now"
                                busy: st === "checking" || st === "installing"
                                onClicked: st === "available" ? system.installUpdate() : (st === "ready" || system.update.staged) ? system.restart() : system.checkForUpdate()
                            }
                        }
                    }
                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: "Updates download in the background and take effect when you restart. If anything goes wrong, pick the previous version in the menu while the computer starts. Checking and installing ask for your password."
                        color: Theme.fg3
                        font.family: Theme.ui
                        font.pixelSize: 12
                    }
                }

                // About (real)
                ColumnLayout {
                    visible: win.page === "about"
                    Layout.fillWidth: true
                    spacing: 16
                    Image { Layout.alignment: Qt.AlignHCenter; source: "image://theme/sios-logo"; sourceSize: Qt.size(240, 240); Layout.preferredWidth: 120; Layout.preferredHeight: 120 }
                    Text { Layout.alignment: Qt.AlignHCenter; text: "SIOS"; color: Theme.fg; font.family: Theme.display; font.weight: Font.Light; font.pixelSize: 28; font.letterSpacing: 8 }
                    Text { Layout.alignment: Qt.AlignHCenter; text: "A more human operating system"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                    Card {
                        Repeater {
                            model: [["Version", system.about.version], ["This computer", system.about.device], ["Processor", system.about.cpu + " (" + system.about.cores + " cores)"], ["Memory", system.about.memory], ["Storage", system.about.storage + " (" + system.about.free + " free)"], ["Based on", (system.about.pretty || "").replace(/^SIOS ?\(?/, "").replace(/\)$/, "")], ["Kernel", system.about.kernel]]
                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                Text { text: modelData[0]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; Layout.preferredWidth: 140 }
                                Text { Layout.fillWidth: true; text: modelData[1] || ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; elide: Text.ElideRight }
                            }
                        }
                    }
                }
            }
        }
    }

    Toast { id: toast }
}
