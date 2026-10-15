// SIOS Agents, the preview's Team app (TeamApp.tsx) on the real broker and brain.
//   Agents: your team. Each agent is its own identity with a brain (SIOS, or
//           Claude Code in its own workspace), a job and reports. New, Run now,
//           Pause, Remove.
//   Inbox: what agents reported (their words are data, never instructions).
//   Activity: every decision the broker made, tamper-evident, by AI.
//   Permissions: each AI's roles, Pause, and Stop all AI.
// Looking needs no password (D59). Making, changing, pausing and removing are
// yours: the broker asks for your password. Stop never does (D41).
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 1080
    height: 740
    minimumWidth: 800
    minimumHeight: 520
    visible: true
    title: "Agents"
    color: Theme.surface

    property string page: ["agents", "inbox", "activity", "permissions"].indexOf(startPage) >= 0 ? startPage : "agents"
    Connections {
        target: waker
        function onShown(p) { if (["agents", "inbox", "activity", "permissions"].indexOf(p) >= 0) win.page = p; win.show(); win.raise(); win.requestActivate(); }
    }
    Connections {
        target: broker
        function onDone(tag, ok, error) {
            if (tag === "apps") { if (ok) win.apps = ok.apps || []; return; }
            toast.show(error ? error : tag, false, !!error);
            if (!error && tag === "Agent made") win.creating = false;
        }
    }
    property var apps: []
    Component.onCompleted: broker.request("iam.apps", {}, "apps")

    readonly property var agents: broker.team.agents || []
    readonly property var reports: broker.team.reports || []
    readonly property int unread: broker.team.unread || 0
    property string filter: ""
    property bool creating: false

    function nameOf(id) { const a = agents.find(x => x.id === id); return a ? a.name : String(id).replace(/^(app|agent|helper|unpaired):/, ""); }
    function ago(t) {
        const s = Math.max(0, Date.now() / 1000 - t);
        if (s < 60) return "just now";
        if (s < 3600) return Math.round(s / 60) + " min ago";
        if (s < 86400) return Math.round(s / 3600) + " h ago";
        return new Date(t * 1000).toLocaleDateString(Qt.locale(), "MMM d");
    }
    function jobText(a) {
        if (a.job === "watch") return "Watches " + a.folder;
        if (a.job === "every") return "Every " + (a.every_min >= 60 ? Math.round(a.every_min / 60) + " h" : a.every_min + " min");
        if (a.job === "daily") return "Every day at " + a.at;
        if (a.job === "project") return "Works on " + a.folder;
        return "When you ask";
    }
    readonly property var palette: ({ mint: "#5fcf9f", sky: "#6aa8ff", violet: "#9b8cff", peach: "#ffa774", rose: "#ff7fa7", lemon: "#f2cf55", slate: "#8c99a8", coral: "#ff7d6b" })

    component NavItem: Rectangle {
        id: nav
        property string icon
        property string label
        property string key
        property int count: 0
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
            Rectangle {
                visible: nav.count > 0
                implicitWidth: Math.max(20, c.implicitWidth + 10); implicitHeight: 20; radius: 10
                color: Theme.ai
                Text { id: c; anchors.centerIn: parent; text: nav.count; color: "white"; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold }
            }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.page = nav.key }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }
    component Chip: Rectangle {
        property string text
        property color ink: Theme.fg2
        property color fill: Theme.surface3
        implicitWidth: t.implicitWidth + 14; implicitHeight: 20; radius: 10
        color: fill
        Text { id: t; anchors.centerIn: parent; text: parent.text; color: parent.ink; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Medium }
    }
    component Field: QQC2.TextField { Layout.fillWidth: true; font.family: Theme.ui; font.pixelSize: 13 }
    component Choice: Rectangle {
        id: ch
        property string label
        property bool on: false
        signal picked()
        implicitWidth: lt.implicitWidth + 22; implicitHeight: 30; radius: 15
        color: on ? Theme.aiSoft : Theme.surface2
        border.width: 1
        border.color: on ? Theme.ai : Theme.line
        Text { id: lt; anchors.centerIn: parent; text: ch.label; color: ch.on ? Theme.aiInk : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: ch.picked() }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ---- sidebar
        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 236
            color: Theme.surface2
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 14
                spacing: 4
                RowLayout {
                    Layout.bottomMargin: 14
                    spacing: 10
                    Rectangle { implicitWidth: 34; implicitHeight: 34; radius: 10; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "users"; size: 18; color: Theme.aiInk } }
                    ColumnLayout {
                        spacing: 0
                        Text { text: "Agents"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                        Text { text: win.agents.length === 1 ? "1 agent on your team" : win.agents.length + " agents on your team"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    }
                }
                NavItem { icon: "bot"; label: "Agents"; key: "agents" }
                NavItem { icon: "inbox"; label: "Inbox"; key: "inbox"; count: win.unread }
                NavItem { icon: "activity"; label: "Activity"; key: "activity" }
                NavItem { icon: "shield"; label: "Permissions"; key: "permissions" }
                Item { Layout.fillHeight: true }
                // Stop is always one click and never asks (D41)
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 40
                    radius: 10
                    color: stopM.containsMouse ? Qt.rgba(Theme.danger.r, Theme.danger.g, Theme.danger.b, 0.16) : "transparent"
                    border.width: 1
                    border.color: Qt.rgba(Theme.danger.r, Theme.danger.g, Theme.danger.b, 0.45)
                    RowLayout {
                        anchors.centerIn: parent
                        spacing: 8
                        Icon { name: "octagon-x"; size: 16; color: Theme.danger }
                        Text { text: broker.status.stopped ? "All AI is stopped" : "Stop all AI"; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                    }
                    MouseArea { id: stopM; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; enabled: !broker.status.stopped; onClicked: broker.request("ai.stop", {}, "All AI stopped. Resume from the approval window.") }
                }
            }
        }

        // ---- pages
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.margins: 22
            spacing: 14

            RowLayout {
                Layout.fillWidth: true
                Text {
                    Layout.fillWidth: true
                    text: ({ agents: "Your team", inbox: "Inbox", activity: "Activity", permissions: "Permissions" })[win.page]
                    color: Theme.fg; font.family: Theme.ui; font.pixelSize: 22; font.weight: Font.DemiBold
                }
                Button { visible: win.page === "agents" && !win.creating; text: "New agent"; onClicked: win.creating = true }
                Button { visible: win.page === "inbox" && win.unread > 0; text: "Mark all read"; kind: "plain"; onClicked: broker.request("reports.read", {}, "Marked read") }
            }
            Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                text: ({
                    agents: "Each agent is its own identity: it asks for what it needs, the broker checks every step, and you can pause or remove it any time.",
                    inbox: "What your agents reported. Their words are shown as data; nothing in them is ever followed as an instruction.",
                    activity: "Every decision the broker made, newest first. The log is chained, so a changed line shows.",
                    permissions: "What each AI may do. Changes ask for your password; Stop all AI never does."
                })[win.page]
            }
            Text { visible: !broker.reachable; text: "SIOS's broker isn't running."; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13 }

            // ---- New agent
            Rectangle {
                id: form
                visible: win.page === "agents" && win.creating
                Layout.fillWidth: true
                implicitHeight: fc.implicitHeight + 32
                radius: 16
                color: Theme.surface2
                border.width: 1
                border.color: Theme.line
                property string brainPick: "builtin"
                property string jobPick: "on-demand"
                ColumnLayout {
                    id: fc
                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                    spacing: 10
                    Text { text: "New agent"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                    RowLayout { spacing: 8; Field { id: nm; placeholderText: "Name (Pip, Coder...)"; Layout.maximumWidth: 220 } }
                    Text { text: "Brain"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    Flow {
                        Layout.fillWidth: true
                        spacing: 8
                        Choice { label: "SIOS (the AI you chose in Settings)"; on: form.brainPick === "builtin"; onPicked: form.brainPick = "builtin" }
                        Choice { label: "Claude Code, in its own workspace"; on: form.brainPick === "claude-code"; onPicked: { form.brainPick = "claude-code"; form.jobPick = "project"; } }
                    }
                    Text { text: "Job"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    Flow {
                        Layout.fillWidth: true
                        spacing: 8
                        Repeater {
                            model: form.brainPick === "claude-code" ? [["project", "Work on a project"], ["on-demand", "When I ask"]] : [["on-demand", "When I ask"], ["watch", "Watch a folder"], ["every", "Every few minutes"], ["daily", "Every day at"]]
                            delegate: Choice { required property var modelData; label: modelData[1]; on: form.jobPick === modelData[0]; onPicked: form.jobPick = modelData[0] }
                        }
                    }
                    Field { id: what; placeholderText: form.brainPick === "claude-code" ? "What it works on: “Add tests to the parser, keep the README current”" : "What it does: “Sort new files into folders by type”" }
                    RowLayout {
                        spacing: 8
                        Field { id: folder; visible: form.jobPick === "watch" || form.jobPick === "project" || form.brainPick === "claude-code"; placeholderText: form.brainPick === "claude-code" ? "Project folder, e.g. Projects/parser" : "Folder, e.g. Downloads"; Layout.maximumWidth: 320 }
                        Field { id: every; visible: form.jobPick === "every"; placeholderText: "Minutes (at least 5)"; Layout.maximumWidth: 180; validator: IntValidator { bottom: 5; top: 10080 } }
                        Field { id: at; visible: form.jobPick === "daily"; placeholderText: "08:30"; Layout.maximumWidth: 120 }
                    }
                    Text {
                        visible: form.brainPick === "claude-code"
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: "Claude Code works in a copy of the project on its own branch, in a sandbox that can't see the rest of your home. You sign it in once in its own workspace. Its network isn't limited yet."
                        color: Theme.warn; font.family: Theme.ui; font.pixelSize: 12
                    }
                    RowLayout {
                        spacing: 8
                        Item { Layout.fillWidth: true }
                        Button { text: "Cancel"; kind: "plain"; onClicked: win.creating = false }
                        Button {
                            text: "Make agent"
                            onClicked: {
                                const p = { name: nm.text, brain: form.brainPick, job: form.jobPick, instructions: what.text, color: "" };
                                if (folder.visible) p.folder = folder.text;
                                if (every.visible) p.every_min = parseInt(every.text) || 60;
                                if (at.visible) p.at = at.text;
                                broker.request("agents.add", p, "Agent made");
                            }
                        }
                    }
                }
            }

            // ---- Agents
            GridView {
                id: grid
                visible: win.page === "agents"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                cellWidth: Math.max(300, Math.floor(width / Math.max(1, Math.floor(width / 330))))
                cellHeight: 300
                model: win.agents
                delegate: Item {
                    required property var modelData
                    width: grid.cellWidth
                    height: grid.cellHeight
                    readonly property var last: win.reports.find(r => r.agent === modelData.id)
                    Rectangle {
                        anchors.fill: parent
                        anchors.margins: 6
                        radius: 16
                        color: Theme.surface
                        border.width: 1
                        border.color: Theme.line
                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 14
                            spacing: 8
                            RowLayout {
                                spacing: 10
                                // the pet: its colour, with a soft glow
                                Rectangle {
                                    implicitWidth: 38; implicitHeight: 38; radius: 19
                                    gradient: Gradient {
                                        GradientStop { position: 0; color: Qt.lighter(win.palette[modelData.color] || Theme.ai, 1.35) }
                                        GradientStop { position: 1; color: win.palette[modelData.color] || Theme.ai }
                                    }
                                    opacity: modelData.active ? 1 : 0.45
                                    Row {
                                        anchors.centerIn: parent
                                        spacing: 6
                                        Rectangle { width: 5; height: 6; radius: 2.5; color: "#1b1d22" }
                                        Rectangle { width: 5; height: 6; radius: 2.5; color: "#1b1d22" }
                                    }
                                }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 2
                                    Text { text: modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                                    Text { text: win.jobText(modelData); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                }
                                Chip { text: modelData.brain === "claude-code" ? "Claude Code" : "SIOS"; ink: Theme.aiInk; fill: Theme.aiSoft }
                            }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight; text: modelData.instructions; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            Rectangle {
                                Layout.fillWidth: true
                                implicitHeight: lastT.implicitHeight + 14
                                radius: 10
                                color: Theme.surface2
                                Text {
                                    id: lastT
                                    anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 10 }
                                    maximumLineCount: 2
                                    wrapMode: Text.WordWrap
                                    elide: Text.ElideRight
                                    text: !modelData.active ? "Paused." : parent.parent.parent.parent.last ? (win.ago(parent.parent.parent.parent.last.at) + ": " + parent.parent.parent.parent.last.text) : "No reports yet."
                                    color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
                                }
                            }
                            Item { Layout.fillHeight: true }
                            // a coding agent: its lease, its sign-in, and a task (A5)
                            ColumnLayout {
                                visible: modelData.brain === "claude-code"
                                Layout.fillWidth: true
                                spacing: 6
                                readonly property bool leased: (modelData.lease_until || 0) > Date.now() / 1000
                                Text {
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                    text: modelData.run ? "Working on a task now. Its network isn't limited yet." : parent.leased ? "May work on " + modelData.folder + " until " + new Date(modelData.lease_until * 1000).toLocaleTimeString(Qt.locale(), "h:mm ap") + "." : "Resting. Let it work to give it tasks."
                                    color: modelData.run ? Theme.aiInk : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
                                }
                                RowLayout {
                                    visible: parent.leased && !modelData.run
                                    Layout.fillWidth: true
                                    spacing: 6
                                    QQC2.TextField {
                                        id: task
                                        Layout.fillWidth: true
                                        placeholderText: "Give it a task: \u201cadd tests for parse()\u201d"
                                        font.family: Theme.ui; font.pixelSize: 12
                                        onAccepted: go.clicked()
                                    }
                                    Button { id: go; text: "Go"; onClicked: { if (task.text.trim()) { broker.request("agents.run", { id: modelData.id, task: task.text }, modelData.name + " started"); task.text = ""; } } }
                                }
                                RowLayout {
                                    spacing: 6
                                    Button { visible: !parent.parent.leased; text: "Let it work 2 h"; onClicked: broker.request("agents.lease", { id: modelData.id, hours: 2 }, modelData.name + " may work for 2 hours") }
                                    Button { visible: !!modelData.run; text: "Show its desk"; onClicked: broker.request("agents.peek", { id: modelData.id }, "Switched to its desk") }
                                    Button { text: "Sign in"; kind: "plain"; onClicked: broker.request("agents.signin", { id: modelData.id }, "A terminal opened in its workspace: sign in with /login") }
                                    Button { text: "Make it a git project"; kind: "plain"; onClicked: broker.request("agents.git_init", { id: modelData.id }, "Done") }
                                }
                            }
                            RowLayout {
                                spacing: 6
                                Button { visible: modelData.brain === "builtin" && modelData.active; text: "Run now"; onClicked: broker.brain("agents.run_now", { id: modelData.id }, modelData.name + " started") }
                                Button { text: modelData.active ? "Pause" : "Resume"; kind: "plain"; onClicked: broker.request("agents.update", { id: modelData.id, active: !modelData.active }, modelData.active ? modelData.name + " paused" : modelData.name + " is on again") }
                                Item { Layout.fillWidth: true }
                                Button { text: "Remove"; kind: "danger"; onClicked: broker.request("agents.remove", { id: modelData.id }, modelData.name + " removed") }
                            }
                        }
                    }
                }
                Text { anchors.centerIn: parent; visible: parent.count === 0 && !win.creating; width: 420; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; text: "No agents yet. Make one: a SIOS helper that tidies Downloads every day, or Claude Code working on a project in its own workspace."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }

            // ---- Inbox
            ListView {
                visible: win.page === "inbox"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 8
                model: win.reports
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    implicitHeight: rc.implicitHeight + 24
                    radius: 14
                    color: modelData.read ? Theme.surface : Theme.aiSoft
                    border.width: 1
                    border.color: Theme.line
                    ColumnLayout {
                        id: rc
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 4
                        RowLayout {
                            spacing: 8
                            Text { text: win.nameOf(modelData.agent); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                            Chip { text: modelData.kind === "question" ? "asks you" : modelData.failed ? "didn't finish" : modelData.kind; ink: modelData.failed ? Theme.danger : modelData.kind === "question" ? Theme.warn : Theme.fg2 }
                            Item { Layout.fillWidth: true }
                            Text { text: win.ago(modelData.at); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11 }
                        }
                        // the agent's own words: plain text, never rich text or links
                        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: modelData.text; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                    }
                }
                Text { anchors.centerIn: parent; visible: parent.count === 0; text: "Nothing reported yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }

            // ---- Activity
            Flow {
                visible: win.page === "activity"
                Layout.fillWidth: true
                spacing: 8
                Choice { label: "Everyone"; on: win.filter === ""; onPicked: win.filter = "" }
                Repeater {
                    model: [...new Set(broker.activity.map(e => e.principal.split(" ")[0]))].slice(0, 10)
                    delegate: Choice { required property string modelData; label: win.nameOf(modelData); on: win.filter === modelData; onPicked: win.filter = modelData }
                }
            }
            ListView {
                visible: win.page === "activity"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 2
                model: broker.activity.filter(e => !win.filter || e.principal.split(" ")[0] === win.filter).slice().reverse()
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    implicitHeight: 44
                    radius: 8
                    color: hov.containsMouse ? Theme.surface2 : "transparent"
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        spacing: 10
                        Text { Layout.preferredWidth: 80; text: win.ago(modelData.at); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11 }
                        Text { Layout.preferredWidth: 130; elide: Text.ElideRight; text: win.nameOf(modelData.principal.split(" ")[0]); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.Medium }
                        Chip {
                            text: modelData.decision
                            ink: ["blocked", "denied", "error"].indexOf(modelData.decision) >= 0 ? Theme.danger : modelData.decision === "asked" ? Theme.warn : Theme.ok
                        }
                        Text { Layout.preferredWidth: 150; elide: Text.ElideRight; text: modelData.tool; color: Theme.fg2; font.family: "JetBrains Mono"; font.pixelSize: 11 }
                        Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.reason; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    }
                    MouseArea { id: hov; anchors.fill: parent; hoverEnabled: true }
                }
            }

            // ---- Permissions
            ListView {
                visible: win.page === "permissions"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 10
                model: win.agents.map(a => ({ id: a.id, name: a.name, kind: a.brain === "claude-code" ? "Claude Code agent" : "SIOS agent", paused: !a.active, agent: true }))
                       .concat(win.apps.map(a => ({ id: a.id, name: a.name, kind: "Connected app", paused: a.paused, roles: a.roles, agent: false })))
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    implicitHeight: 64
                    radius: 14
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 14
                        spacing: 10
                        Icon { name: modelData.agent ? "bot" : "square-terminal"; size: 18; color: Theme.fg2 }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            Text { text: modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
                            Text { text: modelData.kind + (modelData.roles && modelData.roles.length ? " · roles: " + modelData.roles.join(", ") : ""); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                        Chip { visible: modelData.paused; text: "paused"; ink: Theme.warn }
                        Button {
                            text: modelData.paused ? "Resume" : "Pause"
                            kind: "plain"
                            onClicked: modelData.agent
                                ? broker.request("agents.update", { id: modelData.id, active: modelData.paused }, modelData.paused ? modelData.name + " is on again" : modelData.name + " paused")
                                : broker.request(modelData.paused ? "resume" : "pause", { principal: modelData.id }, modelData.paused ? modelData.name + " resumed" : modelData.name + " paused")
                        }
                    }
                }
                Text { anchors.centerIn: parent; visible: parent.count === 0; text: "No agents or connected apps yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
    }

    Toast { id: toast }
}
