// The Workspace's Review tab (D107): an agent's changes like a pull request, on the
// owner's own computer. Files with a check for each one read, the diff with line
// numbers, a comment on any line (sent back to the agent as its next task), a
// before-you-merge checklist, and open its copy in Files. Approve and
// merge or throw away ask for the password (the broker). Diff text is the agent's:
// plain text only.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

RowLayout {
    id: rv
    property var ws_
    readonly property var ch: ws_ ? ws_.changes : ({})
    readonly property var files: ch.files || []
    property int pick: 0
    property var seen: ({})
    property var notes: ({})            // "path:line" -> text
    property string editing: ""
    spacing: 0

    readonly property string path: files.length > pick && pick >= 0 ? files[pick].path : ""
    // the selected file's diff as rows: {k: " " "+" "-" "@", o: old line, n: new line, x: text}
    readonly property var rows: {
        const d = ch.diff || "";
        const part = d.split(/\n(?=diff --git )/).find(x => x.split("\n")[0].endsWith(" b/" + path)) || "";
        const out = [];
        let o = 0, n = 0, inHunk = false;
        for (const line of part.split("\n")) {
            const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
            if (h) { o = parseInt(h[1]); n = parseInt(h[2]); inHunk = true; out.push({ k: "@", o: 0, n: 0, x: line }); continue; }
            if (!inHunk || line.startsWith("\\")) continue;
            const c = line.charAt(0);
            if (c === "+") out.push({ k: "+", o: 0, n: n++, x: line.slice(1) });
            else if (c === "-") out.push({ k: "-", o: o++, n: 0, x: line.slice(1) });
            else out.push({ k: " ", o: o++, n: n++, x: line.slice(1) });
            if (out.length > 4000) break;
        }
        return out;
    }
    readonly property int noteCount: Object.keys(notes).length
    readonly property int seenCount: files.filter(f => seen[f.path]).length

    function noteKey(r) { return path + ":" + (r.n || r.o); }
    function setNote(key, text) { const m = Object.assign({}, notes); if (text.trim()) m[key] = text.trim(); else delete m[key]; notes = m; editing = ""; }
    function sendNotes() {
        const lines = Object.keys(notes).sort().map(k => "- " + k.replace(/:(\d+)$/, " line $1") + ": " + notes[k]);
        if (!lines.length) return;
        ws_.host.ask("agents.run", { id: ws_.agentId, task: "The owner reviewed your changes and left these comments. Please address each one, then commit:\n" + lines.join("\n") },
                     "Comments sent to " + ws_.a.name, "Couldn't send the comments", "It works on them as its next task.");
        notes = ({});
    }

    // ---------------------------------------------------------- files and commits
    Rectangle {
        Layout.preferredWidth: 256
        Layout.fillHeight: true
        color: Theme.surface
        Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }
        Flickable {
            anchors.fill: parent
            contentHeight: fc.implicitHeight + 24
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ColumnLayout {
                id: fc
                x: 10; y: 12
                width: parent.width - 20
                spacing: 3
                Text { Layout.leftMargin: 8; text: "COMMITS"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6 }
                Repeater {
                    model: (rv.ch.commits || []).slice(0, 8)
                    delegate: RowLayout {
                        required property var modelData
                        Layout.fillWidth: true; Layout.leftMargin: 8; Layout.rightMargin: 6
                        spacing: 6
                        Text { textFormat: Text.PlainText; text: modelData.id; color: Theme.fg3; font.family: "JetBrains Mono"; font.pixelSize: 11 }
                        Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                    }
                }
                Text { Layout.leftMargin: 8; Layout.topMargin: 14; textFormat: Text.PlainText; text: "FILES · " + rv.seenCount + " OF " + rv.files.length + " READ"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6 }
                Repeater {
                    model: rv.files
                    delegate: Rectangle {
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        implicitHeight: 34; radius: 8
                        color: rv.pick === index ? Theme.accentSoft : fm.containsMouse ? Theme.surface2 : "transparent"
                        Rectangle { visible: rv.pick === index; width: 2; height: parent.height; color: Theme.accent }
                        RowLayout {
                            anchors { fill: parent; leftMargin: 10; rightMargin: 8 }
                            spacing: 8
                            Rectangle { implicitWidth: 15; implicitHeight: 15; radius: 5; color: rv.seen[modelData.path] ? Theme.ok : "transparent"; border.width: rv.seen[modelData.path] ? 0 : 1.5; border.color: Theme.lineStrong
                                Icon { visible: !!rv.seen[modelData.path]; anchors.centerIn: parent; name: "check"; size: 10; color: "white" } }
                            Text { Layout.fillWidth: true; elide: Text.ElideMiddle; textFormat: Text.PlainText; text: modelData.path; color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12; font.weight: rv.pick === index ? Font.DemiBold : Font.Normal }
                            Text { textFormat: Text.PlainText; text: modelData.added === null || modelData.added === undefined ? "bin" : "+" + modelData.added; color: Theme.ok; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold }
                            Text { visible: !!modelData.removed; textFormat: Text.PlainText; text: "−" + modelData.removed; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold }
                        }
                        MouseArea { id: fm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: rv.pick = index }
                    }
                }
                Text { visible: !rv.files.length; Layout.margins: 8; Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText
                       text: rv.ws_ && rv.ws_.changesErr ? rv.ws_.changesErr : "Nothing to review yet."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
    }

    // ---------------------------------------------------------- the diff
    ColumnLayout {
        Layout.fillWidth: true
        Layout.fillHeight: true
        spacing: 0
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: Theme.surface2
            Rectangle {
                anchors { fill: parent; margins: 16 }
                visible: rv.path !== ""
                radius: 10; color: Theme.surface; border.width: 1; border.color: Theme.line
                clip: true
                ColumnLayout {
                    anchors.fill: parent
                    spacing: 0
                    Rectangle {
                        Layout.fillWidth: true
                        implicitHeight: 42; color: "transparent"
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
                        RowLayout {
                            anchors { fill: parent; leftMargin: 14; rightMargin: 12 }
                            spacing: 10
                            Text { Layout.fillWidth: true; elide: Text.ElideMiddle; textFormat: Text.PlainText; text: rv.path; color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 13; font.weight: Font.DemiBold }
                            Text {
                                textFormat: Text.PlainText
                                text: rv.seen[rv.path] ? "✓ Read" : "Mark as read"
                                color: rv.seen[rv.path] ? Theme.ok : Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { const m = Object.assign({}, rv.seen); m[rv.path] = !m[rv.path]; rv.seen = m; } }
                            }
                        }
                    }
                    ListView {
                        id: diffList
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        clip: true
                        model: rv.rows
                        boundsBehavior: Flickable.StopAtBounds
                        QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                        delegate: Column {
                            id: rowItem
                            required property var modelData
                            readonly property string key: rv.noteKey(modelData)
                            width: diffList.width
                            Rectangle {
                                width: parent.width
                                height: 21
                                color: rowItem.modelData.k === "+" ? "#ebf5ec" : rowItem.modelData.k === "-" ? "#faeeec" : rowItem.modelData.k === "@" ? Theme.surface3 : (lm.containsMouse ? Theme.surface2 : "transparent")
                                Row {
                                    anchors.verticalCenter: parent.verticalCenter
                                    Text { width: 46; horizontalAlignment: Text.AlignRight; rightPadding: 10; textFormat: Text.PlainText; text: rowItem.modelData.k === "@" ? "" : (rowItem.modelData.n || rowItem.modelData.o); color: "#b4b4ae"; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                    Text { width: 16; textFormat: Text.PlainText; text: rowItem.modelData.k === "@" ? "" : rowItem.modelData.k; color: rowItem.modelData.k === "+" ? Theme.ok : Theme.danger; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                    Text { textFormat: Text.PlainText; text: rowItem.modelData.x; color: rowItem.modelData.k === "+" ? "#2c6a36" : rowItem.modelData.k === "-" ? "#8c3d3d" : rowItem.modelData.k === "@" ? Theme.fg3 : Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                }
                                // the + to comment on this line
                                Rectangle {
                                    visible: lm.containsMouse && rowItem.modelData.k !== "@"
                                    x: 4; anchors.verticalCenter: parent.verticalCenter
                                    width: 17; height: 17; radius: 5; color: Theme.accent
                                    Icon { anchors.centerIn: parent; name: "plus"; size: 11; color: "white" }
                                }
                                MouseArea { id: lm; anchors.fill: parent; hoverEnabled: true; cursorShape: rowItem.modelData.k === "@" ? Qt.ArrowCursor : Qt.PointingHandCursor; onClicked: if (rowItem.modelData.k !== "@") rv.editing = rowItem.key }
                            }
                            // a comment on this line, or the box to write one
                            Rectangle {
                                visible: !!rv.notes[rowItem.key] || rv.editing === rowItem.key
                                x: 54; width: parent.width - 72
                                height: visible ? nc.implicitHeight + 22 : 0
                                radius: 10; color: Theme.surface; border.width: 1; border.color: Theme.line
                                ColumnLayout {
                                    id: nc
                                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 11 }
                                    spacing: 8
                                    RowLayout {
                                        visible: !!rv.notes[rowItem.key] && rv.editing !== rowItem.key
                                        spacing: 10
                                        Rectangle { implicitWidth: 24; implicitHeight: 24; radius: 12; color: Theme.accent; Text { anchors.centerIn: parent; text: "You"[0]; color: "white"; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold } }
                                        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: rv.notes[rowItem.key] || ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                                        Text { text: "Edit"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: rv.editing = rowItem.key } }
                                    }
                                    RowLayout {
                                        visible: rv.editing === rowItem.key
                                        spacing: 8
                                        Rectangle {
                                            Layout.fillWidth: true
                                            implicitHeight: 32; radius: 9; color: Theme.surface; border.width: 1; border.color: note.activeFocus ? Theme.accent : Theme.lineStrong
                                            QQC2.TextField {
                                                id: note
                                                anchors { fill: parent; leftMargin: 10; rightMargin: 6 }
                                                leftPadding: 0; background: null; placeholderText: "Comment on line " + (rowItem.modelData.n || rowItem.modelData.o) + "…"; placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13
                                                text: rv.notes[rowItem.key] || ""
                                                onVisibleChanged: if (visible) forceActiveFocus()
                                                onAccepted: rv.setNote(rowItem.key, text)
                                                Keys.onEscapePressed: rv.editing = ""
                                            }
                                        }
                                        Button { text: "Save"; onClicked: rv.setNote(rowItem.key, note.text) }
                                        Button { text: "Cancel"; kind: "plain"; onClicked: rv.editing = "" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Text { anchors.centerIn: parent; visible: rv.path !== "" && rv.rows.length === 0; textFormat: Text.PlainText; text: "No lines to show for this file (a new empty file, a binary, or the diff was cut short)."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
            Text { anchors.centerIn: parent; visible: rv.path === ""; textFormat: Text.PlainText; text: rv.ws_ && rv.ws_.working ? (rv.ws_.a.name || "It") + " is working. Its changes can be reviewed when it's done." : "Pick a file to see its changes."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
        }
        // the decision bar
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 58
            color: Theme.surface
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors { fill: parent; leftMargin: 18; rightMargin: 18 }
                spacing: 10
                Text { textFormat: Text.PlainText; text: rv.noteCount + (rv.noteCount === 1 ? " comment" : " comments"); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                Rectangle { implicitWidth: 140; implicitHeight: 6; radius: 3; color: Theme.surface3; Rectangle { width: parent.width * (rv.files.length ? rv.seenCount / rv.files.length : 0); height: 6; radius: 3; color: Theme.ok } }
                Text { textFormat: Text.PlainText; text: rv.seenCount + " of " + rv.files.length + " files read"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                Item { Layout.fillWidth: true }
                Button { text: "Refresh"; kind: "plain"; onClicked: rv.ws_.loadChanges() }
                Button { visible: rv.files.length > 0 && !rv.ws_.working; text: "Throw away"; kind: "danger"
                         onClicked: rv.ws_.host.confirm("Throw away " + rv.ws_.a.name + "'s work?", "Its copy of the project and everything on its branch is deleted. Your project isn't touched.", "Throw away", () => rv.ws_.host.ask("agents.discard", { id: rv.ws_.agentId }, "Its work was thrown away", "Couldn't throw it away")) }
                Button { visible: rv.noteCount > 0; text: "Send comments to " + (rv.ws_ ? rv.ws_.a.name : ""); kind: "plain"; onClicked: rv.sendNotes() }
                Button { visible: (rv.ch.commits || []).length > 0 && !rv.ws_.working; text: "✓ Approve and merge"
                         onClicked: rv.ws_.host.ask("agents.merge", { id: rv.ws_.agentId }, "Merged", "Couldn't merge", "Its work is in your project now.") }
            }
        }
    }

    // ---------------------------------------------------------- before you merge
    Rectangle {
        Layout.preferredWidth: 330
        Layout.fillHeight: true
        color: Theme.surface
        Rectangle { width: 1; height: parent.height; color: Theme.line }
        ColumnLayout {
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 18; leftMargin: 19 }
            spacing: 10
            Text { text: "BEFORE YOU MERGE"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6 }
            Repeater {
                model: rv.ch.files ? [
                    [rv.ch.project_clean, rv.ch.project_clean ? "Your project has no uncommitted changes" : "Your project has uncommitted changes: commit them first"],
                    [!rv.ch.project_moved_on, rv.ch.project_moved_on ? "Your project moved on by " + rv.ch.project_moved_on + " commits since it started (the merge checks for clashes)" : "Your project hasn't changed since it started"],
                    [!(rv.ch.links || []).length, (rv.ch.links || []).length ? "It adds links that point elsewhere: " + rv.ch.links.join(", ") : "No links that point elsewhere"],
                    [!rv.ws_.working, rv.ws_.working ? "It's still working" : "It has finished its task"]
                ] : []
                delegate: RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 9
                    Icon { Layout.alignment: Qt.AlignTop; name: modelData[0] ? "circle-check" : "triangle-alert"; size: 15; color: modelData[0] ? Theme.ok : Theme.warn }
                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: modelData[1]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                }
            }
            Rectangle { Layout.fillWidth: true; Layout.topMargin: 6; implicitHeight: 1; color: Theme.line }
            Text { Layout.topMargin: 4; text: "WHAT IT SAYS IT DID"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6 }
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: said.implicitHeight + 20; radius: 9; color: Theme.surface2; border.width: 1; border.color: Theme.line
                Text { id: said; anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 11 } wrapMode: Text.WordWrap; maximumLineCount: 8; elide: Text.ElideRight; textFormat: Text.PlainText
                       readonly property var last: (broker.team.reports || []).find(r => r.agent === (rv.ws_ ? rv.ws_.agentId : "") && r.kind === "done")
                       text: (last ? last.text : "No summary yet.") + "  (Its words; the diff is what counts.)"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }
            Rectangle { Layout.fillWidth: true; Layout.topMargin: 6; implicitHeight: 1; color: Theme.line }
            Text { Layout.topMargin: 4; text: "OPEN IT YOURSELF"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold; font.letterSpacing: 0.6 }
            Button { Layout.fillWidth: true; text: "Its copy in Files"; kind: "plain"; onClicked: rv.ws_.host.ask("agents.open", { id: rv.ws_.agentId, what: "folder" }, "", "Couldn't open it") }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: "SIOS doesn't open its copy in a code editor for you: files it wrote could make an editor run something as you. The diff here is safe to read."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            Button { Layout.fillWidth: true; visible: !rv.ws_.working; text: "Ask it to run its tests"; kind: "plain"
                     onClicked: rv.ws_.host.ask("agents.run", { id: rv.ws_.agentId, task: "Run the project's tests and report what passes and fails. Change nothing." }, rv.ws_.a.name + " is running its tests", "Couldn't start it") }
        }
    }
}
