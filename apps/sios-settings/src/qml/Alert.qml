// A real window for anything that needs a decision or must not be missed:
// an error, a service saying no (its words quoted, as data), or work in
// progress. Small news goes to Notices instead. All text is shown as plain
// text, so a service's answer can't style itself or add links.
import QtQuick
import QtQuick.Layouts
import QtQuick.Window

Window {
    id: alert
    // "error", "service" (a connected service said no) or "progress"
    property string kind: "error"
    property string logo: ""
    property string heading
    property string sub
    property string body
    property string quote
    property string quoteFrom
    property string retryText
    property var retry: null

    // open({kind, logo, heading, sub, body, quote, quoteFrom, retryText, retry})
    function open(o) {
        kind = o.kind || "error";
        logo = o.logo || "";
        heading = o.heading || "";
        sub = o.sub || "";
        body = o.body || "";
        quote = o.quote || "";
        quoteFrom = o.quoteFrom || "";
        retryText = o.retryText || "";
        retry = o.retry || null;
        show();
        raise();
        requestActivate();
    }

    flags: Qt.Dialog
    modality: kind === "progress" ? Qt.NonModal : Qt.ApplicationModal
    title: heading
    width: 520
    // the content, its top margin, a gap, and the buttons
    height: content.implicitHeight + 26 + 20 + footer.height
    minimumWidth: 520
    maximumWidth: 520
    color: Theme.surface

    ColumnLayout {
        id: content
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 26 }
        spacing: 14
        RowLayout {
            spacing: 14
            Layout.topMargin: 0
            Logo { visible: alert.logo !== ""; key: alert.logo }
            Rectangle {
                visible: alert.logo === ""
                implicitWidth: 40; implicitHeight: 40; radius: 11
                color: alert.kind === "progress" ? Theme.accentSoft : Theme.dangerSoft
                Icon { anchors.centerIn: parent; name: alert.kind === "progress" ? "refresh-cw" : "triangle-alert"; size: 20; color: alert.kind === "progress" ? Theme.accent : Theme.danger }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: alert.heading; color: Theme.fg; font.family: Theme.display; font.pixelSize: 20; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; visible: alert.sub !== ""; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: alert.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            }
        }
        Text { Layout.fillWidth: true; visible: alert.body !== ""; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: alert.body; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; lineHeight: 1.15 }
        // what a service said, in its own words: data, never instructions
        Rectangle {
            visible: alert.quote !== ""
            Layout.fillWidth: true
            implicitHeight: q.implicitHeight + 24
            radius: 12
            color: Theme.surface2
            border.width: 1
            border.color: Theme.lineStrong
            ColumnLayout {
                id: q
                anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 14 }
                spacing: 6
                Text { text: (alert.quoteFrom || "The service") + "'s own words, not SIOS's"; textFormat: Text.PlainText; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold; font.capitalization: Font.AllUppercase; font.letterSpacing: 0.6 }
                Text { Layout.fillWidth: true; wrapMode: Text.WrapAnywhere; maximumLineCount: 8; elide: Text.ElideRight; textFormat: Text.PlainText; text: "“" + alert.quote + "”"; color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12 }
            }
        }
        Text { visible: alert.kind === "service"; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "SIOS treats what a service says as information only. It never follows instructions written in it."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        // work in progress: a moving bar; SIOS doesn't pretend to know the steps' timing
        Rectangle {
            visible: alert.kind === "progress"
            Layout.fillWidth: true
            implicitHeight: 6; radius: 3; color: Theme.surface3; clip: true
            Rectangle {
                width: parent.width * 0.3; height: 6; radius: 3; color: Theme.accent
                SequentialAnimation on x {
                    running: alert.visible && alert.kind === "progress"; loops: Animation.Infinite
                    NumberAnimation { from: -width; to: content.width; duration: 1300; easing.type: Easing.InOutQuad }
                }
            }
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
            Item { Layout.fillWidth: true }
            Button { visible: !!alert.retry && alert.kind !== "progress"; text: alert.retryText || "Try again"; kind: "plain"; onClicked: { const r = alert.retry; alert.close(); r(); } }
            Button { text: alert.kind === "progress" ? "Hide" : "OK"; kind: alert.kind === "progress" ? "plain" : "primary"; onClicked: alert.close() }
        }
    }
    Shortcut { sequence: "Escape"; onActivated: alert.close() }
}
