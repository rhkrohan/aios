// Making an agent (Daylight): its name and colour, what it thinks with (said
// plainly: a coding CLI builds things, SIOS tidies and reminds), its job or its
// project, and its limits. One password for all of it, including a coding
// agent's first working time.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import QtQuick.Window
import QtQuick.Dialogs
import QtCore

Window {
    id: na
    property string brain: "claude-code"
    readonly property bool coder: brain !== "builtin"
    // the coding CLIs SIOS can run (D100): logo, colour, name, what it is
    readonly property var coders: [
        ["claude-code", "logo-claude", "#d97757", "Claude Code", "Anthropic's coding agent."],
        ["codex", "logo-openai", "", "Codex", "OpenAI's coding agent."],
        ["cursor", "logo-cursor", "", "Cursor", "Cursor's agent, in the terminal."],
        ["gemini", "logo-googlegemini", "#8e75b2", "Gemini", "Google's coding agent."]
    ]
    readonly property var installed: broker.team.installed || ({})
    property string job: "project"
    property string tint: "mint"
    property int hours: 2
    property var taskTok: 2000000
    property var dayTok: 6000000

    function open() {
        brain = "claude-code"; job = "project"; tint = "mint"; hours = 2; taskTok = 2000000; dayTok = 6000000;
        nameF.text = ""; whatF.text = ""; folderF.text = ""; everyF.text = ""; atF.text = "";
        show(); raise(); requestActivate();
        nameF.field.forceActiveFocus();
    }

    flags: Qt.Dialog
    modality: Qt.ApplicationModal
    title: "New agent"
    width: 660
    minimumWidth: 660
    maximumWidth: 660
    height: body.implicitHeight + 48 + footer.height
    color: Theme.surface

    readonly property var pets: ({ mint: "#9ee2c6", sky: "#a9cdff", violet: "#c4bbff", peach: "#ffc9a3", rose: "#ffb3c8", lemon: "#f7df8c", slate: "#c3cbd4", coral: "#ffb0a3" })

    component Label: Text { color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold; font.capitalization: Font.AllUppercase; font.letterSpacing: 0.8 }
    component Field: Rectangle {
        property alias text: tf.text
        property alias placeholder: tf.placeholderText
        property alias field: tf
        property alias validator: tf.validator
        Layout.fillWidth: true
        implicitHeight: 38; radius: 10
        color: Theme.surface; border.width: 1; border.color: tf.activeFocus ? Theme.accent : Theme.lineStrong
        QQC2.TextField {
            id: tf
            anchors { fill: parent; leftMargin: 12; rightMargin: 8 }
            leftPadding: 0; background: null
            placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14
        }
    }
    component Choice: Rectangle {
        id: ch
        property string key
        property string icon
        property color iconColor
        property string heading
        property string sub
        readonly property bool on: na.brain === key
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        implicitHeight: cr.implicitHeight + 28
        radius: 14
        color: on ? Theme.accentSoft : Theme.surface
        border.width: on ? 2 : 1
        border.color: on ? Theme.accent : Theme.line
        RowLayout {
            id: cr
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
            spacing: 12
            Rectangle { Layout.alignment: Qt.AlignTop; implicitWidth: 34; implicitHeight: 34; radius: 10; color: Theme.surface; border.width: 1; border.color: Theme.line; Icon { anchors.centerIn: parent; name: ch.icon; size: 18; color: ch.iconColor } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 3
                Text { textFormat: Text.PlainText; text: ch.heading; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: ch.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            }
        }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { na.brain = ch.key; na.job = ch.key !== "builtin" ? "project" : "on-demand"; } }
    }
    component Seg: Row {
        id: sg
        property var options: []
        property var value
        signal picked(var v)
        Repeater {
            model: sg.options
            delegate: Rectangle {
                required property var modelData
                readonly property bool on: sg.value === modelData[0]
                width: sl.implicitWidth + 26; height: 32
                color: on ? Theme.accent : Theme.surface
                border.width: 1; border.color: Theme.lineStrong
                Text { id: sl; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData[1]; color: parent.on ? "white" : Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: parent.on ? Font.DemiBold : Font.Normal }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: sg.picked(modelData[0]) }
            }
        }
    }

    ColumnLayout {
        id: body
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 26; topMargin: 24 }
        spacing: 14
        RowLayout {
            spacing: 14
            Rectangle {
                implicitWidth: 48; implicitHeight: 48; radius: 24; color: na.pets[na.tint]
                Row { anchors.centerIn: parent; spacing: 8; Repeater { model: 2; Rectangle { width: 5; height: 5; radius: 2.5; color: "#1d1d1f" } } }
            }
            ColumnLayout {
                spacing: 2
                Text { text: "New agent"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 22; font.weight: Font.DemiBold }
                Text { text: "It gets its own identity, its own desk and only the rights you give it."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
        RowLayout {
            spacing: 10
            Field { id: nameF; placeholder: "Its name: Coder, Pip, Scout..." }
            Repeater {
                model: ["mint", "sky", "violet", "peach", "rose", "lemon"]
                delegate: Rectangle {
                    required property string modelData
                    implicitWidth: 24; implicitHeight: 24; radius: 12
                    color: na.pets[modelData]
                    border.width: na.tint === modelData ? 2 : 0
                    border.color: Theme.accent
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: na.tint = modelData }
                }
            }
        }
        Label { text: "What it thinks with" }
        Choice { key: "builtin"; icon: "bot"; iconColor: Theme.ai; heading: "SIOS"; sub: "Sorts and moves files, watches folders, reminds you. Can't write code." }
        // a coding agent: builds and changes code in its own copy of a project, signs in once in its own sandbox
        GridLayout {
            Layout.fillWidth: true
            columns: 2
            columnSpacing: 10
            rowSpacing: 10
            Repeater {
                model: na.coders
                delegate: Choice {
                    required property var modelData
                    readonly property string inst: na.installed[modelData[0]] || "no"
                    key: modelData[0]; icon: modelData[1]; iconColor: modelData[2] || Theme.fg; heading: modelData[3]
                    sub: modelData[4] + (inst === "yes" ? " Installed." : inst === "installing" ? " Installing now…" : " Not installed yet: SIOS can install it (asks for your password).")
                }
            }
        }
        RowLayout {
            visible: na.coder && (na.installed[na.brain] || "no") === "no"
            spacing: 10
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "SIOS installs it from its maker into your home folder, then you sign it in once in its own sandbox."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            Button { text: "Install"; kind: "plain"; onClicked: broker.request("agents.install_brain", { brain: na.brain }, "Installing|Couldn't install it|A notification says when it's done.") }
        }
        Label { textFormat: Text.PlainText; text: na.coder ? "Project" : "When it works" }
        Flow {
            visible: na.brain === "builtin"
            Layout.fillWidth: true
            spacing: 8
            Repeater {
                model: [["on-demand", "When I ask"], ["watch", "Watch a folder"], ["every", "Every few minutes"], ["daily", "Every day at"]]
                delegate: Rectangle {
                    required property var modelData
                    readonly property bool on: na.job === modelData[0]
                    implicitWidth: jl.implicitWidth + 26; implicitHeight: 32; radius: 16
                    color: on ? Theme.accent : Theme.surface
                    border.width: 1; border.color: on ? Theme.accent : Theme.lineStrong
                    Text { id: jl; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData[1]; color: parent.on ? "white" : Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: na.job = modelData[0] }
                }
            }
        }
        FolderDialog {
            id: folderPick
            title: na.coder ? "Pick its project folder" : "Pick a folder"
            currentFolder: StandardPaths.writableLocation(StandardPaths.HomeLocation)
            onAccepted: {
                const home = String(StandardPaths.writableLocation(StandardPaths.HomeLocation)).replace(/\/$/, "") + "/";
                const picked = decodeURIComponent(String(selectedFolder));
                folderF.text = picked.startsWith(home) ? picked.slice(home.length) : picked.replace(/^file:\/\//, "");
            }
        }
        RowLayout {
            spacing: 8
            Field { id: folderF; visible: na.coder || na.job === "watch"; placeholder: na.coder ? "Project folder in your home, e.g. Projects/portfolio-site" : "Folder, e.g. Downloads" }
            Button { visible: folderF.visible; text: "Browse…"; kind: "plain"; onClicked: folderPick.open() }
            Field { id: everyF; visible: na.brain === "builtin" && na.job === "every"; placeholder: "Minutes (at least 5)"; validator: IntValidator { bottom: 5; top: 10080 } }
            Field { id: atF; visible: na.brain === "builtin" && na.job === "daily"; placeholder: "08:30" }
        }
        Text {
            visible: na.coder
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            textFormat: Text.PlainText
            text: "It works on its own branch in its own copy; your files change only when you bring its work in. A folder that isn't a git project yet can become one from its Settings."
            color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
        }
        Field { id: whatF; placeholder: na.coder ? "What it works on: “Keep the site working and add the contact page”" : "What it does: “Sort new files into folders by type”" }
        Label { visible: na.coder; text: "Limits, per task" }
        RowLayout {
            visible: na.coder
            spacing: 18
            ColumnLayout { spacing: 6; Text { text: "Time"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } Seg { options: [[1, "1 h"], [2, "2 h"], [4, "4 h"], [8, "8 h"]]; value: na.hours; onPicked: v => na.hours = v } }
            ColumnLayout { spacing: 6; Text { text: "Tokens"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } Seg { options: [[500000, "500k"], [1000000, "1M"], [2000000, "2M"], [5000000, "5M"]]; value: na.taskTok; onPicked: v => na.taskTok = v } }
            ColumnLayout { spacing: 6; Text { text: "Per day"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 } Seg { options: [[2000000, "2M"], [6000000, "6M"], [20000000, "20M"]]; value: na.dayTok; onPicked: v => na.dayTok = v } }
        }
    }

    Rectangle {
        id: footer
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        height: 62
        color: Theme.surface2
        Rectangle { width: parent.width; height: 1; color: Theme.line }
        RowLayout {
            anchors { fill: parent; leftMargin: 20; rightMargin: 20 }
            spacing: 8
            Text { text: "Making an agent asks for your password."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            Item { Layout.fillWidth: true }
            Button { text: "Cancel"; kind: "plain"; onClicked: na.close() }
            Button {
                text: nameF.text.trim() ? "Make " + nameF.text.trim() : "Make agent"
                onClicked: {
                    const p = { name: nameF.text, brain: na.brain, job: na.job, instructions: whatF.text, color: na.tint };
                    if (folderF.visible) p.folder = folderF.text;
                    if (everyF.visible) p.every_min = parseInt(everyF.text) || 60;
                    if (atF.visible) p.at = atF.text;
                    if (na.coder) { p.lease_hours = na.hours; p.max_task_tokens = na.taskTok; p.max_day_tokens = Math.max(na.dayTok, na.taskTok); }
                    broker.request("agents.add", p, "Agent made|Couldn't make the agent|" + (na.coder ? "Open it to sign it in and give it a task." : ""));
                }
            }
        }
    }
    Shortcut { sequence: "Escape"; onActivated: na.close() }
}
