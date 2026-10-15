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
    // the broker brings this window forward, maybe on a page (S1)
    Connections {
        target: waker
        function onShown(p) { if (p) win.page = p; win.show(); win.raise(); win.requestActivate(); }
    }

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
    component Field: Rectangle {
        property alias text: tf.text
        property alias placeholder: tf.placeholderText
        property alias secret: tf.echoMode
        property alias field: tf
        signal accepted()
        Layout.fillWidth: true
        implicitHeight: 32; radius: 8
        color: Theme.surface; border.width: 1; border.color: tf.activeFocus ? Theme.accent : Theme.line
        QQC2.TextField {
            id: tf
            anchors.fill: parent; anchors.leftMargin: 10
            placeholderTextColor: Theme.fg3; color: Theme.fg; background: null
            font.family: Theme.ui; font.pixelSize: 13
            onAccepted: parent.accepted()
        }
    }
    component PageTitle: ColumnLayout {
        property string title
        property string sub
        spacing: 2
        Layout.fillWidth: true
        Layout.bottomMargin: 8
        Text { text: parent.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 22; font.weight: Font.DemiBold }
        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: parent.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14 }
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

                // Brain: which AI SIOS thinks with. Keys live in the broker, sealed;
                // every change asks for your password (D33, D39)
                ColumnLayout {
                    id: brainPage
                    visible: win.page === "brain"
                    Layout.fillWidth: true
                    spacing: 18
                    readonly property var ai: broker.ai
                    readonly property var providers: ai.providers || []
                    readonly property var active: providers.filter(p => p.active)[0]
                    property string waiting: ""
                    onVisibleChanged: if (visible) broker.refresh()
                    Connections {
                        target: broker
                        function onDone(tag, ok, error) {
                            if (["key", "remove", "consent", "configure", "use", "test"].indexOf(tag) < 0) return;
                            brainPage.waiting = "";
                            if (error) toast.show(error, false, true);
                            else toast.show(tag === "test" ? "Connected: the AI answered." : "Saved.", false, false);
                        }
                    }
                    function ask(method, params, tag) { waiting = tag + ":" + (params.id || ""); broker.request(method, params, tag); }

                    PageTitle { title: "Brain"; sub: "The AI SIOS thinks with. Your keys stay sealed in SIOS's broker; no app or AI ever sees them." }
                    Soon {
                        visible: !broker.reachable
                        text: "SIOS's broker isn't running, so AI settings can't be changed right now."
                    }
                    Card {
                        visible: broker.reachable
                        RowLayout {
                            spacing: 12
                            Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "brain"; size: 17; color: Theme.aiInk } }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { text: brainPage.active ? "SIOS uses " + brainPage.active.label : "No AI connected yet"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                Text {
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                    color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                                    text: (brainPage.active ? "Model " + brainPage.active.model + ". " : "Add a key below, allow it, and choose it. ")
                                          + (brainPage.ai.calls_today || 0) + " of " + (brainPage.ai.max_calls_per_day || 0) + " requests used today. Each change asks for your password."
                                }
                            }
                        }
                    }
                    Repeater {
                        model: broker.reachable ? brainPage.providers : []
                        delegate: Card {
                            id: pc
                            required property var modelData
                            readonly property bool compat: modelData.kind === "compat"
                            readonly property bool busy: brainPage.waiting.endsWith(":" + modelData.id)
                            RowLayout {
                                spacing: 10
                                Text { Layout.fillWidth: true; text: pc.modelData.label; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold; elide: Text.ElideRight }
                                Repeater {
                                    model: [
                                        [pc.modelData.online ? "Online" : "On this computer", Theme.fg2],
                                        [pc.modelData.has_key ? "Key saved" : (pc.modelData.online ? "No key" : "No key needed"), pc.modelData.has_key ? Theme.ok : Theme.fg3],
                                        [pc.modelData.consent ? "Allowed" : "Not allowed", pc.modelData.consent ? Theme.ok : Theme.fg3],
                                    ]
                                    delegate: Rectangle {
                                        required property var modelData
                                        implicitWidth: chip.implicitWidth + 16; implicitHeight: 22; radius: 11
                                        color: Theme.surface2; border.width: 1; border.color: Theme.line
                                        Text { id: chip; anchors.centerIn: parent; text: modelData[0]; color: modelData[1]; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Medium }
                                    }
                                }
                            }
                            RowLayout {
                                spacing: 8
                                Text { text: "Model"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; Layout.preferredWidth: 64 }
                                Field { id: modelField; text: pc.modelData.model; placeholder: "Model name, e.g. from the provider's docs" }
                                Field { id: urlField; visible: pc.compat; text: pc.modelData.base_url; placeholder: "https://... or http://localhost:11434/v1" }
                                Button {
                                    text: "Save"; kind: "plain"
                                    onClicked: {
                                        const p = { id: pc.modelData.id, model: modelField.text };
                                        if (pc.compat) p.base_url = urlField.text;
                                        brainPage.ask("model.configure", p, "configure");
                                    }
                                }
                            }
                            RowLayout {
                                spacing: 8
                                visible: pc.modelData.online || pc.compat
                                Text { text: "Key"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; Layout.preferredWidth: 64 }
                                Field {
                                    id: keyField
                                    secret: TextInput.Password
                                    placeholder: pc.modelData.has_key ? "A key is saved. Paste a new one to replace it." : "Paste your API key"
                                    onAccepted: saveKey.clicked()
                                }
                                Button {
                                    id: saveKey
                                    text: "Save key"
                                    busy: pc.busy && brainPage.waiting.startsWith("key:")
                                    onClicked: {
                                        if (!keyField.text) return;
                                        brainPage.ask("model.set_key", { id: pc.modelData.id, key: keyField.text }, "key");
                                        keyField.text = "";   // the key is gone from this window once sent
                                    }
                                }
                                Button { visible: pc.modelData.has_key; text: "Remove"; kind: "danger"; onClicked: brainPage.ask("model.remove_key", { id: pc.modelData.id }, "remove") }
                            }
                            RowLayout {
                                spacing: 10
                                Toggle {
                                    on: pc.modelData.consent
                                    onToggled: brainPage.ask("model.consent", { id: pc.modelData.id, on: !pc.modelData.consent }, "consent")
                                }
                                Text {
                                    Layout.fillWidth: true; wrapMode: Text.WordWrap
                                    text: pc.modelData.online ? "Allow SIOS to send requests to " + pc.modelData.label + ". Files marked Sensitive are never sent." : "Allow SIOS to use this model."
                                    color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                                }
                                Button { text: "Test"; kind: "plain"; busy: pc.busy && brainPage.waiting.startsWith("test:"); onClicked: brainPage.ask("model.test", { id: pc.modelData.id }, "test") }
                                Button {
                                    text: pc.modelData.active ? "In use" : "Use this one"
                                    kind: pc.modelData.active ? "plain" : "primary"
                                    onClicked: if (!pc.modelData.active) brainPage.ask("model.configure", { id: pc.modelData.id, active: true }, "use")
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

                // Connected AI apps: outside AIs that use this computer through SIOS's
                // door (MCP), each with the roles you give it (M8, D35). Every change
                // asks for your password; a pairing token is shown once.
                ColumnLayout {
                    id: appsPage
                    visible: win.page === "connections"
                    Layout.fillWidth: true
                    spacing: 18
                    property var apps: []
                    property var roles: []
                    property string token: ""
                    property string tokenFor: ""
                    property var picked: ["reader"]
                    function load() { broker.request("iam.apps", {}, "apps"); }
                    onVisibleChanged: if (visible) load()
                    Connections {
                        target: broker
                        function onDone(tag, ok, error) {
                            if (tag === "apps") {
                                if (!error) { appsPage.apps = ok.apps; appsPage.roles = ok.roles; }
                                return;
                            }
                            if (!tag.startsWith("app-")) return;
                            if (error) { toast.show(error, false, true); return; }
                            if (tag === "app-pair") { appsPage.token = ok.token; appsPage.tokenFor = ok.id; }
                            else toast.show("Saved.", false, false);
                            appsPage.load();
                        }
                    }
                    function roleName(id) { const r = roles.filter(x => x.id === id)[0]; return r ? r.name : id; }

                    PageTitle { title: "Connected AI apps"; sub: "Other AIs on this computer (Claude Code, Claude Desktop, ...) that use it through SIOS, with only the roles you give them." }

                    // pair a new app
                    Card {
                        Text { text: "Pair a new app"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        RowLayout {
                            spacing: 8
                            Field { id: appName; placeholder: "App name, e.g. Claude Code" }
                        }
                        Flow {
                            Layout.fillWidth: true
                            spacing: 8
                            Repeater {
                                model: appsPage.roles
                                delegate: Rectangle {
                                    required property var modelData
                                    readonly property bool on: appsPage.picked.indexOf(modelData.id) >= 0
                                    implicitWidth: rl.implicitWidth + 24; implicitHeight: 30; radius: 15
                                    color: on ? Theme.accentSoft : Theme.surface
                                    border.width: 1; border.color: on ? Theme.accent : Theme.line
                                    Text { id: rl; anchors.centerIn: parent; text: modelData.name; color: parent.on ? Theme.accent : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.Medium }
                                    MouseArea {
                                        anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            const p = appsPage.picked.slice(); const i = p.indexOf(modelData.id);
                                            if (i >= 0) p.splice(i, 1); else p.push(modelData.id);
                                            appsPage.picked = p;
                                        }
                                    }
                                    QQC2.ToolTip.visible: hov.hovered
                                    QQC2.ToolTip.text: modelData.about
                                    HoverHandler { id: hov }
                                }
                            }
                        }
                        RowLayout {
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Anything that can't be undone still asks you every time, whatever the roles."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            Button {
                                text: "Pair"
                                onClicked: if (appName.text.trim()) broker.request("iam.pair", { name: appName.text.trim(), roles: appsPage.picked }, "app-pair")
                            }
                        }
                    }

                    // the token, once
                    Card {
                        visible: appsPage.token !== ""
                        Text { text: "Paired " + appsPage.tokenFor + ". Copy this now; it isn't shown again."; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold; Layout.fillWidth: true; wrapMode: Text.WordWrap }
                        Text { text: "For Claude Code, run this in a terminal:"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: cmd.implicitHeight + 20; radius: 8
                            color: Theme.surface2; border.width: 1; border.color: Theme.line
                            TextEdit {
                                id: cmd
                                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 10 }
                                readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere
                                text: "claude mcp add --scope user sios --env SIOS_PAIR_TOKEN=" + appsPage.token + " -- /usr/bin/brain-d mcp"
                                color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12
                            }
                        }
                        Text { text: "Other apps: an MCP server with command /usr/bin/brain-d, argument mcp, and the environment variable SIOS_PAIR_TOKEN set to the token above."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; Layout.fillWidth: true; wrapMode: Text.WordWrap }
                        RowLayout {
                            Item { Layout.fillWidth: true }
                            Button { text: "Copy"; kind: "plain"; onClicked: { cmd.selectAll(); cmd.copy(); cmd.deselect(); toast.show("Copied.", false, false); } }
                            Button { text: "Done"; onClicked: { appsPage.token = ""; appName.text = ""; } }
                        }
                    }

                    Soon {
                        visible: appsPage.apps.length === 0 && broker.reachable
                        text: "No apps paired yet. Unpaired apps can still hand SIOS whole goals (sios_do), which you approve; paired apps can use SIOS's tools directly."
                    }
                    Repeater {
                        model: appsPage.apps
                        delegate: Card {
                            id: ac
                            required property var modelData
                            RowLayout {
                                spacing: 10
                                Rectangle { implicitWidth: 34; implicitHeight: 34; radius: 10; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "plug"; size: 16; color: Theme.aiInk } }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text { text: ac.modelData.name + (ac.modelData.paused ? "  (paused)" : ""); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                    Text {
                                        Layout.fillWidth: true; wrapMode: Text.WordWrap
                                        text: ac.modelData.roles.length ? "Roles: " + ac.modelData.roles.map(r => appsPage.roleName(r)).join(", ") : "No roles: it can only hand SIOS whole goals."
                                        color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                                    }
                                }
                                Button { text: ac.modelData.paused ? "Resume" : "Pause"; kind: "plain"; onClicked: broker.request(ac.modelData.paused ? "resume" : "pause", { principal: ac.modelData.id }, "app-pause") }
                                Button { text: "Use picked roles"; kind: "plain"; onClicked: broker.request("iam.set_roles", { id: ac.modelData.id, roles: appsPage.picked }, "app-roles") }
                                Button { text: "Remove"; kind: "danger"; onClicked: broker.request("iam.remove", { id: ac.modelData.id }, "app-remove") }
                            }
                        }
                    }
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
