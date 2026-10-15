// The Ask bar, the preview's CommandBar (CommandBar.tsx): above the dock, a
// card with suggestions or results, a footer with key hints, and the input
// with the orb. Placed as an overlay with KDE's layer-shell, so it sits
// exactly above the dock and takes the keyboard while open.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.layershell as LayerShell

Window {
    id: bar
    width: 760
    height: card.implicitHeight + 40
    color: "transparent"
    visible: !startHidden
    title: "Ask SIOS"

    LayerShell.Window.scope: "sios-ask"
    LayerShell.Window.layer: LayerShell.Window.LayerOverlay
    LayerShell.Window.anchors: LayerShell.Window.AnchorBottom
    LayerShell.Window.margins.bottom: 104
    LayerShell.Window.keyboardInteractivity: LayerShell.Window.KeyboardInteractivityOnDemand
    LayerShell.Window.exclusionZone: -1

    property string mode: startApps ? "apps" : "search"   // search | apps (all apps, A to Z) | assistant
    property var apps: []
    property var results: []
    property int current: 0
    // typed text: "Ask SIOS" first, then what the search finds
    readonly property var rows: input.text.trim() === "" ? assistant.cards.map(c => ({ kind: "card", id: c.id, title: c.headline, sub: "SIOS noticed this. Enter to do it.", icon: "sparkles" })).concat(search.suggestions) : [{ kind: "ask", title: "Ask SIOS: \u201c" + input.text.trim() + "\u201d", sub: "Plan it, check it, and do it after your OK", icon: "sparkles" }].concat(results)

    // the apps view was what opened, so an emptied search goes back to it
    property bool fromApps: false
    function showApps() {
        open();
        fromApps = true;
        mode = "apps";
        apps = search.allApps("");
    }
    function open() {
        assistant.refreshCards();
        fromApps = false;
        mode = "search";
        input.text = "";
        results = [];
        current = 0;
        bar.visible = true;
        bar.requestActivate();
        input.forceActiveFocus();
    }
    function close() { bar.visible = false; }
    function go(i) {
        const item = rows[i];
        if (!item) return;
        if (item.kind === "ask") { askNow(input.text); return; }
        if (item.kind === "card") { mode = "assistant"; assistant.act(item.id); return; }
        search.run(item);
        close();
    }
    function askNow(text) {
        if (!text.trim()) return;
        mode = "assistant";
        assistant.ask(text);
        input.text = "";
    }
    // a step's tool in plain words ("apps.open" -> "Opened Terminal"); names from the
    // step's own arguments are shown as text, and an unknown tool keeps its name
    function stepWords(tool, a) {
        a = a || {};
        const name = p => String(p || "").split("/").pop();
        const w = ({
            "files.list": "Looked in " + (a.path || "a folder"), "files.find": "Searched for " + (a.query ? "\u201c" + a.query + "\u201d" : "files"),
            "files.read": "Read " + name(a.path), "files.preview": "Looked at " + name(a.path), "files.write": "Wrote " + name(a.path),
            "files.move": "Moved " + name(a.from || a.path) + (a.to ? " to " + a.to : ""), "files.copy": "Copied " + name(a.from || a.path),
            "files.trash": "Moved " + name(a.path) + " to the Bin", "files.delete": "Deleted " + name(a.path), "files.mkdir": "Made the folder " + (a.path || ""),
            "files.organize": "Sorted " + (a.path || "the folder"), "files.restore": "Put " + name(a.path) + " back", "files.show": "Showed " + (a.path || "the folder"),
            "apps.open": "Opened " + (a.app || "the app"), "apps.close": "Closed " + (a.app || "the app"), "apps.focus": "Switched to " + (a.app || "the app"),
            "apps.arrange": "Put " + (a.left || "") + " and " + (a.right || "") + " side by side", "apps.install": "Installed " + (a.id || a.app || "the app"),
            "apps.remove": "Removed " + (a.id || a.app || "the app"), "apps.list": "Checked which apps are open",
            "settings.set_theme": "Switched to the " + (a.theme || a.mode || "") + " look", "settings.set_volume": "Set the volume", "settings.set_brightness": "Set the brightness",
            "settings.set_wallpaper": "Changed the wallpaper", "settings.dnd": "Changed Do Not Disturb", "network.connect_wifi": "Joined " + (a.ssid || "Wi-Fi"),
            "network.wifi_power": "Turned Wi-Fi " + (a.on === false ? "off" : "on"), "network.bluetooth_power": "Turned Bluetooth " + (a.on === false ? "off" : "on"),
            "network.list": "Looked for networks", "system.notify": "Sent you a notice", "system.remind": "Set a reminder", "system.lock": "Locked the screen",
            "system.state": "Checked the computer", "mail.send": "Sent the email", "memory.search": "Looked in what SIOS remembers",
            "memory.save": "Remembered it", "memory.forget": "Forgot it", "people.resolve": "Looked up " + (a.name || "a contact")
        })[tool];
        return w || tool || "";
    }

    // one goal's events in plain words, for the assistant view
    function say(e) {
        switch (e.t) {
        case "plan": return ["sparkles", e.understanding || "Planned it."];
        case "question": return ["info", e.text];
        case "review": return ["shield-check", "Waiting for your OK in the approval window."];
        case "granted": return ["check", e.rule ? "Allowed by your rule: " + e.rule : "You allowed it."];
        case "ask": return ["shield-check", "Step " + e.n + " needs your OK: " + (e.reason || "")];
        case "step": return [e.decision === "allow" && !e.error ? "check" : "x", (e.kind === "compose" ? "Wrote the text" : stepWords(e.tool, e.args)) + (e.error ? ": " + e.error : e.decision !== "allow" ? ": " + (e.reason || e.decision) : "")];
        case "replan": return ["refresh-cw", "Adjusting the plan."];
        case "undo": return ["rotate-ccw", "Undid the last change."];
        case "done": return ["check", e.text];
        case "error": return ["x", e.message];
        default: return null;
        }
    }

    // a card asked for from outside (the desktop widget, or anything that can reach our
    // D-Bus name) only opens the bar on that card: doing it always takes your Enter or click
    function showCard(id) {
        open();
        input.text = "";
        const i = rows.findIndex(r => r.kind === "card" && r.id === id);
        current = Math.max(0, i);
    }

    Connections {
        target: toggler
        function onToggled() { bar.visible ? bar.close() : bar.open(); }
        function onAppsRequested() { bar.visible && bar.mode === "apps" ? bar.close() : bar.showApps(); }
        function onSuggestionRequested(id) { bar.showCard(id); }
    }
    // the approval window takes focus while SIOS works; stay open for it then
    onActiveChanged: if (!active && visible && mode !== "assistant") close()
    Component.onCompleted: {
        if (startSuggestion) showCard(startSuggestion);
        else if (visible) { if (startApps) showApps(); else open(); }
    }

    // a soft shadow, drawn as faint rings so it needs no GPU
    Repeater {
        model: [[14, 0.04], [9, 0.05], [5, 0.07]]
        Rectangle {
            required property var modelData
            x: card.x - modelData[0] / 2
            y: card.y - modelData[0] / 2 + 6
            width: card.width + modelData[0]
            height: card.height + modelData[0]
            radius: 28 + modelData[0] / 2
            color: Qt.rgba(10 / 255, 20 / 255, 40 / 255, modelData[1])
        }
    }

    Rectangle {
        id: card
        x: 20
        y: 14
        width: bar.width - 40
        implicitHeight: body.implicitHeight
        radius: 28
        color: Theme.dark ? Qt.rgba(30 / 255, 32 / 255, 35 / 255, 0.97) : Qt.rgba(246 / 255, 247 / 255, 250 / 255, 0.97)
        border.width: 1
        border.color: Theme.dark ? Qt.rgba(1, 1, 1, 0.08) : Qt.rgba(1, 1, 1, 0.9)
        clip: true

        ColumnLayout {
            id: body
            width: parent.width
            spacing: 0

            // ---- all apps, A to Z (the top bar's Apps, or the grid button)
            ColumnLayout {
                visible: bar.mode === "apps"
                Layout.fillWidth: true
                spacing: 6
                Text {
                    Layout.leftMargin: 28
                    Layout.topMargin: 20
                    text: "All apps"
                    color: Theme.fg2
                    font.family: Theme.ui
                    font.pixelSize: 15
                    font.weight: Font.DemiBold
                }
                GridView {
                    id: grid
                    Layout.fillWidth: true
                    Layout.leftMargin: 12
                    Layout.rightMargin: 12
                    Layout.preferredHeight: Math.min(3, Math.ceil(count / 6)) * cellHeight
                    cellWidth: Math.floor(width / 6)
                    cellHeight: 108
                    clip: true
                    model: bar.apps
                    currentIndex: bar.current
                    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                    delegate: Rectangle {
                        required property var modelData
                        required property int index
                        width: grid.cellWidth - 6
                        height: grid.cellHeight - 6
                        radius: 16
                        color: index === bar.current ? (Theme.dark ? Qt.rgba(125 / 255, 157 / 255, 1, 0.14) : "#eceffd") : (am.containsMouse ? Theme.surface2 : "transparent")
                        Column {
                            anchors.centerIn: parent
                            spacing: 8
                            Image { anchors.horizontalCenter: parent.horizontalCenter; width: 44; height: 44; sourceSize: Qt.size(88, 88); source: "image://icon/theme/" + modelData.icon }
                            Text { width: grid.cellWidth - 20; horizontalAlignment: Text.AlignHCenter; textFormat: Text.PlainText; text: modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; elide: Text.ElideRight }
                        }
                        MouseArea { id: am; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { search.run(modelData); bar.close(); } }
                    }
                }
            }

            // ---- the assistant at work: what you asked, then each event in plain words
            ColumnLayout {
                visible: bar.mode === "assistant"
                Layout.fillWidth: true
                Layout.leftMargin: 28
                Layout.rightMargin: 28
                Layout.topMargin: 20
                Layout.bottomMargin: 12
                spacing: 10
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: assistant.request; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.Medium }
                Repeater {
                    model: assistant.events.map(e => bar.say(e)).filter(x => x && x[1])
                    delegate: RowLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: 10
                        Icon { name: modelData[0]; size: 16; color: modelData[0] === "x" ? Theme.danger : Theme.aiInk; Layout.alignment: Qt.AlignTop; Layout.topMargin: 2 }
                        // file names, the model's words and errors: plain text, never markup or links
                        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: modelData[1]; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14 }
                    }
                }
                Text { visible: assistant.running; text: "Working…"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }

            // ---- suggestions or results
            Text {
                visible: bar.mode === "search"
                Layout.leftMargin: 28
                Layout.topMargin: 20
                Layout.bottomMargin: 8
                text: input.text.trim() === "" ? "Try one, or type anything" : bar.results.length ? "Best matches" : "Ask SIOS, or nothing else matches"
                color: Theme.fg2
                font.family: Theme.ui
                font.pixelSize: 15
                font.weight: Font.DemiBold
            }
            Repeater {
                model: bar.mode === "search" ? bar.rows : []
                delegate: Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    readonly property bool on: index === bar.current
                    Layout.fillWidth: true
                    Layout.leftMargin: 12
                    Layout.rightMargin: 12
                    implicitHeight: 72
                    radius: 18
                    color: on ? (Theme.dark ? Qt.rgba(125 / 255, 157 / 255, 1, 0.14) : "#eceffd") : (m.containsMouse ? Theme.surface2 : "transparent")
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 16
                        anchors.rightMargin: 20
                        spacing: 16
                        Rectangle {
                            implicitWidth: 44
                            implicitHeight: 44
                            radius: 13
                            color: Theme.surface
                            border.width: 1
                            border.color: Theme.line
                            Image {
                                anchors.centerIn: parent
                                visible: !!row.modelData.themed
                                width: 30; height: 30
                                sourceSize: Qt.size(60, 60)
                                source: row.modelData.themed ? "image://icon/theme/" + row.modelData.icon : ""
                            }
                            Icon { anchors.centerIn: parent; visible: !row.modelData.themed; name: row.modelData.icon || "search"; size: 20; color: row.on ? Theme.aiInk : Theme.fg }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: row.modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.Medium; elide: Text.ElideRight }
                            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: row.modelData.sub || ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14; elide: Text.ElideRight }
                        }
                        Icon { visible: row.on; name: "corner-down-left"; size: 20; color: Theme.aiInk }
                    }
                    MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onEntered: bar.current = row.index; onClicked: bar.go(row.index) }
                }
            }
            Item { implicitHeight: 10 }

            // ---- footer: what it does, and the keys
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 28
                Layout.rightMargin: 24
                Layout.topMargin: 12
                Layout.bottomMargin: 12
                spacing: 10
                Icon { name: "cpu"; size: 16; color: Theme.ok }
                Text {
                    Layout.fillWidth: true
                    text: bar.mode === "apps" ? "Every app on this computer, A to Z." : bar.mode === "assistant" ? "Type a follow-up, or esc to close. Nothing runs without your OK." : "Finds apps, files and settings, or asks SIOS to do it."
                    color: Theme.fg2
                    font.family: Theme.ui
                    font.pixelSize: 13
                    elide: Text.ElideRight
                }
                component Key: Rectangle {
                    property string icon
                    implicitWidth: 30; implicitHeight: 28; radius: 8
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    Icon { anchors.centerIn: parent; name: parent.icon; size: 14; color: Theme.fg2 }
                }
                Key { icon: "arrow-up" }
                Key { icon: "arrow-down" }
                Text { text: "to choose"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                Key { icon: "corner-down-left"; Layout.leftMargin: 8 }
                Text { text: "to open"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }

            // ---- the input, with the orb
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: 22
                Layout.rightMargin: 18
                Layout.topMargin: 14
                Layout.bottomMargin: 16
                spacing: 14
                Orb { implicitWidth: 40; implicitHeight: 40; width: 40; height: 40; strands: 16; lively: input.text !== "" }
                QQC2.TextField {
                    id: input
                    Layout.fillWidth: true
                    placeholderTextColor: Theme.fg3
                    color: Theme.fg
                    font.family: Theme.ui
                    font.pixelSize: 19
                    background: null
                    padding: 0
                    focus: true
                    placeholderText: bar.mode === "apps" ? "Search apps, files and settings, or ask SIOS…" : bar.mode === "assistant" ? "Ask a follow-up…" : "Ask SIOS, or search apps, files and settings…"
                    onTextChanged: {
                        if (bar.mode === "assistant") return;
                        // opened on the apps (the orb, Apps): typing searches everything,
                        // and clearing the text brings the apps back
                        if (bar.mode === "apps" && text.trim()) { bar.fromApps = true; bar.mode = "search"; }
                        else if (bar.mode === "search" && bar.fromApps && !text.trim()) { bar.mode = "apps"; bar.apps = search.allApps(""); }
                        if (bar.mode === "search") bar.results = text.trim() ? search.find(text) : [];
                        bar.current = 0;
                    }
                    Keys.onEscapePressed: bar.close()
                    readonly property int step: bar.mode === "apps" ? 6 : 1
                    readonly property int count: bar.mode === "apps" ? bar.apps.length : bar.rows.length
                    Keys.onDownPressed: bar.current = Math.min(count - 1, bar.current + step)
                    Keys.onUpPressed: bar.current = Math.max(0, bar.current - step)
                    Keys.onRightPressed: (e) => { if (bar.mode === "apps") bar.current = Math.min(count - 1, bar.current + 1); else e.accepted = false; }
                    Keys.onLeftPressed: (e) => { if (bar.mode === "apps") bar.current = Math.max(0, bar.current - 1); else e.accepted = false; }
                    Keys.onReturnPressed: bar.mode === "assistant" ? bar.askNow(text) : bar.mode === "apps" ? (bar.apps[bar.current] && (search.run(bar.apps[bar.current]), bar.close())) : bar.go(bar.current)
                    Keys.onEnterPressed: bar.mode === "assistant" ? bar.askNow(text) : bar.mode === "apps" ? (bar.apps[bar.current] && (search.run(bar.apps[bar.current]), bar.close())) : bar.go(bar.current)
                }
                Rectangle {
                    implicitWidth: 40; implicitHeight: 34; radius: 10
                    color: bar.mode === "apps" ? Theme.aiSoft : "transparent"
                    Icon { anchors.centerIn: parent; name: "layout-grid"; size: 20; color: bar.mode === "apps" ? Theme.aiInk : Theme.fg2 }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: { bar.mode = bar.mode === "apps" ? "search" : "apps"; bar.apps = search.allApps(input.text); bar.results = input.text.trim() ? search.find(input.text) : []; bar.current = 0; input.forceActiveFocus(); }
                    }
                    Accessible.role: Accessible.Button
                    Accessible.name: "All apps"
                }
                Rectangle {
                    implicitWidth: 52; implicitHeight: 34; radius: 10
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    Text { anchors.centerIn: parent; text: "esc"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bar.close() }
                }
            }
        }
    }
}
