// An agent's Workspace (D101, D107; docs/design/agent-workspace.html, approved).
// One window per agent, laid out from what it's doing:
//   left    its goal, its own plan, its questions, who gets its work next
//   middle  Live (what it does, as cards), Review (its changes: read, comment,
//           approve and merge), Desktop (its own desktop; after its trial)
//   right   the files in its copy (lit up as it reads or changes them), its
//           places, and what it was given (instructions, connections, memories)
// Everything an agent wrote is plain text, never followed. Merging and throwing
// work away ask for the owner's password (the broker does that).
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import QtQuick.Window

Window {
    id: ws
    property string agentId
    property var host                      // the Agents window: ask, confirm, helpers
    readonly property var a: (broker.team.agents || []).find(x => x.id === agentId) || ({})
    readonly property bool working: !!a.run
    readonly property var run: (broker.team.runs || []).find(r => r.agent === agentId)
    property string tab: "live"
    property var log_: []
    property var ctx: ({})
    property var changes: ({})
    property string changesErr: ""
    // its desktop (D109)
    property bool deskOn: false
    property bool deskBusy: false
    property string deskErr: ""
    property var deskInfo: ({})
    function deskAsk(what) {
        if (what === "start") { deskBusy = true; deskErr = ""; }
        broker.look("agents.desk", { id: agentId, do: what }, tag("desk-" + what));
    }
    width: 1440; height: 900
    minimumWidth: 1100; minimumHeight: 680
    title: (a.name || "Agent") + " · Workspace"
    color: Theme.surface

    function tag(t) { return "ws-" + t + "|" + agentId; }
    function load() {
        broker.look("agents.log", { id: agentId }, tag("log"));
        broker.look("agents.context", { id: agentId }, tag("ctx"));
    }
    function loadChanges() { changesErr = ""; broker.look("agents.changes", { id: agentId }, tag("changes")); }
    Connections {
        target: broker
        function onDone(t, ok, error) {
            if (t === ws.tag("log")) { if (!error) ws.log_ = ok.log || []; }
            else if (t === ws.tag("ctx")) { if (!error) ws.ctx = ok; }
            else if (t === ws.tag("changes")) { if (error) { ws.changesErr = error; ws.changes = ({}); } else ws.changes = ok; }
            else if (t.startsWith("ws-desk-") && t.endsWith("|" + ws.agentId)) {
                const what = t.slice(8, t.indexOf("|"));
                if (what === "start") ws.deskBusy = false;
                if (error) { if (what !== "status") ws.deskErr = error; ws.deskOn = false; deskView.close(); return; }
                if (what === "ticket") { ws.deskInfo = ok; deskView.open(ok.socket, ok.token); return; }
                ws.deskOn = !!ok.on;
                if (ws.deskOn && !deskView.connected) ws.deskAsk("ticket");
                if (!ws.deskOn) deskView.close();
            }
        }
    }
    Timer { interval: 1500; repeat: true; running: ws.visible && ws.working; onTriggered: ws.load() }
    onVisibleChanged: if (visible) { load(); if (tab === "review") loadChanges(); }
    onTabChanged: { if (tab === "review") loadChanges(); if (tab === "desktop") deskAsk("status"); }
    // closing the window lets go of the desktop's picture (the desktop itself keeps running)
    onClosing: deskView.close()

    // ---------------------------------------------------------------- small pieces
    component Lab: Text { textFormat: Text.PlainText; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6; font.capitalization: Font.AllUppercase }
    component Card: Rectangle {
        default property alias content: cc.data
        Layout.fillWidth: true
        implicitHeight: cc.implicitHeight + 26
        radius: 12; color: Theme.surface; border.width: 1; border.color: Theme.line
        ColumnLayout { id: cc; anchors { left: parent.left; right: parent.right; top: parent.top; margins: 13 } spacing: 6 }
    }
    component Chip: Rectangle {
        property string text
        property string kind: "muted"     // ok, warn, acc, muted, ai
        implicitWidth: ct.implicitWidth + 18; implicitHeight: 22; radius: 11
        color: kind === "ok" ? Theme.okSoft : kind === "warn" ? Theme.dangerSoft : kind === "acc" ? Theme.accentSoft : kind === "ai" ? Theme.aiSoft : Theme.surface3
        Text { id: ct; anchors.centerIn: parent; textFormat: Text.PlainText; text: parent.text; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold
               color: parent.kind === "ok" ? Theme.ok : parent.kind === "warn" ? Theme.warn : parent.kind === "acc" ? Theme.accent : parent.kind === "ai" ? Theme.aiInk : Theme.fg2 }
    }
    component Meter: ColumnLayout {
        property string label
        property string value
        property real frac
        property color tint: Theme.accent
        Layout.preferredWidth: 150
        Layout.maximumWidth: 150
        Layout.fillWidth: false
        spacing: 5
        RowLayout { Text { Layout.fillWidth: true; text: parent.parent.label; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 11 } Text { textFormat: Text.PlainText; text: parent.parent.value; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold } }
        Rectangle { Layout.fillWidth: true; implicitHeight: 5; radius: 3; color: Theme.surface3; Rectangle { width: parent.width * Math.max(0, Math.min(1, parent.parent.frac)); height: 5; radius: 3; color: parent.parent.tint } }
    }
    component CTab: Item {
        property string key
        property string label
        property int count: 0
        readonly property bool on: ws.tab === key
        implicitWidth: tr.implicitWidth + 28; implicitHeight: 46
        Row { id: tr; anchors.centerIn: parent; spacing: 7
            Text { textFormat: Text.PlainText; text: parent.parent.label; color: parent.parent.on ? Theme.fg : Theme.fg2; font.family: Theme.ui; font.pixelSize: 14; font.weight: parent.parent.on ? Font.DemiBold : Font.Normal }
            Rectangle { visible: parent.parent.count > 0; anchors.verticalCenter: parent.verticalCenter; width: cn.implicitWidth + 12; height: 18; radius: 9; color: parent.parent.on ? Theme.accentSoft : Theme.surface3
                Text { id: cn; anchors.centerIn: parent; text: parent.parent.parent.count; color: parent.parent.parent.on ? Theme.accent : Theme.fg2; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold } }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: parent.on ? Theme.accent : "transparent" }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: ws.tab = parent.key }
    }
    component Input: Rectangle {
        property alias text: tf.text
        property alias placeholder: tf.placeholderText
        property alias field: tf
        signal accepted()
        Layout.fillWidth: true
        implicitHeight: 34; radius: 9
        color: Theme.surface; border.width: 1; border.color: tf.activeFocus ? Theme.accent : Theme.lineStrong
        QQC2.TextField { id: tf; anchors { fill: parent; leftMargin: 10; rightMargin: 6 } leftPadding: 0; background: null; placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; onAccepted: parent.accepted() }
    }

    // files it touched in this run: path -> "read" | "new" | "edit"
    readonly property var touched: {
        const m = {};
        for (const e of log_) if (["read", "new", "edit"].indexOf(e.kind) >= 0 && e.text) m[e.text] = (m[e.text] === "edit" || m[e.text] === "new") ? m[e.text] : e.kind;
        return m;
    }
    readonly property var questions: (broker.team.reports || []).filter(r => r.agent === agentId && r.kind === "question" && !r.read).slice(0, 3)

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ------------------------------------------------------------ the bar
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 66
            color: Theme.surface
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors { fill: parent; leftMargin: 22; rightMargin: 20 }
                spacing: 14
                Pet { size: 38; tint: ws.a.color || "mint"; mood: ws.host ? ws.host.moodOf(ws.a) : "idle" }
                Text { textFormat: Text.PlainText; text: ws.a.name || ""; color: Theme.fg; font.family: Theme.display; font.pixelSize: 22; font.weight: Font.DemiBold }
                Rectangle {
                    implicitWidth: bb.implicitWidth + 18; implicitHeight: 24; radius: 12; color: Theme.surface; border.width: 1; border.color: Theme.line
                    readonly property var b: ws.host ? (ws.host.brains[ws.a.brain] || ws.host.brains["builtin"]) : ["bot", "", ""]
                    Row { id: bb; anchors.centerIn: parent; spacing: 6
                        Icon { anchors.verticalCenter: parent.verticalCenter; name: parent.parent.b[0]; size: 13; color: parent.parent.b[1] || Theme.fg }
                        Text { textFormat: Text.PlainText; text: parent.parent.b[2]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 } }
                }
                Chip { text: ws.working && ws.run ? "Working · " + ws.host.span(ws.host.now - ws.run.started) : ws.a.active === false ? "Paused" : (ws.changes.commits || []).length ? "Ready for review" : "Resting"; kind: ws.working ? "ok" : ws.a.active === false ? "warn" : (ws.changes.commits || []).length ? "acc" : "muted" }
                Rectangle { visible: !!ws.ctx.branch; implicitWidth: br.implicitWidth + 18; implicitHeight: 24; radius: 12; color: Theme.surface; border.width: 1; border.color: Theme.line
                    Text { id: br; anchors.centerIn: parent; textFormat: Text.PlainText; text: ws.ctx.branch || ""; color: Theme.fg2; font.family: "JetBrains Mono"; font.pixelSize: 11 } }
                Item { Layout.fillWidth: true }
                Meter { label: "Time left"; value: ws.host && ws.host.leftOf(ws.a) > 0 ? ws.host.span(ws.host.leftOf(ws.a)) : "none"; frac: ws.host ? ws.host.leftOf(ws.a) / Math.max(ws.host.leftOf(ws.a), 2 * 3600) : 0 }
                Meter { label: ws.working ? "Tokens this task" : "Tokens today"; tint: "#c1457d"
                        value: ws.host ? (ws.working && ws.run ? ws.host.tok(ws.run.tokens) + " of " + ws.host.tok(ws.a.max_task_tokens) : ws.host.tok(ws.host.dayTokens(ws.a)) + " of " + ws.host.tok(ws.a.max_day_tokens)) : ""
                        frac: ws.host ? (ws.working && ws.run ? ws.run.tokens / Math.max(1, ws.a.max_task_tokens) : ws.host.dayTokens(ws.a) / Math.max(1, ws.a.max_day_tokens)) : 0 }
                Button { text: ws.host && ws.host.leftOf(ws.a) > 0 ? "+1 hour" : "Let it work 2 h"; kind: "plain"; onClicked: ws.host.ask("agents.lease", ws.host.leftOf(ws.a) > 0 ? { id: ws.agentId, hours: 1, add: true } : { id: ws.agentId, hours: 2 }, "More time for " + ws.a.name, "Couldn't give it more time") }
                Button { text: ws.a.active === false ? "Resume" : "Pause"; kind: "plain"; onClicked: ws.host.ask("agents.update", { id: ws.agentId, active: ws.a.active === false }, ws.a.active === false ? ws.a.name + " is on again" : ws.a.name + " paused", "Couldn't change " + ws.a.name) }
                Button { visible: ws.working; text: "Stop"; kind: "danger"; onClicked: ws.host.ask("agents.stop", { id: ws.agentId }, ws.a.name + " stopped", "Couldn't stop " + ws.a.name, "Its copy of the project and its session are kept.") }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            // -------------------------------------------------------- left: goal and plan
            Rectangle {
                visible: ws.tab !== "review"
                Layout.preferredWidth: 296
                Layout.fillHeight: true
                color: Theme.sidebar
                Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }
                Flickable {
                    anchors.fill: parent
                    contentHeight: lc.implicitHeight + 30
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    ColumnLayout {
                        id: lc
                        x: 14; y: 0
                        width: parent.width - 28
                        spacing: 12
                        Lab { text: "Goal and plan"; Layout.topMargin: 14; Layout.leftMargin: 4 }
                        Card {
                            Lab { text: "Task from you" }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: ws.run ? ws.run.task : "No task yet: give it one below."; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold; lineHeight: 1.1 }
                        }
                        Card {
                            visible: !!ws.ctx.plan
                            Lab { text: "Its plan" }
                            Repeater {
                                model: ws.ctx.plan ? ws.ctx.plan.steps || [] : []
                                delegate: RowLayout {
                                    required property var modelData
                                    Layout.fillWidth: true
                                    spacing: 9
                                    Rectangle { Layout.alignment: Qt.AlignTop; Layout.topMargin: 2; implicitWidth: 15; implicitHeight: 15; radius: 5
                                        color: modelData.done ? Theme.ok : "transparent"; border.width: modelData.done ? 0 : 1.5; border.color: modelData.now ? Theme.ai : Theme.lineStrong }
                                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: modelData.text; font.strikeout: !!modelData.done
                                           color: modelData.done ? Theme.fg3 : Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: modelData.now ? Font.DemiBold : Font.Normal }
                                }
                            }
                        }
                        Card {
                            visible: ws.questions.length > 0
                            Lab { text: "Questions" }
                            Repeater {
                                model: ws.questions
                                delegate: Text { required property var modelData; Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "? " + modelData.text; color: Theme.warn; font.family: Theme.ui; font.pixelSize: 13 }
                            }
                        }
                        Card {
                            visible: !!ws.a.then
                            RowLayout {
                                spacing: 8
                                Text { text: "Then"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                                Pet { size: 22; tint: ((broker.team.agents || []).find(x => x.id === ws.a.then) || {}).color || "slate" }
                                Text { textFormat: Text.PlainText; text: ws.host ? ws.host.nameOf(ws.a.then) : ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                                Text { text: "gets its work"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            }
                        }
                    }
                }
            }

            // -------------------------------------------------------- middle: Live, Review, Desktop
            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 46
                    color: Theme.surface
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                    RowLayout {
                        anchors { fill: parent; leftMargin: 14; rightMargin: 18 }
                        spacing: 2
                        CTab { key: "live"; label: "Live" }
                        CTab { key: "review"; label: "Review"; count: (ws.changes.files || []).length }
                        CTab { key: "desktop"; label: "Desktop" }
                        Item { Layout.fillWidth: true }
                        Text { visible: ws.tab === "review" && !!ws.changes.files; textFormat: Text.PlainText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12
                               text: (ws.changes.files || []).length + " files · " + (ws.changes.commits || []).length + " commits" }
                    }
                }

                // ---------------- Live
                ColumnLayout {
                    visible: ws.tab === "live"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 0
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        color: Theme.surface2
                    ListView {
                        id: live
                        anchors.fill: parent
                        clip: true
                        topMargin: 8; bottomMargin: 8; leftMargin: 22; rightMargin: 22
                        spacing: 4
                        model: ws.log_.filter(e => e.kind !== "plan")
                        onCountChanged: Qt.callLater(positionViewAtEnd)
                        QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                        delegate: RowLayout {
                            id: ev
                            required property var modelData
                            readonly property string k: modelData.kind
                            readonly property var look: ({
                                start: ["play", Theme.fg3, ""], say: ["message-square", Theme.fg2, ""], read: ["eye", Theme.ai, "Read "], "new": ["file-plus", Theme.ok, "Made "],
                                edit: ["file-pen", Theme.ok, "Edited "], run: ["terminal", Theme.fg2, "Ran "], search: ["search", Theme.fg2, "Looked for "], ask: ["circle-alert", Theme.warn, "Asks you: "],
                                report: ["check", Theme.ok, "Reported: "], tool: ["plug", Theme.fg2, "Used "], done: ["circle-check", Theme.ok, "Done: "], failed: ["circle-alert", Theme.danger, "Stopped: "]
                            })[k] || ["check", Theme.fg2, ""]
                            width: live.width - 44
                            spacing: 11
                            Rectangle { Layout.alignment: Qt.AlignTop; Layout.topMargin: 8; implicitWidth: 26; implicitHeight: 26; radius: 8; color: Theme.surface; border.width: 1; border.color: Theme.line
                                Icon { anchors.centerIn: parent; name: ev.look[0]; size: 13; color: ev.look[1] } }
                            ColumnLayout {
                                Layout.fillWidth: true
                                Layout.topMargin: 11; Layout.bottomMargin: 4
                                spacing: 6
                                Text { Layout.fillWidth: true; wrapMode: Text.Wrap; textFormat: Text.PlainText; text: ev.look[2] + (ev.modelData.text || "")
                                       color: ev.k === "failed" ? Theme.danger : Theme.fg; font.family: ["read", "new", "edit", "run", "search"].indexOf(ev.k) >= 0 ? "JetBrains Mono" : Theme.ui
                                       font.pixelSize: ["read", "new", "edit", "run", "search"].indexOf(ev.k) >= 0 ? 12 : 13; font.weight: ["ask", "done"].indexOf(ev.k) >= 0 ? Font.DemiBold : Font.Normal }
                                Rectangle {
                                    visible: !!ev.modelData.detail
                                    Layout.fillWidth: true
                                    implicitHeight: dt.implicitHeight + 18; radius: 9; color: "#16191d"
                                    Text { id: dt; anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 12 } wrapMode: Text.WrapAnywhere; textFormat: Text.PlainText
                                           text: ev.modelData.detail || ""; color: ev.modelData.failed ? "#f4b0a6" : "#d6dbe0"; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                }
                            }
                        }
                        Text { anchors.centerIn: parent; visible: live.count === 0; width: 380; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; textFormat: Text.PlainText
                               text: ws.host && ws.host.leftOf(ws.a) > 0 ? "Nothing yet. Give it a task below and its work shows here as it happens." : "Let it work first (asks for your password), then give it a task."
                               color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                    }
                    }
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.margins: 14; Layout.leftMargin: 22; Layout.rightMargin: 22
                        implicitHeight: 48; radius: 14
                        color: Theme.surface; border.width: 1; border.color: task.activeFocus ? Theme.accent : Theme.lineStrong
                        RowLayout {
                            anchors { fill: parent; leftMargin: 16; rightMargin: 8 }
                            QQC2.TextField {
                                id: task
                                Layout.fillWidth: true
                                enabled: !ws.working && ws.a.active !== false && ws.host && ws.host.leftOf(ws.a) > 0
                                leftPadding: 0; background: null; placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14
                                placeholderText: ws.working ? (ws.a.name || "") + " is working; your next task can start when it's done" : enabled ? "Tell " + (ws.a.name || "it") + " what to do next…" : "Let it work first to give it tasks"
                                onAccepted: sendTask.go()
                            }
                            Rectangle {
                                id: sendTask
                                implicitWidth: 32; implicitHeight: 32; radius: 16
                                color: task.text.trim() && task.enabled ? Theme.accent : Theme.lineStrong
                                Icon { anchors.centerIn: parent; name: "arrow-up"; size: 15; color: "white" }
                                function go() {
                                    if (!task.text.trim() || !task.enabled) return;
                                    ws.host.ask("agents.run", { id: ws.agentId, task: task.text.trim() }, ws.a.name + " started", "Couldn't start " + ws.a.name);
                                    task.text = "";
                                }
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: sendTask.go() }
                                Accessible.role: Accessible.Button
                                Accessible.name: "Send"
                            }
                        }
                    }
                }

                // ---------------- Review
                ReviewPane {
                    visible: ws.tab === "review"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    ws_: ws
                }

                // ---------------- Desktop (D109): its own desktop, live; you can take control
                Rectangle {
                    id: deskPane
                    visible: ws.tab === "desktop"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: "#d9dde3"
                    ColumnLayout {
                        anchors { fill: parent; margins: 18 }
                        spacing: 10
                        // the bar: live, its size, take control, close
                        RowLayout {
                            visible: ws.deskOn
                            Layout.fillWidth: true
                            spacing: 10
                            Rectangle {
                                implicitWidth: liveRow.implicitWidth + 20; implicitHeight: 28; radius: 14
                                color: deskView.connected ? Theme.okSoft : Theme.surface3
                                Row {
                                    id: liveRow
                                    anchors.centerIn: parent
                                    spacing: 7
                                    Rectangle { anchors.verticalCenter: parent.verticalCenter; width: 8; height: 8; radius: 4; color: deskView.connected ? Theme.ok : Theme.fg3
                                        SequentialAnimation on opacity { running: deskView.connected; loops: Animation.Infinite; NumberAnimation { to: 0.35; duration: 900 } NumberAnimation { to: 1; duration: 900 } } }
                                    Text { textFormat: Text.PlainText; text: deskView.connected ? "Live" : "Connecting"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                                }
                            }
                            Text { textFormat: Text.PlainText; text: (ws.deskInfo.width || 1280) + " × " + (ws.deskInfo.height || 800); color: Theme.fg3; font.family: "JetBrains Mono"; font.pixelSize: 11 }
                            Item { Layout.fillWidth: true }
                            Text {
                                textFormat: Text.PlainText
                                text: deskView.control ? "You're driving. " + (ws.a.name || "It") + " waits until you hand back." : "Watching. Take control to use it yourself."
                                color: deskView.control ? Theme.accent : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12
                            }
                            Item { Layout.fillWidth: true }
                            Button { enabled: deskView.connected; text: deskView.control ? "Hand back" : "Take control"; kind: deskView.control ? "plain" : "primary"; onClicked: deskView.control = !deskView.control }
                            Button { text: "Close"; kind: "plain"; onClicked: { deskView.close(); ws.deskAsk("stop"); } }
                        }
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            radius: 12
                            color: "#0f1115"
                            clip: true
                            border.width: deskView.control ? 2 : 0
                            border.color: Theme.accent
                            DeskView {
                                id: deskView
                                anchors { fill: parent; margins: deskView.control ? 2 : 0 }
                                visible: ws.deskOn
                                focus: control
                            }
                            // closed: what it is, and the way in
                            ColumnLayout {
                                visible: !ws.deskOn || (!deskView.connected && deskView.error !== "")
                                anchors.centerIn: parent
                                width: 440
                                spacing: 12
                                Icon { Layout.alignment: Qt.AlignHCenter; name: "monitor"; size: 34; color: "#c9d1dc" }
                                Text { Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; textFormat: Text.PlainText; text: (ws.a.name || "Its") + "'s own desktop"; color: "white"; font.family: Theme.display; font.pixelSize: 22; font.weight: Font.DemiBold }
                                Text { Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: "#aab4c3"; font.family: Theme.ui; font.pixelSize: 13
                                       text: ws.deskErr || deskView.error || "A separate desktop inside its sandbox: a browser and its apps run here, never on your screen. It sees only its workspace and places, nothing else of your computer. You can watch, or take control." }
                                Button { Layout.alignment: Qt.AlignHCenter; visible: !ws.deskOn; enabled: !ws.deskBusy && !!ws.host && ws.host.leftOf(ws.a) > 0; text: ws.deskBusy ? "Opening…" : "Open its desktop"; onClicked: ws.deskAsk("start") }
                                Text { Layout.fillWidth: true; horizontalAlignment: Text.AlignHCenter; visible: !ws.deskOn && !!ws.host && ws.host.leftOf(ws.a) <= 0; textFormat: Text.PlainText; text: "It needs a work lease first: use Let it work above."; color: "#aab4c3"; font.family: Theme.ui; font.pixelSize: 12 }
                            }
                        }
                    }
                }
            }

            // -------------------------------------------------------- right: files and context
            Rectangle {
                visible: ws.tab !== "review"
                Layout.preferredWidth: 340
                Layout.fillHeight: true
                color: Theme.surface
                Rectangle { width: 1; height: parent.height; color: Theme.line }
                Flickable {
                    anchors { fill: parent; leftMargin: 1 }
                    contentHeight: rc.implicitHeight + 30
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                    ColumnLayout {
                        id: rc
                        x: 14
                        width: parent.width - 28
                        spacing: 8
                        Lab { text: "Files in play"; Layout.topMargin: 16; Layout.leftMargin: 4 }
                        Flow {
                            Layout.fillWidth: true
                            spacing: 6
                            Chip { text: String(ws.a.folder || "").split("/").pop() + " · its copy"; kind: "acc" }
                            Repeater { model: ws.a.places || []; delegate: Chip { required property var modelData; text: modelData.as + (modelData.write ? " · read & write" : " · read only"); kind: modelData.write ? "warn" : "muted" } }
                        }
                        Repeater {
                            model: ws.ctx.tree || []
                            delegate: Rectangle {
                                required property var modelData
                                readonly property string t: ws.touched[modelData.path] || ""
                                Layout.fillWidth: true
                                implicitHeight: 27; radius: 7
                                color: t === "read" ? Theme.aiSoft : t ? Theme.okSoft : "transparent"
                                RowLayout {
                                    anchors { fill: parent; leftMargin: 8 + parent.modelData.depth * 14; rightMargin: 8 }
                                    spacing: 7
                                    Icon { name: parent.parent.modelData.folder ? "folder-open" : "file-pen"; size: 13; color: parent.parent.modelData.folder ? "#6f96e8" : Theme.fg3 }
                                    Text { Layout.fillWidth: true; elide: Text.ElideMiddle; textFormat: Text.PlainText; text: String(parent.parent.modelData.path).split("/").pop(); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: parent.parent.t && parent.parent.t !== "read" ? Font.DemiBold : Font.Normal }
                                    Chip { visible: !!parent.parent.t; text: parent.parent.t === "read" ? "reading" : parent.parent.t === "new" ? "new" : "changed"; kind: parent.parent.t === "read" ? "ai" : "ok" }
                                }
                            }
                        }
                        Text { visible: !(ws.ctx.tree || []).length; Layout.leftMargin: 4; textFormat: Text.PlainText; text: "Its copy of the project appears with its first task."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                        Rectangle { Layout.fillWidth: true; Layout.topMargin: 10; implicitHeight: 1; color: Theme.line }
                        Lab { text: "Memory and context"; Layout.topMargin: 8; Layout.leftMargin: 4 }
                        Repeater {
                            model: [
                                ["Its instructions", ws.ctx.instructions || "none"],
                                ["Connections it may use", (ws.ctx.connectors || []).join(", ") || "none"],
                                ["Memories shared with it", (ws.ctx.memory_groups || []).join(", ") || "none"]
                            ]
                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.leftMargin: 4; Layout.rightMargin: 4
                                Text { text: modelData[0]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                                Text { Layout.fillWidth: true; horizontalAlignment: Text.AlignRight; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData[1]; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                            }
                        }
                    }
                }
            }
        }
    }
}
