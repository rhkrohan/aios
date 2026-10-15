// SIOS Approve: one window, on top, listing what AIs are waiting for.
// Deny is the safe default (Esc). Allow asks the broker, which asks for the
// owner's password; this window never decides anything on its own.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 560
    height: Math.min(720, Math.max(260, list.contentHeight + 150))
    minimumWidth: 480
    // shown when something waits, while AI is stopped, or when opened on purpose
    property bool wanted: true
    visible: approvals.items.length > 0 || wanted
    onClosing: wanted = false
    flags: Qt.Dialog | Qt.WindowStaysOnTopHint
    title: approvals.stopped ? "All AI is stopped" : approvals.items.length === 0 ? "Nothing is waiting" : approvals.items.length === 1 ? "An AI is asking" : approvals.items.length + " AI requests are waiting"
    color: Theme.surface

    property string note: ""
    property bool noteError: false

    Connections {
        target: waker
        function onShown() { win.wanted = true; approvals.refresh(); win.raise(); win.requestActivate(); }
    }
    Connections {
        target: approvals
        function onMessage(text, error) { win.note = text; win.noteError = error; }
    }
    onVisibleChanged: if (visible) { raise(); requestActivate(); }

    // "sios" -> SIOS; "app:claude-code" -> claude-code (connected app); "helper:pip" -> pip (helper)
    function who(p) {
        if (p === "sios") return "SIOS";
        const i = p.indexOf(":");
        const kind = i < 0 ? "" : p.slice(0, i);
        const name = i < 0 ? p : p.slice(i + 1);
        if (kind === "app") return name + " (a connected app)";
        if (kind === "helper") return name + " (a SIOS helper)";
        if (kind === "unpaired") return name + " (an app you haven't paired)";
        return p;
    }
    function risk(t) {
        if (t.level === "irreversible") return ["Can't be undone", Theme.danger];
        if (t.level === "reversible") return ["Changes things, can be undone", Theme.warn];
        return ["Only looks", Theme.ok];
    }
    function places(paths) {
        if (!paths || paths.length === 0) return "no files";
        if (paths.some(p => p === "")) return "your whole home folder";
        return paths.join(", ");
    }
    function minutes(s) { return s >= 3600 ? Math.round(s / 3600) + " h" : Math.max(1, Math.round(s / 60)) + " min"; }

    Shortcut { sequence: "Escape"; onActivated: if (approvals.items.length) approvals.deny(approvals.items[0].id) }

    component Chip: Rectangle {
        property string text
        property color ink: Theme.fg2
        implicitWidth: t.implicitWidth + 16; implicitHeight: 22; radius: 11
        color: Theme.surface2; border.width: 1; border.color: Theme.line
        Text { id: t; anchors.centerIn: parent; text: parent.text; color: parent.ink; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Medium }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 22
        spacing: 14

        RowLayout {
            spacing: 12
            Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 12; color: Theme.aiSoft; Icon { anchors.centerIn: parent; name: "shield-check"; size: 20; color: Theme.aiInk } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: win.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.DemiBold }
                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: approvals.sessionOpen
                          ? "Approvals are open until you lock the screen: SIOS's own changes that can be undone need just a click. Sending, deleting for good and other AIs still ask for your password."
                          : "Nothing happens until you say yes. Yes asks for your password; after that, SIOS's own undoable changes are a click until you lock the screen."
                    color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                }
            }
            ColumnLayout {
                spacing: 6
                // Stop is always here and never asks for a password (D41)
                Button { text: "Stop all AI"; kind: "danger"; visible: !approvals.stopped; onClicked: approvals.stopAll() }
                Button { text: "End session"; kind: "plain"; visible: approvals.sessionOpen; onClicked: approvals.endSession() }
            }
        }

        // while stopped: what that means, and Resume (password)
        Rectangle {
            visible: approvals.stopped
            Layout.fillWidth: true
            implicitHeight: stoppedBody.implicitHeight + 32
            radius: 14
            color: Theme.surface2
            border.width: 1
            border.color: Theme.danger
            RowLayout {
                id: stoppedBody
                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 16 }
                spacing: 12
                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: "Every AI was stopped: their passes are cancelled, waiting requests were declined, and no AI can act or use the AI connection. Resume when you're ready; each AI will have to ask again."
                    color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13
                }
                Button { text: "Resume"; busy: approvals.busy === "resume"; onClicked: approvals.resumeAll() }
            }
        }

        ListView {
            id: list
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 12
            model: approvals.items
            delegate: Rectangle {
                id: card
                required property var modelData
                readonly property bool isPass: modelData.kind === "pass"
                readonly property var toolList: isPass ? modelData.tools : [modelData.tool]
                width: ListView.view.width
                implicitHeight: body.implicitHeight + 36
                radius: 14
                color: Theme.surface
                border.width: 1
                border.color: Theme.line

                ColumnLayout {
                    id: body
                    anchors { left: parent.left; right: parent.right; top: parent.top; margins: 18 }
                    spacing: 10

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: "<b>" + win.who(card.modelData.principal) + "</b> wants to " + (card.isPass ? "work on this goal:" : "do this now:")
                        textFormat: Text.StyledText
                        color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14
                    }
                    Text {
                        visible: card.modelData.goal !== ""
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        text: "“" + card.modelData.goal + "”"
                        color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.italic: true
                    }
                    Repeater {
                        model: card.toolList
                        delegate: RowLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 8
                            Text { Layout.fillWidth: true; text: modelData.about || modelData.name; wrapMode: Text.WordWrap; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            Chip { text: win.risk(modelData)[0]; ink: win.risk(modelData)[1] }
                            Chip { visible: modelData.egress; text: "Sends out"; ink: Theme.danger }
                        }
                    }
                    // a call: its arguments, as they will be used
                    Repeater {
                        model: card.isPass ? [] : Object.keys(card.modelData.args || {})
                        delegate: Text {
                            required property string modelData
                            Layout.fillWidth: true
                            wrapMode: Text.WrapAnywhere
                            maximumLineCount: 4
                            elide: Text.ElideRight
                            text: modelData + ": " + JSON.stringify(card.modelData.args[modelData])
                            color: Theme.fg2; font.family: "JetBrains Mono"; font.pixelSize: 12
                        }
                    }
                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
                        text: card.isPass
                              ? "Where: " + win.places(card.modelData.paths) + ". For " + win.minutes(card.modelData.expires_in) + (card.modelData.uses ? ", up to " + card.modelData.uses + " actions" : "") + (card.modelData.sends_out ? ". May send things off this computer (asks again each time)." : ". Nothing leaves this computer.")
                              : "Why it asks: " + card.modelData.reason
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8
                        Item { Layout.fillWidth: true }
                        Button { text: "Deny"; kind: "plain"; onClicked: approvals.deny(card.modelData.id) }
                        Button {
                            text: "Allow"
                            busy: approvals.busy === card.modelData.id
                            onClicked: approvals.allow(card.modelData.kind, card.modelData.id)
                        }
                    }
                }
            }
        }

        Text {
            visible: win.note !== ""
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            text: win.note
            color: win.noteError ? Theme.danger : Theme.ok
            font.family: Theme.ui; font.pixelSize: 13
        }
    }
}
