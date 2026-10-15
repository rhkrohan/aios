// SIOS Memory, the preview's Memory app (MemoryApp.tsx) on the real broker.
//   About you, People: what you told SIOS; edit, mark Sensitive, delete (30-day bin)
//   Timeline: what SIOS did (episodes)
//   Waiting for your OK: patterns SIOS noticed; nothing is kept until you say yes
//   Sharing: which memory groups each connected AI may read
// Looking needs no password (D59). Changes are yours: the broker asks for your
// password, or takes a click inside an approval session (D71). Sharing always asks.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 1000
    height: 720
    minimumWidth: 760
    minimumHeight: 500
    visible: true
    title: "Memory"
    color: Theme.surface

    property string page: startPage || "about"
    Connections {
        target: waker
        function onShown(p) { if (p) win.page = p; win.show(); win.raise(); win.requestActivate(); }
    }
    Connections {
        target: broker
        function onDone(tag, ok, error) { toast.show(error ? error : tag, false, !!error); win.busy = ""; }
    }
    property string busy: ""
    function act(method, params, done) { busy = method + ":" + (params.id || ""); broker.request(method, params, done); }

    readonly property var all: broker.data.memories || []
    readonly property var live: all.filter(m => !m.superseded_by && !m.deleted_at)
    readonly property var about: live.filter(m => m.kind === "fact" || m.kind === "preference")
    readonly property var people: live.filter(m => m.kind === "person")
    readonly property var timeline: live.filter(m => m.kind === "episode").sort((a, b) => b.created - a.created)
    readonly property var replaced: all.filter(m => m.superseded_by && !m.deleted_at)
    readonly property var bin: all.filter(m => m.deleted_at)
    readonly property var waiting: broker.data.suggestions || []
    readonly property var shares: broker.data.shares || ({})
    readonly property var groups: broker.data.groups || ["People", "Habits", "Work", "Personal", "Finance", "History"]
    function textOf(id) { const m = all.find(x => x.id === id); return m ? m.text : ""; }
    function when(t) { return t ? new Date(t * 1000).toLocaleDateString(Qt.locale(), "MMM d, yyyy") : ""; }

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
                color: nav.key === "waiting" ? Theme.ai : "transparent"
                Text { id: c; anchors.centerIn: parent; text: nav.count; color: nav.key === "waiting" ? "white" : Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold }
            }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.page = nav.key }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }

    component Chip: Rectangle {
        property string text
        property color ink: Theme.fg2
        implicitWidth: t.implicitWidth + 14; implicitHeight: 20; radius: 10
        color: Theme.surface3
        Text { id: t; anchors.centerIn: parent; text: parent.text; color: parent.ink; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Medium }
    }

    component IconButton: Rectangle {
        id: ib
        property string icon
        property color ink: Theme.fg3
        property string tip
        signal clicked()
        implicitWidth: 30; implicitHeight: 30; radius: 8
        color: ma.containsMouse ? Theme.surface3 : "transparent"
        Icon { anchors.centerIn: parent; name: ib.icon; size: 15; color: ma.containsMouse ? Theme.fg : ib.ink }
        MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: ib.clicked() }
        QQC2.ToolTip.visible: ma.containsMouse && tip !== ""
        QQC2.ToolTip.text: tip
        QQC2.ToolTip.delay: 500
        Accessible.role: Accessible.Button
        Accessible.name: tip
    }

    // one memory: what it says, where it came from, and what you can do with it
    component MemoryCard: Rectangle {
        id: card
        required property var modelData
        property bool editing: false
        readonly property bool sensitive: (modelData.labels || []).indexOf("Sensitive") >= 0
        Layout.fillWidth: true
        width: ListView.view ? ListView.view.width : implicitWidth
        implicitHeight: body.implicitHeight + 28
        radius: 14
        color: Theme.surface
        border.width: 1
        border.color: Theme.line

        RowLayout {
            id: body
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
            spacing: 10
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                Text {
                    visible: !card.editing
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: card.modelData.text
                    color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14
                }
                QQC2.TextField {
                    id: edit
                    visible: card.editing
                    Layout.fillWidth: true
                    text: card.modelData.text
                    font.family: Theme.ui; font.pixelSize: 14
                    onAccepted: { win.act("memory.edit", { id: card.modelData.id, text: text }, "Changed"); card.editing = false; }
                    Keys.onEscapePressed: card.editing = false
                }
                RowLayout {
                    spacing: 6
                    Chip { text: card.modelData.group }
                    Chip { visible: card.sensitive; text: "Sensitive: never sent online"; ink: Theme.warn }
                    Text {
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        text: (card.modelData.source || "") + (card.modelData.by ? " · " + card.modelData.by : "") + " · " + win.when(card.modelData.created)
                        color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11
                    }
                }
                // what this one replaced (D73), with a way back
                Repeater {
                    model: win.replaced.filter(o => o.superseded_by === card.modelData.id)
                    delegate: RowLayout {
                        required property var modelData
                        spacing: 6
                        Icon { name: "history"; size: 13; color: Theme.fg3 }
                        Text { Layout.fillWidth: true; elide: Text.ElideRight; text: "Replaced: " + modelData.text; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        Text {
                            text: "Use the old one"
                            color: Theme.accent; font.family: Theme.ui; font.pixelSize: 12
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.act("memory.revert", { id: modelData.id }, "Put back") }
                        }
                    }
                }
            }
            IconButton { icon: "check"; visible: card.editing; tip: "Save"; onClicked: { win.act("memory.edit", { id: card.modelData.id, text: edit.text }, "Changed"); card.editing = false; } }
            IconButton { icon: "sparkles"; visible: !card.editing && card.modelData.kind !== "episode"; tip: "Edit"; onClicked: card.editing = true }
            IconButton {
                icon: "eye-off"
                visible: card.modelData.kind !== "episode"
                ink: card.sensitive ? Theme.warn : Theme.fg3
                tip: card.sensitive ? "Allow online models to see it" : "Mark Sensitive: never sent to an online model"
                onClicked: {
                    const ls = (card.modelData.labels || []).filter(l => l !== "Sensitive");
                    if (!card.sensitive) ls.push("Sensitive");
                    win.act("memory.edit", { id: card.modelData.id, labels: ls }, card.sensitive ? "Online models may see it" : "Marked Sensitive");
                }
            }
            IconButton { icon: "trash-2"; tip: "Delete (kept 30 days)"; onClicked: win.act("memory.delete", { id: card.modelData.id }, "Deleted. It stays in the bin for 30 days.") }
        }
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
                    Rectangle { implicitWidth: 34; implicitHeight: 34; radius: 10; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "brain"; size: 18; color: Theme.aiInk } }
                    ColumnLayout {
                        spacing: 0
                        Text { text: "Memory"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                        Text { text: win.live.length + " things SIOS knows"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    }
                }
                NavItem { icon: "user"; label: "About you"; key: "about"; count: win.about.length }
                NavItem { icon: "users"; label: "People"; key: "people"; count: win.people.length }
                NavItem { icon: "clock"; label: "Timeline"; key: "timeline"; count: win.timeline.length }
                NavItem { icon: "sparkles"; label: "Waiting for your OK"; key: "waiting"; count: win.waiting.length }
                NavItem { icon: "share-2"; label: "Sharing"; key: "sharing"; count: Object.keys(win.shares).length }
                NavItem { icon: "trash-2"; label: "Bin"; key: "bin"; count: win.bin.length }
                Item { Layout.fillHeight: true }
                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: broker.sessionOpen
                          ? "Approvals are open: changes here are a click until you lock the screen. Sharing still asks for your password."
                          : "Changes ask for your password once; then they're a click until you lock the screen."
                    color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11
                }
            }
        }

        // ---- page
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.margins: 22
            spacing: 14

            Text {
                text: ({ about: "About you", people: "People", timeline: "Timeline", waiting: "Waiting for your OK", sharing: "Sharing", bin: "Bin" })[win.page] || ""
                color: Theme.fg; font.family: Theme.ui; font.pixelSize: 22; font.weight: Font.DemiBold
            }
            Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                text: ({
                    about: "What you told SIOS. A newer fact about the same thing replaces the old one, and you can always go back.",
                    people: "People SIOS can find for you: “my accountant”, “Sara”.",
                    timeline: "What SIOS did, newest first. Past tasks are used only when nothing you told it answers.",
                    waiting: "Patterns SIOS noticed. Nothing is remembered until you say yes.",
                    sharing: "SIOS's own assistant sees everything except Sensitive when it uses an online model. Other AIs see only the groups you share here.",
                    bin: "Deleted memories stay here for 30 days, then they're gone."
                })[win.page] || ""
            }
            Text {
                visible: !broker.reachable
                text: "SIOS's broker isn't running, so Memory can't be shown."
                color: Theme.danger; font.family: Theme.ui; font.pixelSize: 13
            }

            // add (About you, People)
            RowLayout {
                visible: win.page === "about" || win.page === "people"
                Layout.fillWidth: true
                spacing: 8
                QQC2.TextField {
                    id: draft
                    Layout.fillWidth: true
                    placeholderText: win.page === "people" ? "Priya Shah <priya@ledger.example>, accountant" : "Remember something: “I keep invoices in Documents/Finance”"
                    font.family: Theme.ui; font.pixelSize: 14
                    onAccepted: add.clicked()
                }
                Button {
                    id: add
                    text: "Remember"
                    onClicked: {
                        if (!draft.text.trim()) return;
                        win.act("memory.add", { text: draft.text, kind: win.page === "people" ? "person" : "fact", group: win.page === "people" ? "People" : "Personal" }, "Remembered");
                        draft.text = "";
                    }
                }
            }

            // the list for this page
            ListView {
                visible: ["about", "people", "timeline", "bin"].indexOf(win.page) >= 0
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 10
                model: win.page === "about" ? win.about : win.page === "people" ? win.people : win.page === "timeline" ? win.timeline : win.bin
                delegate: Loader {
                    required property var modelData
                    width: ListView.view.width
                    sourceComponent: win.page === "bin" ? binCard : memCard
                    property var item: modelData
                }
                Text {
                    anchors.centerIn: parent
                    visible: parent.count === 0
                    text: win.page === "bin" ? "The bin is empty." : "Nothing yet. Say “remember …” to SIOS, or add something above."
                    color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13
                }
            }
            Component { id: memCard; MemoryCard { modelData: parent ? parent.item : ({}) } }
            Component {
                id: binCard
                Rectangle {
                    width: parent ? parent.width : 0
                    implicitHeight: 52
                    radius: 14
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 14
                        Text { Layout.fillWidth: true; elide: Text.ElideRight; text: parent.parent.parent ? parent.parent.parent.item.text : ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14 }
                        Button { text: "Put back"; kind: "plain"; onClicked: win.act("memory.revert", { id: parent.parent.parent.item.id }, "Put back") }
                    }
                }
            }

            // waiting for your OK
            ListView {
                visible: win.page === "waiting"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 10
                model: win.waiting
                delegate: Rectangle {
                    required property var modelData
                    width: ListView.view.width
                    implicitHeight: col.implicitHeight + 28
                    radius: 14
                    color: Theme.aiSoft
                    border.width: 1
                    border.color: Theme.line
                    RowLayout {
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                        spacing: 10
                        Icon { name: "sparkles"; size: 18; color: Theme.aiInk; Layout.alignment: Qt.AlignTop }
                        ColumnLayout {
                            id: col
                            Layout.fillWidth: true
                            spacing: 4
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "SIOS noticed: " + modelData.text; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14 }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Why: " + modelData.why + " · " + modelData.group; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        }
                        Button { text: "Not now"; kind: "plain"; onClicked: win.act("memory.dismiss", { id: modelData.id }, "Dismissed") }
                        Button { text: "Keep it"; onClicked: win.act("memory.confirm", { id: modelData.id }, "Remembered") }
                    }
                }
                Text { anchors.centerIn: parent; visible: parent.count === 0; text: "Nothing waiting. SIOS suggests things it notices across your tasks."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }

            // sharing: which groups each connected AI may read (always your password)
            ListView {
                id: sharing
                visible: win.page === "sharing"
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                spacing: 10
                property var apps: []
                Component.onCompleted: reload()
                function reload() { broker.request("iam.apps", {}, "apps"); }
                Connections {
                    target: broker
                    function onDone(tag, ok, error) { if (tag === "apps" && ok) sharing.apps = ok.apps || []; }
                }
                model: sharing.apps
                delegate: Rectangle {
                    id: row
                    required property var modelData
                    readonly property var mine: win.shares[modelData.id] || []
                    width: ListView.view.width
                    implicitHeight: rc.implicitHeight + 28
                    radius: 14
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    ColumnLayout {
                        id: rc
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                        spacing: 8
                        Text { text: row.modelData.name + (row.modelData.paused ? " (paused)" : ""); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.Medium }
                        Flow {
                            Layout.fillWidth: true
                            spacing: 8
                            Repeater {
                                model: win.groups
                                delegate: Rectangle {
                                    required property string modelData
                                    readonly property bool on: row.mine.indexOf(modelData) >= 0
                                    implicitWidth: g.implicitWidth + 22; implicitHeight: 28; radius: 14
                                    color: on ? Theme.aiSoft : Theme.surface2
                                    border.width: 1
                                    border.color: on ? Theme.ai : Theme.line
                                    Text { id: g; anchors.centerIn: parent; text: modelData; color: parent.on ? Theme.aiInk : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                                    MouseArea {
                                        anchors.fill: parent
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            const next = parent.on ? row.mine.filter(x => x !== modelData) : row.mine.concat([modelData]);
                                            win.act("memory.share", { principal: row.modelData.id, groups: next }, "Sharing changed");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Text { anchors.centerIn: parent; visible: parent.count === 0; text: "No connected AI apps yet. Pair one in Settings, Connected AI apps."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
    }

    Toast { id: toast }
}
