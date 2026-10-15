// SIOS Agents in Daylight (the owner's pick, docs/design/agents-daylight.html).
//   Team: a card per agent with what it's doing, time left and tokens used.
//   An agent: its details and limits beside its live output (what it reads,
//             changes and runs), a box for the next task, its activity, its settings.
//   Inbox: what agents reported. Activity: every decision the broker made.
//   Permissions: each AI, Pause, and Stop all AI.
// Looking needs no password (D59). Making, changing, leasing and removing are
// yours: the broker asks for your password. Stop never does (D41). Everything
// an agent wrote is shown as plain text, never followed.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 1200
    height: 800
    minimumWidth: 980
    minimumHeight: 600
    visible: true
    title: "Agents"
    color: Theme.surface

    readonly property var pages: ["agents", "inbox", "activity", "permissions"]
    property string page: pages.indexOf(startPage) >= 0 ? startPage : "agents"
    // the agent opened on its own page ("" for the team), and which part of it
    property string sel: String(startPage).startsWith("agent:") ? startPage : ""
    property string tab: "now"
    Connections {
        target: waker
        function onShown(p) {
            if (win.pages.indexOf(p) >= 0) { win.page = p; win.sel = ""; }
            else if (String(p).startsWith("agent:")) { win.page = "agents"; win.sel = p; win.tab = "now"; }
            win.show(); win.raise(); win.requestActivate();
        }
    }

    property var apps: []
    Component.onCompleted: broker.request("iam.apps", {}, "apps")

    readonly property var agents: broker.team.agents || []
    readonly property var reports: broker.team.reports || []
    readonly property var runs: broker.team.runs || []
    readonly property int unread: broker.team.unread || 0
    readonly property var current: agents.find(a => a.id === sel)
    property string filter: ""

    // the clock the cards count down with
    property real now: Date.now() / 1000
    Timer { interval: 10000; running: true; repeat: true; onTriggered: win.now = Date.now() / 1000 }

    // ---- answers from the broker: errors open a window, small news goes to the corner
    Connections {
        target: broker
        function onDone(tag, ok, error) {
            if (tag === "apps") { if (ok) win.apps = ok.apps || []; return; }
            if (tag === "log") { if (!error) logView.data_ = ok; return; }
            const t = String(tag).split("|");
            if (error) win.failed(t[1] || "That didn't work", error);
            else if (t[0]) notices.add(t[0], t[2] || "");
            if (!error && t[0] === "Agent made") newAgent.close();
        }
    }
    // tag: "<notice title>|<error title>|<notice text>"
    function ask(method, params, ok, bad, sub) { broker.request(method, params, ok + "|" + bad + "|" + (sub || "")); }
    function failed(heading, error) {
        const e = String(error || "");
        if (e === "not confirmed: the owner's password wasn't given") { notices.add(heading, "You closed the password window. Nothing changed.", { error: true }); return; }
        alert.open({ kind: "error", heading: heading, body: e.charAt(0).toUpperCase() + e.slice(1) + (/[.!?]$/.test(e) ? "" : ".") });
    }

    // ---- small helpers
    function nameOf(id) { const a = agents.find(x => x.id === id); return a ? a.name : String(id).replace(/^(app|agent|helper|unpaired):/, ""); }
    function ago(t) {
        const s = Math.max(0, now - t);
        if (s < 60) return "just now";
        if (s < 3600) return Math.round(s / 60) + " min ago";
        if (s < 86400) return Math.round(s / 3600) + " h ago";
        return new Date(t * 1000).toLocaleDateString(Qt.locale(), "MMM d");
    }
    function span(s) {
        s = Math.max(0, Math.round(s));
        const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
        return h ? h + " h " + (m ? m + " min" : "") : m + " min";
    }
    function tok(n) {
        n = n || 0;
        if (n >= 1e6) return (Math.round(n / 1e5) / 10) + "M";
        if (n >= 1e3) return Math.round(n / 1e3) + "k";
        return String(n);
    }
    function jobText(a) {
        if (a.brain === "claude-code") return "Works on " + a.folder;
        if (a.job === "watch") return "Watches " + a.folder;
        if (a.job === "every") return "Every " + (a.every_min >= 60 ? Math.round(a.every_min / 60) + " h" : a.every_min + " min");
        if (a.job === "daily") return "Every day at " + a.at;
        return "When you ask";
    }
    function runOf(a) { return runs.find(r => r.agent === a.id); }
    function dayTokens(a) { return runs.filter(r => r.agent === a.id && (!r.ended || r.ended + 86400 > now)).reduce((s, r) => s + (r.tokens || 0), 0); }
    function leftOf(a) { return Math.max(0, (a.lease_until || 0) - now); }
    function stateOf(a) {
        if (!a.active) return ["Paused", "warn"];
        if (a.run) return ["Working", "ok"];
        if (a.brain === "claude-code" && leftOf(a) <= 0) return ["Resting", "muted"];
        return ["Ready", "muted"];
    }
    readonly property var pets: ({ mint: "#9ee2c6", sky: "#a9cdff", violet: "#c4bbff", peach: "#ffc9a3", rose: "#ffb3c8", lemon: "#f7df8c", slate: "#c3cbd4", coral: "#ffb0a3" })

    // ---- pieces
    component NavItem: Rectangle {
        id: nav
        property string icon
        property string label
        property string key
        property color tile
        property int count: 0
        Layout.fillWidth: true
        implicitHeight: 42
        radius: 10
        readonly property bool on: win.page === key
        color: on ? Theme.navOn : (m.containsMouse ? Theme.surface3 : "transparent")
        RowLayout {
            anchors { fill: parent; leftMargin: 9; rightMargin: 12 }
            spacing: 12
            Rectangle { implicitWidth: 28; implicitHeight: 28; radius: 8; color: nav.on ? Qt.rgba(1, 1, 1, 0.18) : nav.tile; Icon { anchors.centerIn: parent; name: nav.icon; size: 16; color: "#ffffff" } }
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: nav.label; color: nav.on ? "#ffffff" : Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: nav.on ? Font.DemiBold : Font.Normal }
            Text { visible: nav.count > 0; textFormat: Text.PlainText; text: nav.count; color: nav.on ? "#ffffff" : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { win.page = nav.key; win.sel = ""; } }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }
    component Pill: Rectangle {
        property string text
        property string kind: "ok"   // ok, warn, danger, muted, acc
        property bool dot: false
        implicitWidth: pr.implicitWidth + 20
        implicitHeight: 24
        radius: 12
        readonly property color ink: kind === "ok" ? Theme.ok : kind === "warn" ? Theme.warn : kind === "danger" ? Theme.danger : kind === "acc" ? Theme.accent : Theme.fg3
        color: kind === "ok" ? Theme.okSoft : kind === "warn" ? Qt.rgba(Theme.warn.r, Theme.warn.g, Theme.warn.b, 0.12) : kind === "danger" ? Theme.dangerSoft : kind === "acc" ? Theme.accentSoft : Theme.surface3
        Row {
            id: pr
            anchors.centerIn: parent
            spacing: 6
            Rectangle { visible: parent.parent.dot; anchors.verticalCenter: parent.verticalCenter; width: 7; height: 7; radius: 3.5; color: parent.parent.ink }
            Text { textFormat: Text.PlainText; text: parent.parent.text; color: parent.parent.ink; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
        }
    }
    component Pet: Rectangle {
        property string tint: "mint"
        property bool sleepy: false
        property int size: 44
        implicitWidth: size; implicitHeight: size; radius: size / 2
        Layout.preferredWidth: size; Layout.preferredHeight: size
        color: win.pets[tint] || "#9ee2c6"
        Row {
            anchors.centerIn: parent
            spacing: parent.size * 0.16
            Repeater {
                model: 2
                Rectangle { width: parent.parent.sleepy ? parent.parent.size * 0.17 : parent.parent.size * 0.11; height: parent.parent.sleepy ? 2 : parent.parent.size * 0.11; radius: height / 2; color: "#1d1d1f" }
            }
        }
    }
    component BrainBadge: Rectangle {
        property bool coder: false
        implicitWidth: bb.implicitWidth + 18; implicitHeight: 22; radius: 11
        color: Theme.surface; border.width: 1; border.color: Theme.line
        Row {
            id: bb
            anchors.centerIn: parent
            spacing: 5
            Icon { anchors.verticalCenter: parent.verticalCenter; name: parent.parent.coder ? "logo-claude" : "bot"; size: 13; color: parent.parent.coder ? "#d97757" : Theme.ai }
            Text { textFormat: Text.PlainText; text: parent.parent.coder ? "Claude Code" : "SIOS"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
        }
    }
    component Meter: ColumnLayout {
        property string label
        property string value
        property real frac: 0
        property color tint: Theme.accent
        Layout.fillWidth: true
        spacing: 6
        RowLayout {
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: parent.parent.label; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            Text { textFormat: Text.PlainText; text: parent.parent.value; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
        }
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 6; radius: 3; color: Theme.surface3
            Rectangle { width: parent.width * Math.max(0, Math.min(1, parent.parent.frac)); height: 6; radius: 3; color: parent.parent.frac >= 1 ? Theme.danger : parent.parent.tint }
        }
    }
    component Note: Rectangle {
        property string icon
        property string text
        property color tint: Theme.fg3
        Layout.fillWidth: true
        implicitHeight: nt.implicitHeight + 18
        radius: 10
        color: Theme.surface2
        RowLayout {
            anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 12 }
            spacing: 8
            Icon { name: parent.parent.icon; size: 14; color: parent.parent.tint }
            Text { id: nt; Layout.fillWidth: true; textFormat: Text.PlainText; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight; text: parent.parent.text; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
        }
    }
    component Box: Rectangle {
        default property alias content: bx.data
        Layout.fillWidth: true
        implicitHeight: bx.implicitHeight + 28
        radius: 14
        color: Theme.surface
        border.width: 1
        border.color: Theme.line
        ColumnLayout { id: bx; anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 } spacing: 12 }
    }
    component Seg: Row {
        id: sg
        property var options: []    // [[value, label], ...]
        property var value
        signal picked(var v)
        Repeater {
            model: sg.options
            delegate: Rectangle {
                required property var modelData
                required property int index
                readonly property bool on: sg.value === modelData[0]
                width: sl.implicitWidth + 26; height: 32
                color: on ? Theme.accent : Theme.surface
                border.width: 1; border.color: Theme.lineStrong
                radius: 0
                Text { id: sl; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData[1]; color: parent.on ? "white" : Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: parent.on ? Font.DemiBold : Font.Normal }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: sg.picked(modelData[0]) }
            }
        }
    }
    component Field: Rectangle {
        property alias text: tf.text
        property alias placeholder: tf.placeholderText
        property alias field: tf
        signal accepted()
        Layout.fillWidth: true
        implicitHeight: 38; radius: 10
        color: Theme.surface; border.width: 1; border.color: tf.activeFocus ? Theme.accent : Theme.lineStrong
        QQC2.TextField {
            id: tf
            anchors { fill: parent; leftMargin: 12; rightMargin: 8 }
            leftPadding: 0
            placeholderTextColor: Theme.fg3; color: Theme.fg; background: null
            font.family: Theme.ui; font.pixelSize: 14
            onAccepted: parent.accepted()
        }
    }
    component Tab: Text {
        property string key
        readonly property bool on: win.tab === key
        leftPadding: 12; rightPadding: 12; topPadding: 5; bottomPadding: 5
        color: on ? Theme.accent : Theme.fg2
        font.family: Theme.ui; font.pixelSize: 13; font.weight: on ? Font.DemiBold : Font.Normal
        Rectangle { z: -1; anchors.fill: parent; radius: height / 2; color: parent.on ? Theme.accentSoft : "transparent" }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.tab = parent.key }
    }
    component Title: ColumnLayout {
        property string title
        property string sub
        Layout.fillWidth: true
        spacing: 6
        Text { textFormat: Text.PlainText; text: parent.title; color: Theme.fg; font.family: Theme.display; font.pixelSize: 34; font.weight: Font.DemiBold }
        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: parent.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 15 }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ---- side list
        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 240
            color: Theme.sidebar
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }
            ColumnLayout {
                anchors { fill: parent; margins: 16; topMargin: 26; bottomMargin: 18 }
                spacing: 3
                Text { text: "Agents"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 30; font.weight: Font.DemiBold; Layout.leftMargin: 10; Layout.bottomMargin: 14 }
                NavItem { icon: "bot"; tile: "#c1457d"; label: "Team"; key: "agents" }
                NavItem { icon: "inbox"; tile: "#3b74bf"; label: "Inbox"; key: "inbox"; count: win.unread }
                NavItem { icon: "activity"; tile: "#dc7637"; label: "Activity"; key: "activity" }
                NavItem { icon: "shield-check"; tile: "#4d7a52"; label: "Permissions"; key: "permissions" }
                Item { Layout.fillHeight: true }
                Text {
                    Layout.leftMargin: 6
                    readonly property int busy: win.agents.filter(a => a.run).length
                    textFormat: Text.PlainText
                    text: busy + " working · " + (win.agents.length - busy) + " resting"
                    color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
                }
                // Stop is always one click and never asks (D41)
                Rectangle {
                    Layout.fillWidth: true
                    Layout.topMargin: 8
                    implicitHeight: 40
                    radius: 20
                    color: stopM.containsMouse ? Theme.dangerSoft : Theme.surface
                    border.width: 1
                    border.color: Qt.rgba(Theme.danger.r, Theme.danger.g, Theme.danger.b, 0.4)
                    RowLayout {
                        anchors.centerIn: parent
                        spacing: 8
                        Icon { name: "octagon-x"; size: 15; color: Theme.danger }
                        Text { textFormat: Text.PlainText; text: broker.status.stopped ? "All AI is stopped" : "Stop all AI"; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                    }
                    MouseArea { id: stopM; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; enabled: !broker.status.stopped; onClicked: win.ask("ai.stop", {}, "All AI stopped", "Couldn't stop", "Resume from the approval window.") }
                }
            }
        }

        // ---- pages
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // ===== Team
            Flickable {
                id: teamPage
                visible: win.page === "agents" && !win.current
                anchors.fill: parent
                contentHeight: tc.implicitHeight + 60
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                ColumnLayout {
                    id: tc
                    x: 40; y: 30
                    width: teamPage.width - 80
                    spacing: 18
                    RowLayout {
                        Title { title: "Your team"; sub: "Each agent is its own identity with its own desk. The broker checks every step; you can stop any of them at any time." }
                        Button { Layout.alignment: Qt.AlignTop; text: "New agent"; onClicked: newAgent.open() }
                    }
                    Text { visible: !broker.reachable; text: "SIOS's broker isn't running."; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13 }
                    GridLayout {
                        Layout.fillWidth: true
                        columns: width > 1000 ? 3 : 2
                        columnSpacing: 16
                        rowSpacing: 16
                        Repeater {
                            model: win.agents
                            delegate: Rectangle {
                                id: card
                                required property var modelData
                                readonly property var a: modelData
                                readonly property bool coder: a.brain === "claude-code"
                                readonly property var r: win.runOf(a)
                                readonly property var st: win.stateOf(a)
                                readonly property var last: win.reports.find(x => x.agent === a.id)
                                Layout.fillWidth: true
                                Layout.preferredWidth: 1
                                Layout.alignment: Qt.AlignTop
                                implicitHeight: cc.implicitHeight + 36
                                radius: 16
                                color: Theme.surface
                                border.width: 1
                                border.color: a.run ? Theme.accent : Theme.line
                                ColumnLayout {
                                    id: cc
                                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 18 }
                                    spacing: 14
                                    RowLayout {
                                        spacing: 12
                                        Pet { tint: card.a.color; sleepy: !card.a.active }
                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 3
                                            RowLayout {
                                                spacing: 8
                                                Text { textFormat: Text.PlainText; text: card.a.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 16; font.weight: Font.DemiBold }
                                                BrainBadge { coder: card.coder }
                                            }
                                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: card.a.run && card.r ? card.r.task : win.jobText(card.a); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                                        }
                                        Pill { Layout.alignment: Qt.AlignTop; text: card.st[0]; kind: card.st[1]; dot: !!card.a.run }
                                    }
                                    Meter { visible: card.coder && win.leftOf(card.a) > 0; label: "Time left"; value: win.span(win.leftOf(card.a)); frac: 1 - win.leftOf(card.a) / Math.max(win.leftOf(card.a), 2 * 3600) }
                                    Meter {
                                        visible: card.coder
                                        tint: "#c1457d"
                                        readonly property bool task: !!card.a.run && !!card.r
                                        label: task ? "Tokens this task" : "Tokens today"
                                        value: task ? win.tok(card.r.tokens) + " of " + win.tok(card.a.max_task_tokens) : win.tok(win.dayTokens(card.a)) + " of " + win.tok(card.a.max_day_tokens)
                                        frac: task ? card.r.tokens / Math.max(1, card.a.max_task_tokens) : win.dayTokens(card.a) / Math.max(1, card.a.max_day_tokens)
                                    }
                                    Note {
                                        icon: card.last && card.last.failed ? "circle-alert" : card.last ? "check" : "clock"
                                        tint: card.last && card.last.failed ? Theme.danger : card.last ? Theme.ok : Theme.fg3
                                        text: !card.a.active ? "Paused by you." : card.last ? win.ago(card.last.at) + ": " + card.last.text : card.coder ? "No tasks yet. Open it to give it one." : "No reports yet."
                                    }
                                    RowLayout {
                                        spacing: 8
                                        Button { visible: card.coder; text: card.a.run ? "Watch" : "Open"; onClicked: { win.sel = card.a.id; win.tab = "now"; } }
                                        Button { visible: card.coder && !!card.a.run; text: "Open workspace"; kind: "plain"; onClicked: win.ask("agents.peek", { id: card.a.id }, "", "Couldn't open its desk") }
                                        Button { visible: !card.coder && card.a.active; text: "Run now"; onClicked: broker.brain("agents.run_now", { id: card.a.id }, card.a.name + " started|Couldn't start " + card.a.name + "|") }
                                        Button { visible: !card.coder; text: card.a.active ? "Pause" : "Resume"; kind: "plain"; onClicked: win.ask("agents.update", { id: card.a.id, active: !card.a.active }, card.a.active ? card.a.name + " paused" : card.a.name + " is on again", "Couldn't change " + card.a.name) }
                                        Button { visible: !card.coder; text: "Details"; kind: "plain"; onClicked: { win.sel = card.a.id; win.tab = "now"; } }
                                        Item { Layout.fillWidth: true }
                                        Button { visible: !!card.a.run; text: "Stop"; kind: "danger"; onClicked: win.ask("agents.stop", { id: card.a.id }, card.a.name + " stopped", "Couldn't stop " + card.a.name, "Its copy of the project and its session are kept.") }
                                    }
                                }
                            }
                        }
                        // the dashed card that makes a new agent
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.preferredWidth: 1
                            Layout.alignment: Qt.AlignTop
                            implicitHeight: 220
                            radius: 16
                            color: nm.containsMouse ? Theme.surface2 : "transparent"
                            border.width: 1.5
                            border.color: Theme.lineStrong
                            ColumnLayout {
                                anchors.centerIn: parent
                                spacing: 8
                                Rectangle { Layout.alignment: Qt.AlignHCenter; implicitWidth: 44; implicitHeight: 44; radius: 22; color: Theme.surface3; Icon { anchors.centerIn: parent; name: "plus"; size: 20; color: Theme.fg2 } }
                                Text { Layout.alignment: Qt.AlignHCenter; text: "New agent"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14 }
                                Text { Layout.alignment: Qt.AlignHCenter; text: "Claude Code for building things, SIOS for tidying and reminders"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            }
                            MouseArea { id: nm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: newAgent.open() }
                        }
                    }
                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Claude Code agents can still reach the internet freely (that limit comes later). They only ever touch their own copy of a project."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                }
            }

            // ===== One agent
            ColumnLayout {
                id: agentPage
                visible: win.page === "agents" && !!win.current
                anchors.fill: parent
                spacing: 0
                readonly property var a: win.current || ({})
                readonly property bool coder: a.brain === "claude-code"
                readonly property var r: win.current ? win.runOf(a) : undefined
                // the bar on top: where you are, and the agent's three parts
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 52
                    color: Theme.surface
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.surface3 }
                    RowLayout {
                        anchors { fill: parent; leftMargin: 24; rightMargin: 20 }
                        spacing: 6
                        Text { text: "Team"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.sel = "" } }
                        Icon { name: "chevron-right"; size: 13; color: Theme.fg3 }
                        Text { textFormat: Text.PlainText; text: agentPage.a.name || ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                        Item { Layout.fillWidth: true }
                        Tab { key: "now"; text: "Now" }
                        Tab { key: "history"; text: "Activity" }
                        Tab { key: "setup"; text: "Settings" }
                    }
                }

                // --- Now: details beside the live output
                RowLayout {
                    visible: win.tab === "now"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 0
                    Flickable {
                        Layout.preferredWidth: 340
                        Layout.fillHeight: true
                        contentHeight: leftCol.implicitHeight + 48
                        clip: true
                        boundsBehavior: Flickable.StopAtBounds
                        ColumnLayout {
                            id: leftCol
                            x: 24; y: 24
                            width: 292
                            spacing: 16
                            RowLayout {
                                spacing: 14
                                Pet { tint: agentPage.a.color || "mint"; size: 56; sleepy: !agentPage.a.active }
                                ColumnLayout {
                                    spacing: 4
                                    Text { textFormat: Text.PlainText; text: agentPage.a.name || ""; color: Theme.fg; font.family: Theme.display; font.pixelSize: 26; font.weight: Font.DemiBold }
                                    RowLayout { spacing: 6; BrainBadge { coder: agentPage.coder } Pill { text: win.current ? win.stateOf(agentPage.a)[0] : ""; kind: win.current ? win.stateOf(agentPage.a)[1] : "muted"; dot: !!agentPage.a.run } }
                                }
                            }
                            ColumnLayout {
                                spacing: 8
                                RowLayout { spacing: 8; Icon { name: "folder-open"; size: 15; color: Theme.fg3 } Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: agentPage.coder ? agentPage.a.folder : win.jobText(agentPage.a); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } }
                                RowLayout { visible: agentPage.coder; spacing: 8; Icon { name: "git-branch"; size: 15; color: Theme.fg3 } Text { textFormat: Text.PlainText; text: "Its own copy, branch sios/" + String(agentPage.a.id || "").replace("agent:", ""); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } }
                            }
                            Box {
                                visible: agentPage.coder
                                Meter { label: "Time left"; value: win.leftOf(agentPage.a) > 0 ? win.span(win.leftOf(agentPage.a)) : "none"; frac: win.leftOf(agentPage.a) > 0 ? 1 - win.leftOf(agentPage.a) / Math.max(win.leftOf(agentPage.a), 2 * 3600) : 1 }
                                Flow {
                                    Layout.fillWidth: true
                                    spacing: 6
                                    Button { text: win.leftOf(agentPage.a) > 0 ? "+1 hour" : "Let it work 2 h"; kind: "plain"; onClicked: win.ask("agents.lease", win.leftOf(agentPage.a) > 0 ? { id: agentPage.a.id, hours: 1, add: true } : { id: agentPage.a.id, hours: 2 }, "More time for " + agentPage.a.name, "Couldn't give it more time") }
                                    Button { visible: !!agentPage.a.run; text: "Stop"; kind: "danger"; onClicked: win.ask("agents.stop", { id: agentPage.a.id }, agentPage.a.name + " stopped", "Couldn't stop " + agentPage.a.name, "Its copy of the project and its session are kept.") }
                                }
                            }
                            Box {
                                visible: agentPage.coder
                                Meter {
                                    label: "Tokens this task"; tint: "#c1457d"
                                    value: agentPage.r ? win.tok(agentPage.r.tokens) + " of " + win.tok(agentPage.a.max_task_tokens) : "no task yet"
                                    frac: agentPage.r ? agentPage.r.tokens / Math.max(1, agentPage.a.max_task_tokens) : 0
                                }
                                Meter { label: "Tokens today"; tint: "#c1457d"; value: win.current ? win.tok(win.dayTokens(agentPage.a)) + " of " + win.tok(agentPage.a.max_day_tokens) : ""; frac: win.current ? win.dayTokens(agentPage.a) / Math.max(1, agentPage.a.max_day_tokens) : 0 }
                                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "SIOS counts what Claude Code reports and stops it at the limit."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            }
                            Box {
                                visible: agentPage.coder && !!agentPage.r && agentPage.r.files.length > 0
                                Text { textFormat: Text.PlainText; text: agentPage.r ? agentPage.r.files.length + (agentPage.r.files.length === 1 ? " file changed" : " files changed") : ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                Repeater {
                                    model: agentPage.r ? agentPage.r.files.slice(0, 6) : []
                                    delegate: Text { required property string modelData; Layout.fillWidth: true; elide: Text.ElideMiddle; textFormat: Text.PlainText; text: modelData; color: Theme.fg2; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                }
                            }
                            Button { visible: agentPage.coder && !!agentPage.a.run; text: "Open workspace"; onClicked: win.ask("agents.peek", { id: agentPage.a.id }, "", "Couldn't open its desk") }
                        }
                    }
                    Rectangle { Layout.fillHeight: true; implicitWidth: 1; color: Theme.line }

                    // the live output: for a coding agent, what it does step by step;
                    // for a SIOS agent, its reports
                    ColumnLayout {
                        id: logView
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        spacing: 0
                        property var data_: ({})
                        property bool follow: true
                        readonly property var entries: agentPage.coder ? (data_.agent && data_.agent.id === agentPage.a.id ? data_.log || [] : []) : win.reports.filter(x => x.agent === agentPage.a.id).slice().reverse().map(x => ({ kind: x.failed ? "failed" : x.kind === "question" ? "ask" : "report", text: x.text, at: x.at }))
                        function load() { if (agentPage.coder && win.current) broker.look("agents.log", { id: agentPage.a.id }, "log"); }
                        Timer { interval: 1500; repeat: true; running: logView.visible && agentPage.coder && !!agentPage.a.run; triggeredOnStart: true; onTriggered: logView.load() }
                        onVisibleChanged: load()
                        Connections { target: win; function onSelChanged() { logView.data_ = ({}); logView.load(); } }
                        RowLayout {
                            Layout.fillWidth: true
                            Layout.margins: 18
                            Layout.leftMargin: 24
                            Layout.rightMargin: 24
                            spacing: 10
                            Text { textFormat: Text.PlainText; text: agentPage.coder ? "Live output" : "Reports"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                            Text { textFormat: Text.PlainText; text: agentPage.a.run && agentPage.r ? "working for " + win.span(win.now - agentPage.r.started) : agentPage.r ? "last task " + win.ago(agentPage.r.started) : ""; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            Item { Layout.fillWidth: true }
                            Text { visible: agentPage.coder; text: "Follows along"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            Rectangle {
                                visible: agentPage.coder
                                implicitWidth: 34; implicitHeight: 20; radius: 10
                                color: logView.follow ? Theme.accent : Theme.lineStrong
                                Rectangle { width: 16; height: 16; radius: 8; y: 2; x: logView.follow ? 16 : 2; color: "white" }
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: logView.follow = !logView.follow }
                            }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.surface3 }
                        ListView {
                            id: lines
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            topMargin: 10; bottomMargin: 10; leftMargin: 24; rightMargin: 24
                            spacing: 4
                            model: logView.entries
                            onCountChanged: if (logView.follow) Qt.callLater(positionViewAtEnd)
                            QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                            delegate: RowLayout {
                                id: ln
                                required property var modelData
                                readonly property string k: modelData.kind
                                width: lines.width - 48
                                spacing: 10
                                readonly property var look: ({
                                    start: ["play", Theme.fg3, ""], say: ["message-square", Theme.fg2, ""], read: ["eye", Theme.fg2, "Read "],
                                    "new": ["file-plus", Theme.ok, "Made "], edit: ["file-pen", Theme.fg2, "Edited "], run: ["terminal", Theme.fg2, "Ran "],
                                    search: ["search", Theme.fg2, "Looked for "], ask: ["shield-check", Theme.warn, "Asks you: "], report: ["check", Theme.ok, "Reported: "],
                                    tool: ["plug", Theme.fg2, "Used "], done: ["circle-check", Theme.ok, "Done: "], failed: ["circle-alert", Theme.danger, "Stopped: "],
                                    progress: ["check", Theme.ok, "Reported: "], question: ["shield-check", Theme.warn, "Asks you: "]
                                })[k] || ["check", Theme.fg2, ""]
                                Rectangle { Layout.alignment: Qt.AlignTop; Layout.topMargin: 6; implicitWidth: 24; implicitHeight: 24; radius: 7; color: Theme.surface3; Icon { anchors.centerIn: parent; name: ln.look[0]; size: 13; color: ln.look[1] } }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    Layout.topMargin: 8
                                    Layout.bottomMargin: 4
                                    spacing: 6
                                    Text {
                                        Layout.fillWidth: true
                                        wrapMode: Text.Wrap
                                        textFormat: Text.PlainText
                                        text: ln.look[2] + (ln.modelData.text || "")
                                        color: ln.k === "say" ? Theme.fg : ln.k === "failed" ? Theme.danger : Theme.fg
                                        font.family: ["read", "new", "edit", "run", "search"].indexOf(ln.k) >= 0 ? "JetBrains Mono" : Theme.ui
                                        font.pixelSize: ["read", "new", "edit", "run", "search"].indexOf(ln.k) >= 0 ? 12 : 13
                                        font.weight: ["ask", "done"].indexOf(ln.k) >= 0 ? Font.DemiBold : Font.Normal
                                    }
                                    // what a command printed, its last lines
                                    Rectangle {
                                        visible: !!ln.modelData.detail
                                        Layout.fillWidth: true
                                        implicitHeight: dt.implicitHeight + 16
                                        radius: 8
                                        color: "#1f2328"
                                        Text { id: dt; anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 10 } wrapMode: Text.WrapAnywhere; textFormat: Text.PlainText; text: ln.modelData.detail || ""; color: ln.modelData.failed ? "#f4b0a6" : "#d6dbe0"; font.family: "JetBrains Mono"; font.pixelSize: 11 }
                                    }
                                    Text { visible: ln.k === "ask"; textFormat: Text.PlainText; text: "Answer in the box below; it continues from there."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                }
                            }
                            Text {
                                anchors.centerIn: parent
                                visible: lines.count === 0
                                width: 380; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
                                textFormat: Text.PlainText
                                text: agentPage.coder ? (win.leftOf(agentPage.a) > 0 ? "Nothing yet. Give it a task below and its work shows here as it happens." : "Let it work first (asks for your password), then give it a task.") : "Nothing reported yet."
                                color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13
                            }
                        }
                        Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.surface3 }
                        // the next task
                        ColumnLayout {
                            visible: agentPage.coder
                            Layout.fillWidth: true
                            Layout.margins: 16
                            Layout.leftMargin: 24
                            Layout.rightMargin: 24
                            spacing: 8
                            Rectangle {
                                Layout.fillWidth: true
                                implicitHeight: 48; radius: 14
                                color: Theme.surface; border.width: 1; border.color: taskIn.activeFocus ? Theme.accent : Theme.lineStrong
                                opacity: taskIn.enabled ? 1 : 0.6
                                RowLayout {
                                    anchors { fill: parent; leftMargin: 14; rightMargin: 7 }
                                    QQC2.TextField {
                                        id: taskIn
                                        Layout.fillWidth: true
                                        enabled: !agentPage.a.run && win.leftOf(agentPage.a) > 0 && !!agentPage.a.active
                                        leftPadding: 0; background: null
                                        placeholderText: agentPage.a.run ? (agentPage.a.name || "") + " is working; the next task can start when it's done" : win.leftOf(agentPage.a) > 0 ? "Tell " + (agentPage.a.name || "it") + " what to do next…" : "Let it work first to give it tasks"
                                        placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14
                                        onAccepted: send.go()
                                    }
                                    Rectangle {
                                        id: send
                                        implicitWidth: 34; implicitHeight: 34; radius: 17
                                        color: taskIn.text.trim() && taskIn.enabled ? Theme.accent : Theme.lineStrong
                                        Icon { anchors.centerIn: parent; name: "arrow-up"; size: 16; color: "white" }
                                        function go() {
                                            if (!taskIn.text.trim() || !taskIn.enabled) return;
                                            win.ask("agents.run", { id: agentPage.a.id, task: taskIn.text.trim() }, agentPage.a.name + " started", "Couldn't start " + agentPage.a.name, "Its work shows here as it happens.");
                                            taskIn.text = "";
                                            logView.follow = true;
                                        }
                                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: send.go() }
                                        Accessible.role: Accessible.Button
                                        Accessible.name: "Send"
                                    }
                                }
                            }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "Continues the same conversation. What the agent writes is shown as text; SIOS never takes it as instructions."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                    }
                }

                // --- Activity: its tasks, tokens and changes
                Flickable {
                    id: hist
                    visible: win.tab === "history"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    contentHeight: hc.implicitHeight + 48
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                    readonly property var mine: win.runs.filter(r => r.agent === agentPage.a.id)
                    readonly property var week: mine.filter(r => r.started > win.now - 7 * 86400)
                    ColumnLayout {
                        id: hc
                        x: 32; y: 24
                        width: hist.width - 64
                        spacing: 16
                        RowLayout {
                            spacing: 12
                            Repeater {
                                model: [
                                    [hist.week.length, "tasks this week"],
                                    [win.tok(hist.week.reduce((s, r) => s + (r.tokens || 0), 0)), "tokens this week"],
                                    [[...new Set(hist.week.reduce((all, r) => all.concat(r.files || []), []))].length, "files changed"],
                                    [hist.week.reduce((s, r) => s + (r.commands || 0), 0), "commands run"],
                                    [win.span(hist.week.reduce((s, r) => s + ((r.ended || win.now) - r.started), 0)), "time working"]
                                ]
                                delegate: Rectangle {
                                    required property var modelData
                                    Layout.fillWidth: true
                                    implicitHeight: 74; radius: 14
                                    color: Theme.surface; border.width: 1; border.color: Theme.line
                                    ColumnLayout {
                                        anchors { left: parent.left; verticalCenter: parent.verticalCenter; leftMargin: 16 }
                                        spacing: 0
                                        Text { textFormat: Text.PlainText; text: String(modelData[0]); color: Theme.fg; font.family: Theme.display; font.pixelSize: 26; font.weight: Font.DemiBold }
                                        Text { textFormat: Text.PlainText; text: modelData[1]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                                    }
                                }
                            }
                        }
                        ColumnLayout {
                            spacing: 16
                            Layout.fillWidth: true
                            // every task, newest first
                            Rectangle {
                                Layout.fillWidth: true
                                Layout.alignment: Qt.AlignTop
                                implicitHeight: tl.implicitHeight
                                radius: 14; color: Theme.surface; border.width: 1; border.color: Theme.line
                                clip: true
                                ColumnLayout {
                                    id: tl
                                    width: parent.width
                                    spacing: 0
                                    Rectangle { Layout.fillWidth: true; implicitHeight: 44; radius: 14; color: Theme.surface2; Text { anchors { left: parent.left; verticalCenter: parent.verticalCenter; leftMargin: 16 } text: "Tasks"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold } }
                                    Repeater {
                                        model: hist.mine.slice(0, 30)
                                        delegate: Rectangle {
                                            required property var modelData
                                            Layout.fillWidth: true
                                            implicitHeight: 48
                                            color: "transparent"
                                            Rectangle { width: parent.width; height: 1; color: Theme.surface3 }
                                            RowLayout {
                                                anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
                                                spacing: 12
                                                Text { Layout.preferredWidth: 92; textFormat: Text.PlainText; text: win.ago(modelData.started); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                                                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.task; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                                                Text { Layout.preferredWidth: 64; textFormat: Text.PlainText; text: win.span((modelData.ended || win.now) - modelData.started); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                                                Text { Layout.preferredWidth: 48; textFormat: Text.PlainText; text: win.tok(modelData.tokens); color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                                Text { Layout.preferredWidth: 54; textFormat: Text.PlainText; text: (modelData.files || []).length + " files"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                                                Item {
                                                    // a fixed column, so the others line up whatever the result says
                                                    Layout.preferredWidth: 160
                                                    implicitHeight: 24
                                                Pill {
                                                    anchors.right: parent.right
                                                    readonly property string s: modelData.state
                                                    text: ({ working: "Working", done: "Done", failed: "Didn't finish", "stopped: task limit": "Stopped: task limit", "stopped: day limit": "Stopped: day limit", "stopped: time": "Stopped: time ran out", "stopped: you": "Stopped by you" })[s] || s
                                                    kind: s === "working" || s === "done" ? "ok" : s === "failed" ? "danger" : "warn"
                                                    dot: s === "working"
                                                }
                                                }
                                            }
                                        }
                                    }
                                    Text { visible: hist.mine.length === 0; Layout.margins: 16; text: "No tasks yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                                }
                            }
                            // tokens for each of the last 7 days
                            Rectangle {
                                Layout.fillWidth: true
                                implicitHeight: tk.implicitHeight + 28
                                radius: 14; color: Theme.surface; border.width: 1; border.color: Theme.line
                                ColumnLayout {
                                    id: tk
                                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                                    spacing: 10
                                    Text { text: "Tokens per day"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                    RowLayout {
                                        id: bars
                                        Layout.fillWidth: true
                                        spacing: 8
                                        readonly property var days: [6, 5, 4, 3, 2, 1, 0].map(d => {
                                            const start = new Date(); start.setHours(0, 0, 0, 0); const t0 = start.getTime() / 1000 - d * 86400;
                                            return [d === 0 ? "Today" : new Date(t0 * 1000).toLocaleDateString(Qt.locale(), "ddd"), hist.mine.filter(r => r.started >= t0 && r.started < t0 + 86400).reduce((s, r) => s + (r.tokens || 0), 0)];
                                        })
                                        readonly property real peak: Math.max(1, ...days.map(d => d[1]))
                                        Repeater {
                                            model: bars.days
                                            delegate: ColumnLayout {
                                                required property var modelData
                                                required property int index
                                                Layout.fillWidth: true
                                                Layout.preferredWidth: 1
                                                spacing: 6
                                                Item {
                                                    Layout.fillWidth: true
                                                    implicitHeight: 90
                                                    Rectangle { anchors.bottom: parent.bottom; anchors.horizontalCenter: parent.horizontalCenter; width: Math.min(parent.width, 56); height: Math.max(2, 90 * modelData[1] / bars.peak); radius: 4; color: index === 6 ? "#c1457d" : Qt.rgba(0.76, 0.27, 0.49, 0.3) }
                                                }
                                                Text { Layout.alignment: Qt.AlignHCenter; textFormat: Text.PlainText; text: modelData[0]; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11 }
                                            }
                                        }
                                    }
                                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "Limits: " + win.tok(agentPage.a.max_task_tokens) + " per task, " + win.tok(agentPage.a.max_day_tokens) + " per 24 hours. SIOS stops it at either."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                }
                            }
                        }
                    }
                }

                // --- Settings: what it does, its limits, pause, sign in, remove
                Flickable {
                    id: setup
                    visible: win.tab === "setup"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    contentHeight: sc.implicitHeight + 48
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    property var taskTok: 0
                    property var dayTok: 0
                    onVisibleChanged: if (visible) { taskTok = agentPage.a.max_task_tokens; dayTok = agentPage.a.max_day_tokens; what.text = agentPage.a.instructions || ""; }
                    ColumnLayout {
                        id: sc
                        x: Math.max(32, (setup.width - 680) / 2); y: 28
                        width: Math.min(680, setup.width - 64)
                        spacing: 16
                        Box {
                            Text { text: "What it does"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                            Field { id: what }
                            RowLayout {
                                visible: agentPage.coder
                                spacing: 18
                                ColumnLayout { spacing: 6; Text { text: "Tokens per task"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } Seg { options: [[500000, "500k"], [1000000, "1M"], [2000000, "2M"], [5000000, "5M"]]; value: setup.taskTok; onPicked: v => setup.taskTok = v } }
                                ColumnLayout { spacing: 6; Text { text: "Per 24 hours"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } Seg { options: [[2000000, "2M"], [6000000, "6M"], [20000000, "20M"]]; value: setup.dayTok; onPicked: v => setup.dayTok = v } }
                            }
                            RowLayout {
                                Item { Layout.fillWidth: true }
                                Button {
                                    text: "Save"
                                    onClicked: {
                                        const p = { id: agentPage.a.id, instructions: what.text };
                                        if (agentPage.coder) { p.max_task_tokens = setup.taskTok; p.max_day_tokens = Math.max(setup.dayTok, setup.taskTok); }
                                        win.ask("agents.update", p, "Saved", "Couldn't save " + agentPage.a.name);
                                    }
                                }
                            }
                        }
                        Box {
                            visible: agentPage.coder
                            Text { text: "Its workspace"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Claude Code signs in once, inside its own sandbox, with its own account. A folder that isn't a git project needs to become one first, so the agent can work on its own branch."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            Flow {
                                Layout.fillWidth: true
                                spacing: 8
                                Button { text: "Sign it in"; kind: "plain"; onClicked: win.ask("agents.signin", { id: agentPage.a.id }, "A terminal opened in its workspace", "Couldn't open its workspace", "Type /login there and follow the steps.") }
                                Button { text: "Make it a git project"; kind: "plain"; onClicked: win.ask("agents.git_init", { id: agentPage.a.id }, "It's a git project now", "Couldn't make it a git project") }
                            }
                        }
                        Box {
                            Text { textFormat: Text.PlainText; text: agentPage.a.active ? "Pause or remove" : "It's paused"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "Pausing keeps it and its work; it does nothing until you resume it. Removing ends its identity, its passes and its reports."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            RowLayout {
                                spacing: 8
                                Button { text: agentPage.a.active ? "Pause" : "Resume"; kind: "plain"; onClicked: win.ask("agents.update", { id: agentPage.a.id, active: !agentPage.a.active }, agentPage.a.active ? agentPage.a.name + " paused" : agentPage.a.name + " is on again", "Couldn't change " + agentPage.a.name) }
                                Item { Layout.fillWidth: true }
                                Button { text: "Remove " + (agentPage.a.name || ""); kind: "danger"; onClicked: { win.ask("agents.remove", { id: agentPage.a.id }, agentPage.a.name + " removed", "Couldn't remove " + agentPage.a.name); } }
                            }
                        }
                    }
                }
            }

            // ===== Inbox
            ColumnLayout {
                visible: win.page === "inbox"
                anchors { fill: parent; margins: 40; topMargin: 30 }
                spacing: 18
                RowLayout {
                    Title { title: "Inbox"; sub: "What your agents reported. Their words are shown as data; nothing in them is ever followed as an instruction." }
                    Button { Layout.alignment: Qt.AlignTop; visible: win.unread > 0; text: "Mark all read"; kind: "plain"; onClicked: win.ask("reports.read", {}, "Marked read", "Couldn't mark them read") }
                }
                ListView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 10
                    model: win.reports
                    delegate: Rectangle {
                        required property var modelData
                        width: ListView.view.width
                        implicitHeight: rc.implicitHeight + 28
                        radius: 14
                        color: modelData.read ? Theme.surface : Theme.accentSoft
                        border.width: 1
                        border.color: Theme.line
                        RowLayout {
                            id: rc
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                            spacing: 12
                            Pet { Layout.alignment: Qt.AlignTop; size: 34; tint: (win.agents.find(a => a.id === modelData.agent) || {}).color || "slate" }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 4
                                RowLayout {
                                    spacing: 8
                                    Text { textFormat: Text.PlainText; text: win.nameOf(modelData.agent); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                    Pill { text: modelData.kind === "question" ? "Asks you" : modelData.failed ? "Didn't finish" : modelData.kind === "done" ? "Done" : modelData.kind === "run" ? "Started" : "Progress"; kind: modelData.failed ? "danger" : modelData.kind === "question" ? "warn" : "muted" }
                                    Item { Layout.fillWidth: true }
                                    Text { textFormat: Text.PlainText; text: win.ago(modelData.at); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                }
                                // the agent's own words: plain text, never rich text or links
                                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: modelData.text; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            }
                        }
                    }
                    Text { anchors.centerIn: parent; visible: parent.count === 0; text: "Nothing reported yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                }
            }

            // ===== Activity (the broker's log)
            ColumnLayout {
                visible: win.page === "activity"
                anchors { fill: parent; margins: 40; topMargin: 30 }
                spacing: 14
                Title { title: "Activity"; sub: "Every decision the broker made, newest first. The log is chained, so a changed line shows." }
                Flow {
                    Layout.fillWidth: true
                    spacing: 8
                    Repeater {
                        model: [""].concat([...new Set(broker.activity.map(e => e.principal.split(" ")[0]))].slice(0, 10))
                        delegate: Rectangle {
                            required property string modelData
                            readonly property bool on: win.filter === modelData
                            implicitWidth: fl.implicitWidth + 24; implicitHeight: 30; radius: 15
                            color: on ? Theme.accent : Theme.surface
                            border.width: 1; border.color: on ? Theme.accent : Theme.lineStrong
                            Text { id: fl; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData ? win.nameOf(modelData) : "Everyone"; color: parent.on ? "white" : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.filter = modelData }
                        }
                    }
                }
                ListView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 2
                    model: broker.activity.filter(e => !win.filter || e.principal.split(" ")[0] === win.filter).slice().reverse()
                    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                    delegate: Rectangle {
                        required property var modelData
                        width: ListView.view.width
                        implicitHeight: 44
                        radius: 8
                        color: hov.containsMouse ? Theme.surface2 : "transparent"
                        RowLayout {
                            anchors { fill: parent; leftMargin: 10; rightMargin: 10 }
                            spacing: 10
                            Text { Layout.preferredWidth: 84; textFormat: Text.PlainText; text: win.ago(modelData.at); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            Text { Layout.preferredWidth: 130; elide: Text.ElideRight; textFormat: Text.PlainText; text: win.nameOf(modelData.principal.split(" ")[0]); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.Medium }
                            Pill { text: modelData.decision; kind: ["blocked", "denied", "deny", "error"].indexOf(modelData.decision) >= 0 ? "danger" : modelData.decision === "asked" ? "warn" : "ok" }
                            Text { Layout.preferredWidth: 150; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.tool; color: Theme.fg2; font.family: "JetBrains Mono"; font.pixelSize: 11 }
                            Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.reason; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                        MouseArea { id: hov; anchors.fill: parent; hoverEnabled: true }
                    }
                }
            }

            // ===== Permissions
            ColumnLayout {
                visible: win.page === "permissions"
                anchors { fill: parent; margins: 40; topMargin: 30 }
                spacing: 18
                Title { title: "Permissions"; sub: "What each AI may do. Changes ask for your password; Stop all AI never does." }
                ListView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: 10
                    model: win.agents.map(a => ({ id: a.id, name: a.name, color: a.color, kind: a.brain === "claude-code" ? "Claude Code agent" : "SIOS agent", paused: !a.active, agent: true }))
                           .concat(win.apps.map(a => ({ id: a.id, name: a.name, kind: "Connected app", paused: a.paused, roles: a.roles, agent: false })))
                    delegate: Rectangle {
                        required property var modelData
                        width: ListView.view.width
                        implicitHeight: 68
                        radius: 14
                        color: Theme.surface
                        border.width: 1
                        border.color: Theme.line
                        RowLayout {
                            anchors { fill: parent; margins: 14 }
                            spacing: 12
                            Pet { visible: modelData.agent; size: 34; tint: modelData.color || "slate"; sleepy: modelData.paused }
                            Rectangle { visible: !modelData.agent; implicitWidth: 34; implicitHeight: 34; radius: 10; color: Theme.surface3; Icon { anchors.centerIn: parent; name: "square-terminal"; size: 17; color: Theme.fg2 } }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { textFormat: Text.PlainText; text: modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                Text { textFormat: Text.PlainText; text: modelData.kind + (modelData.roles && modelData.roles.length ? " · roles: " + modelData.roles.join(", ") : ""); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                            }
                            Pill { visible: modelData.paused; text: "Paused"; kind: "warn" }
                            Button {
                                text: modelData.paused ? "Resume" : "Pause"
                                kind: "plain"
                                onClicked: modelData.agent
                                    ? win.ask("agents.update", { id: modelData.id, active: modelData.paused }, modelData.paused ? modelData.name + " is on again" : modelData.name + " paused", "Couldn't change " + modelData.name)
                                    : win.ask(modelData.paused ? "resume" : "pause", { principal: modelData.id }, modelData.paused ? modelData.name + " resumed" : modelData.name + " paused", "Couldn't change " + modelData.name)
                            }
                        }
                    }
                    Text { anchors.centerIn: parent; visible: parent.count === 0; text: "No agents or connected apps yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                }
            }
        }
    }

    NewAgent { id: newAgent; transientParent: win }
    Notices { id: notices }
    Alert { id: alert; transientParent: win }
}
