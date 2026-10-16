// SIOS Settings in Daylight (D85), every setting native (no KDE pages, owner 2026-10-16).
//   Assistant: Brain, Permissions, Connectors, Connected AI apps (the broker)
//   This computer: Appearance, Display, Sound, Wi-Fi, Bluetooth, Notifications,
//                  Power, Keyboard, Mouse & touchpad, Printers
//   You: your account, date & time, accessibility.  System: updates, about.
// Each area of the computer is a page file (DisplayPage.qml...) over its own
// backend (display.cpp...), both built on area.h.
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

    Connections {
        target: system
        function onMessage(text, error) {
            if (error) alert.open({ heading: "That didn't work", body: win.sentence(text) });
            else notices.add(text, "");
        }
    }

    // what you typed in the side list's search
    property string q: ""

    // Errors open a window (Alert); small news goes to the corner (Notices).
    // opts: {logo, name, retry}
    function failed(heading, error, opts) {
        const o = opts || {};
        const e = String(error || "");
        if (e === "not confirmed: the owner's password wasn't given") {
            notices.add(heading, "You closed the password window. Nothing changed.", { logo: o.logo, error: true });
            return;
        }
        const said = /the service said no \(its own words, untrusted\): ([\s\S]*)$/.exec(e);
        if (said) {
            let words = said[1];
            try { words = JSON.parse(words); } catch (err) {}
            const who = o.name || "The service";
            alert.open({
                kind: "service", logo: o.logo, heading: who + " said no", sub: heading,
                body: "SIOS asked " + who + " and it said no. SIOS stopped there: nothing else ran, and nothing on your computer changed.",
                quote: String(words), quoteFrom: who, retry: o.retry
            });
            return;
        }
        alert.open({ kind: "error", logo: o.logo, heading: heading, body: sentence(e), retry: o.retry });
    }
    // "Claude (Anthropic)" -> "Claude"; the two open-ended ones get plain names
    function shortName(p) {
        if (p.id === "local") return "Local model";
        if (p.id === "custom") return "Another AI service";
        return String(p.label || p.id).replace(/ \(.*\)$/, "");
    }
    function sentence(t) {
        t = String(t || "");
        return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : "";
    }

    component NavItem: Rectangle {
        id: nav
        property string icon
        property string label
        property string key
        property color tile: "#6b7480"
        property string badge: ""
        Layout.fillWidth: true
        visible: !win.q || label.toLowerCase().indexOf(win.q.toLowerCase()) >= 0
        implicitHeight: 42
        radius: 10
        readonly property bool on: win.page === key
        color: on ? Theme.navOn : (m.containsMouse ? Theme.surface3 : "transparent")
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 9
            anchors.rightMargin: 12
            spacing: 12
            Rectangle {
                implicitWidth: 28; implicitHeight: 28; radius: 8
                color: nav.on ? Qt.rgba(1, 1, 1, 0.18) : nav.tile
                Icon { anchors.centerIn: parent; name: nav.icon; size: 16; color: "#ffffff" }
            }
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: nav.label; color: nav.on ? "#ffffff" : Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: nav.on ? Font.DemiBold : Font.Normal; elide: Text.ElideRight }
            Text { visible: nav.badge !== ""; textFormat: Text.PlainText; text: nav.badge; color: nav.on ? "#ffffff" : Theme.fg3; opacity: 0.85; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.page = nav.key }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }
    component Header: Text { visible: !win.q; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold; font.capitalization: Font.AllUppercase; font.letterSpacing: 0.7; Layout.leftMargin: 10; Layout.topMargin: 16; Layout.bottomMargin: 4 }


    // a titled group of rows with a rounded frame, as in Daylight

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ---- sidebar
        Rectangle {
            Layout.fillHeight: true
            implicitWidth: 260
            color: Theme.sidebar
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }
            QQC2.ScrollView {
                anchors.fill: parent
                anchors.margins: 18
                anchors.rightMargin: 19
                ColumnLayout {
                    width: 223
                    spacing: 3
                    Text { text: "Settings"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 30; font.weight: Font.DemiBold; Layout.leftMargin: 10; Layout.topMargin: 8; Layout.bottomMargin: 10 }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.bottomMargin: 6
                        implicitHeight: 36; radius: 10
                        color: Theme.surface; border.width: 1; border.color: searchField.activeFocus ? Theme.accent : Theme.line
                        RowLayout {
                            anchors { fill: parent; leftMargin: 11; rightMargin: 6 }
                            spacing: 8
                            Icon { name: "search"; size: 14; color: Theme.fg3 }
                            QQC2.TextField {
                                id: searchField
                                Layout.fillWidth: true
                                placeholderText: "Search"
                                leftPadding: 0
                                placeholderTextColor: Theme.fg3; color: Theme.fg; background: null
                                font.family: Theme.ui; font.pixelSize: 13
                                onTextChanged: win.q = text.trim()
                                Keys.onEscapePressed: text = ""
                            }
                        }
                    }
                    Header { text: "Assistant" }
                    NavItem { icon: "brain-circuit"; tile: "#4f7bf7"; label: "Brain"; key: "brain" }
                    NavItem { icon: "shield-check"; tile: "#4d7a52"; label: "Permissions"; key: "permissions" }
                    NavItem {
                        icon: "plug"; tile: "#2f5d8a"; label: "Connectors"; key: "connectors"
                        badge: { const n = (broker.connectors.connectors || []).filter(c => c.installed && !c.disabled).length; return n ? n + " on" : ""; }
                    }
                    NavItem { icon: "bot"; tile: "#c1457d"; label: "Connected AI apps"; key: "connections" }
                    Header { text: "This computer" }
                    NavItem { icon: "palette"; tile: "#7b62c4"; label: "Appearance"; key: "appearance" }
                    NavItem { icon: "monitor"; tile: "#2e8d5c"; label: "Display"; key: "display" }
                    NavItem { icon: "volume-2"; tile: "#dc7637"; label: "Sound"; key: "sound" }
                    NavItem { icon: "wifi"; tile: "#3b74bf"; label: "Wi-Fi"; key: "wifi" }
                    NavItem { icon: "bluetooth"; tile: "#3b74bf"; label: "Bluetooth"; key: "bluetooth" }
                    NavItem { icon: "bell"; tile: "#d4524b"; label: "Notifications"; key: "notifications" }
                    NavItem { icon: "battery"; tile: "#2e8d5c"; label: "Power"; key: "power" }
                    NavItem { icon: "keyboard"; tile: "#6b7480"; label: "Keyboard"; key: "keyboard" }
                    NavItem { icon: "mouse"; tile: "#6b7480"; label: "Mouse & touchpad"; key: "mouse" }
                    NavItem { icon: "printer"; tile: "#6b7480"; label: "Printers"; key: "printers" }
                    Header { text: "You" }
                    NavItem { icon: "users"; tile: "#8b7652"; label: "Your account"; key: "account" }
                    NavItem { icon: "clock"; tile: "#56616e"; label: "Date & time"; key: "clock" }
                    NavItem { icon: "accessibility"; tile: "#3b74bf"; label: "Accessibility"; key: "accessibility" }
                    Header { text: "System" }
                    NavItem { icon: "refresh-cw"; tile: "#56616e"; label: "Updates"; key: "updates" }
                    NavItem { icon: "info"; tile: "#8b8b86"; label: "About"; key: "about" }
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
                x: Math.max(48, (body.width - 720) / 2)
                y: 40
                width: Math.min(720, body.width - 96)
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
                            const id = brainPage.waiting.split(":")[1] || "";
                            const p = brainPage.providers.filter(x => x.id === id)[0];
                            const name = p ? win.shortName(p) : "The AI";
                            brainPage.waiting = "";
                            if (error) win.failed(({ key: "Couldn't save the key", remove: "Couldn't remove the key", consent: "Couldn't change that",
                                                     configure: "Couldn't save the model", use: "Couldn't switch SIOS's brain", test: name + " didn't answer" })[tag],
                                                  error, { logo: id, name: name });
                            else notices.add(tag === "test" ? name + " answered" : "Saved",
                                             ({ test: "The connection works.", key: "The key is sealed in the broker.", use: "SIOS thinks with " + name + " now." })[tag] || "",
                                             { logo: id });
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
                            Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "brain-circuit"; size: 17; color: Theme.aiInk } }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { textFormat: Text.PlainText; text: brainPage.active ? "SIOS uses " + brainPage.active.label : "No AI connected yet"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                Text {
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                    color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                                    textFormat: Text.PlainText
                                    text: (brainPage.active ? "Model " + brainPage.active.model + (brainPage.active.small_model ? ", small jobs on " + brainPage.active.small_model : "") + ". " : "Add a key below, allow it, and choose it. ")
                                          + (brainPage.ai.calls_today || 0) + " of " + (brainPage.ai.max_calls_per_day || 0) + " requests used today. Each change asks for your password."
                                }
                                // what today cost: tokens from the providers' own counts; money only where you gave prices
                                Text {
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                    textFormat: Text.PlainText
                                    readonly property var tk: brainPage.ai.tokens_today || [0, 0]
                                    readonly property real cost: brainPage.ai.cost_today || 0
                                    function n(x) { return x >= 1e6 ? (Math.round(x / 1e5) / 10) + "M" : x >= 1e3 ? Math.round(x / 1e3) + "k" : String(x); }
                                    text: "Today: " + n(tk[0]) + " tokens sent, " + n(tk[1]) + " received" + (cost > 0 ? ", about $" + cost.toFixed(cost < 1 ? 3 : 2) : ". Add prices below to see the cost.")
                                    color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
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
                                Logo { key: pc.modelData.id; size: 36 }
                                Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: pc.modelData.label; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold; elide: Text.ElideRight }
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
                                        Text { id: chip; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData[0]; color: modelData[1]; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Medium }
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
                            // small jobs (writing a text, spotting a habit) on a cheaper model; planning stays on the main one
                            Advanced {
                                RowLayout {
                                    spacing: 8
                                    Text { text: "Small jobs"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; Layout.preferredWidth: 64; wrapMode: Text.WordWrap }
                                    Field { id: smallField; text: pc.modelData.small_model || ""; placeholder: "A cheaper model for small jobs (empty: the same model)" }
                                }
                                RowLayout {
                                    spacing: 8
                                    Text { text: "Prices"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; Layout.preferredWidth: 64 }
                                    Field { id: priceIn; text: (pc.modelData.price || [0, 0])[0] || ""; placeholder: "$ per million tokens in" }
                                    Field { id: priceOut; text: (pc.modelData.price || [0, 0])[1] || ""; placeholder: "$ per million out" }
                                }
                                RowLayout {
                                    spacing: 8
                                    Text { text: ""; Layout.preferredWidth: 64 }
                                    Field { id: smallIn; text: (pc.modelData.small_price || [0, 0])[0] || ""; placeholder: "small model: $ per million in" }
                                    Field { id: smallOut; text: (pc.modelData.small_price || [0, 0])[1] || ""; placeholder: "small model: $ per million out" }
                                }
                                RowLayout {
                                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "From your provider's price page. SIOS never guesses prices; without them it shows tokens only."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                    Button {
                                        text: "Save"; kind: "plain"
                                        onClicked: {
                                            const num = f => { const v = parseFloat(f.text); return isNaN(v) ? 0 : v; };
                                            brainPage.ask("model.configure", { id: pc.modelData.id, small_model: smallField.text, price: [num(priceIn), num(priceOut)], small_price: [num(smallIn), num(smallOut)] }, "configure");
                                        }
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
                                    textFormat: Text.PlainText
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

                // Connectors (C1, D79 to D81): the AIs SIOS thinks with and the services it
                // reaches through its broker. Tokens are sealed in the Sign-ins vault;
                // installing or removing asks for your password.
                ColumnLayout {
                    id: connPage
                    visible: win.page === "connectors"
                    Layout.fillWidth: true
                    spacing: 10
                    readonly property var list: (broker.connectors.connectors || [])
                    readonly property var providers: broker.ai.providers || []
                    property string waiting: ""
                    property string opened: ""     // the service row that's open
                    property var last: null         // the request waiting for an answer
                    onVisibleChanged: if (visible) broker.refresh()
                    Connections {
                        target: broker
                        function onDone(tag, ok, error) {
                            if (["cinstall", "cremove"].indexOf(tag) < 0) return;
                            const r = connPage.last;
                            connPage.waiting = "";
                            connPage.last = null;
                            if (alert.kind === "progress") alert.close();
                            if (!r) return;
                            if (error) {
                                // a token was sent and is gone from this window, so installing
                                // again needs it pasted again; anything else can simply retry
                                const again = r.params.secret ? null : () => connPage.ask(r.method, r.params, r.tag, r.name);
                                win.failed((tag === "cinstall" ? "Couldn't install " : "Couldn't remove ") + r.name, error,
                                           { logo: r.params.id, name: r.name, retry: again });
                                if (r.params.secret) connPage.opened = r.params.id;
                            } else if (tag === "cinstall") {
                                notices.add(r.name + " is on", "SIOS can use it, and asks you each time.", { logo: r.params.id });
                                connPage.opened = "";
                            } else {
                                notices.add(r.name + " removed", "Its sign-in is gone too.", { logo: r.params.id });
                            }
                        }
                    }
                    function ask(method, params, tag, name) {
                        waiting = tag + ":" + params.id;
                        last = { method: method, params: params, tag: tag, name: name };
                        broker.request(method, params, tag);
                        if (tag === "cinstall")
                            alert.open({ kind: "progress", logo: params.id, heading: "Installing " + name,
                                         body: "SIOS asks for your password, then checks " + name + " against its signed list, asks which tools it has and pins them, so any change is noticed. This takes a few seconds." });
                    }
                    function install(c, token) {
                        const p = { id: c.id, ais: c.installed ? c.ais : ["sios"] };
                        if (token) p.secret = token;
                        else if (c.signin && !c.signed_in) { opened = c.id; return false; }
                        ask("connectors.install", p, "cinstall", c.name);
                        return true;
                    }

                    PageTitle { title: "Connectors"; sub: "Everything SIOS can talk to. Your keys and tokens stay sealed in the broker; no AI ever sees them." }
                    Soon {
                        visible: !broker.reachable
                        text: "SIOS's broker isn't running, so connectors can't be changed right now."
                    }

                    // the AIs SIOS thinks with; each opens on the Brain page
                    SectionLabel { visible: broker.reachable; text: "AI accounts" }
                    Group {
                        visible: broker.reachable
                        Repeater {
                            model: connPage.providers
                            delegate: ListRow {
                                required property var modelData
                                required property int index
                                first: index === 0
                                logo: modelData.id
                                name: win.shortName(modelData)
                                sub: modelData.active ? "SIOS thinks with this one now"
                                     : modelData.has_key ? "Key sealed in the broker"
                                     : modelData.online ? "Not set up" : "Private, runs on this computer"
                                subColor: modelData.active || modelData.has_key || !modelData.online ? Theme.fg2 : Theme.fg3
                                onClicked: win.page = "brain"
                                Pill { visible: !!modelData.active; text: "In use" }
                            }
                        }
                    }

                    // services from SIOS's signed catalog, plus what's coming next
                    SectionLabel { visible: broker.reachable; text: "Services"; Layout.topMargin: 16 }
                    Soon { visible: !!broker.connectors.catalog_error; text: "Services are off: " + (broker.connectors.catalog_error || "") }
                    Group {
                        visible: broker.reachable
                        Repeater {
                            model: connPage.list
                            delegate: ColumnLayout {
                                id: cc
                                required property var modelData
                                required property int index
                                readonly property bool open: connPage.opened === modelData.id
                                readonly property bool busy: connPage.waiting.endsWith(":" + modelData.id)
                                Layout.fillWidth: true
                                spacing: 0
                                ListRow {
                                    first: cc.index === 0
                                    logo: cc.modelData.id
                                    name: cc.modelData.name
                                    sub: cc.modelData.disabled ? "Switched off: its tools changed" : (cc.modelData.about || "")
                                    subColor: cc.modelData.disabled ? Theme.danger : Theme.fg2
                                    expanded: cc.open
                                    onClicked: connPage.opened = cc.open ? "" : cc.modelData.id
                                    Pill { visible: !!cc.modelData.verified && !cc.modelData.installed; kind: "muted"; text: "Verified" }
                                    Pill { visible: !!cc.modelData.disabled; kind: "danger"; text: "Switched off" }
                                    Pill { visible: !!cc.modelData.installed && !cc.modelData.disabled; text: "On" }
                                    Button {
                                        visible: !cc.modelData.installed && !cc.open
                                        text: "Install"
                                        busy: cc.busy
                                        onClicked: connPage.install(cc.modelData, "")
                                    }
                                }
                                // the open row: what it may do, the token, and the actions
                                ColumnLayout {
                                    visible: cc.open
                                    Layout.fillWidth: true
                                    Layout.leftMargin: 70
                                    Layout.rightMargin: 20
                                    Layout.bottomMargin: 18
                                    spacing: 12
                                    Text {
                                        Layout.fillWidth: true; wrapMode: Text.WordWrap
                                        textFormat: Text.PlainText
                                        text: (cc.modelData.verified ? "Verified, from " : "From ") + cc.modelData.publisher + ". Talks only to " + (cc.modelData.destinations || []).join(", ") + "."
                                        color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                                    }
                                    Text {
                                        Layout.fillWidth: true; wrapMode: Text.WordWrap
                                        textFormat: Text.PlainText
                                        text: "What SIOS may do with it: " + (cc.modelData.tools || []).map(t => t.about.replace(/[.:].*$/, "").toLowerCase()).join("; ") + "."
                                        color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
                                    }
                                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; visible: !!cc.modelData.disabled; textFormat: Text.PlainText; text: cc.modelData.disabled || ""; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13 }
                                    RowLayout {
                                        spacing: 8
                                        visible: !!cc.modelData.signin
                                        Field {
                                            id: tokField
                                            secret: TextInput.Password
                                            placeholder: cc.modelData.signed_in ? "A sign-in is saved. Paste a new token to replace it." : (cc.modelData.signin ? cc.modelData.signin.label : "")
                                            onAccepted: installBtn.clicked()
                                        }
                                        Button { text: "Make one"; kind: "plain"; onClicked: Qt.openUrlExternally(cc.modelData.signin.help_url) }
                                    }
                                    RowLayout {
                                        spacing: 8
                                        Text {
                                            Layout.fillWidth: true; wrapMode: Text.WordWrap
                                            textFormat: Text.PlainText
                                            text: cc.modelData.installed ? "Used by " + (cc.modelData.ais || []).map(a => a === "sios" ? "SIOS" : a).join(", ") + ". SIOS asks you before each use."
                                                                         : "Installing checks the service and pins its tools; if they ever change, SIOS switches it off."
                                            color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                                        }
                                        Button { visible: !!cc.modelData.installed; text: "Remove"; kind: "danger"; busy: cc.busy && connPage.waiting.startsWith("cremove:"); onClicked: connPage.ask("connectors.remove", { id: cc.modelData.id }, "cremove", cc.modelData.name) }
                                        Button {
                                            id: installBtn
                                            text: cc.modelData.installed && !cc.modelData.disabled ? "Update sign-in" : "Install"
                                            busy: cc.busy && connPage.waiting.startsWith("cinstall:")
                                            onClicked: {
                                                if (cc.modelData.signin && !tokField.text && (!cc.modelData.signed_in || cc.modelData.installed && !cc.modelData.disabled)) {
                                                    tokField.field.forceActiveFocus();
                                                    return;
                                                }
                                                connPage.install(cc.modelData, tokField.text);
                                                tokField.text = "";   // the token is gone from this window once sent
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Repeater {
                            // planned next (C2); shown so you know they're coming, never clickable
                            model: [["gmail", "Gmail", "Mail, through your Google sign-in"], ["calendar", "Google Calendar", "Events and invites"]]
                                   .filter(x => !connPage.list.some(c => c.id === x[0]))
                            delegate: ListRow {
                                required property var modelData
                                required property int index
                                first: index === 0 && connPage.list.length === 0
                                logo: modelData[0]
                                name: modelData[1]
                                sub: modelData[2]
                                chevron: false
                                Pill { kind: "muted"; text: "Coming soon" }
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
                            if (error) { win.failed(tag === "app-pair" ? "Couldn't pair the app" : "Couldn't change the app", error); return; }
                            if (tag === "app-pair") { appsPage.token = ok.token; appsPage.tokenFor = ok.id; }
                            else notices.add("Saved", "");
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
                                    Text { id: rl; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData.name; color: parent.on ? Theme.accent : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.Medium }
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
                        Text { textFormat: Text.PlainText; text: "Paired " + appsPage.tokenFor + ". Copy this now; it isn't shown again."; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold; Layout.fillWidth: true; wrapMode: Text.WordWrap }
                        Text { text: "For Claude Code, run this in a terminal:"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: cmd.implicitHeight + 20; radius: 8
                            color: Theme.surface2; border.width: 1; border.color: Theme.line
                            TextEdit {
                                id: cmd
                                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 10 }
                                readOnly: true; selectByMouse: true; wrapMode: TextEdit.WrapAnywhere
                                textFormat: TextEdit.PlainText
                                text: "claude mcp add --scope user sios --env SIOS_PAIR_TOKEN=" + appsPage.token + " -- /usr/bin/brain-d mcp"
                                color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12
                            }
                        }
                        Text { text: "Other apps: an MCP server with command /usr/bin/brain-d, argument mcp, and the environment variable SIOS_PAIR_TOKEN set to the token above."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; Layout.fillWidth: true; wrapMode: Text.WordWrap }
                        RowLayout {
                            Item { Layout.fillWidth: true }
                            Button { text: "Copy"; kind: "plain"; onClicked: { cmd.selectAll(); cmd.copy(); cmd.deselect(); notices.add("Copied", "Paste it into a terminal."); } }
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
                                Rectangle { implicitWidth: 34; implicitHeight: 34; radius: 10; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "bot"; size: 16; color: Theme.aiInk } }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text { textFormat: Text.PlainText; text: ac.modelData.name + (ac.modelData.paused ? "  (paused)" : ""); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                    Text {
                                        Layout.fillWidth: true; wrapMode: Text.WordWrap
                                        textFormat: Text.PlainText
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
                                        Text { anchors.horizontalCenter: parent.horizontalCenter; textFormat: Text.PlainText; text: modelData[1]; color: modelData[0] ? "#ececea" : "#1d1d1f"; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.Medium }
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
                                    Text { textFormat: Text.PlainText; text: modelData.name; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
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
                            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: system.wifiHardware ? "Wi-Fi" : "No Wi-Fi on this computer"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
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
                                        Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: net.modelData.ssid; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: net.modelData.connected ? Font.DemiBold : Font.Normal }
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

                // the computer's other areas: one page each, in their own files
                DisplayPage { visible: win.page === "display"; Layout.fillWidth: true }
                SoundPage { visible: win.page === "sound"; Layout.fillWidth: true }
                BluetoothPage { visible: win.page === "bluetooth"; Layout.fillWidth: true }
                NotifsPage { visible: win.page === "notifications"; Layout.fillWidth: true }
                PowerPage { visible: win.page === "power"; Layout.fillWidth: true }
                KeyboardPage { visible: win.page === "keyboard"; Layout.fillWidth: true }
                MousePage { visible: win.page === "mouse"; Layout.fillWidth: true }
                PrintersPage { visible: win.page === "printers"; Layout.fillWidth: true }
                UsersPage { visible: win.page === "account"; Layout.fillWidth: true }
                ClockPage { visible: win.page === "clock"; Layout.fillWidth: true }
                AccessPage { visible: win.page === "accessibility"; Layout.fillWidth: true }

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
                                    textFormat: Text.PlainText
                                    text: ({ checking: "Checking for updates…", current: "SIOS is up to date", available: "An update is ready to download", installing: "Downloading and installing…", ready: "Restart to finish updating" })[system.update.state || ""] || ("SIOS " + (system.update.version || ""))
                                    color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold
                                }
                                Text { textFormat: Text.PlainText; text: "Version " + (system.update.version || "?") + (system.update.built ? ", built " + system.update.built : ""); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                                Text { visible: !!system.update.staged; textFormat: Text.PlainText; text: "Waiting for a restart: " + (system.update.staged || ""); color: Theme.accent; font.family: Theme.ui; font.pixelSize: 12 }
                                Text { visible: !!system.update.checked; textFormat: Text.PlainText; text: "Last checked at " + (system.update.checked || ""); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
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
                                Text { textFormat: Text.PlainText; text: modelData[0]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; Layout.preferredWidth: 140 }
                                Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: modelData[1] || ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; elide: Text.ElideRight }
                            }
                        }
                    }
                }
            }
        }
    }

    Notices { id: notices }
    Alert { id: alert; transientParent: win }
}
