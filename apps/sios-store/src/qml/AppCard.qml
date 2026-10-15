// One app in a grid, like the preview's Popular cards: icon, name, what it
// does, who makes it, and Get or Open.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: card
    property var app
    signal open(string id)
    implicitHeight: 104
    radius: 16
    color: m.containsMouse ? Theme.surface2 : Theme.surface
    border.width: 1
    border.color: Theme.line

    MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: card.open(card.app.id) }

    RowLayout {
        anchors.fill: parent
        anchors.margins: 14
        spacing: 14
        AppIcon { source: card.app.icon || ""; name: card.app.name; size: 56 }
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: card.app.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold; elide: Text.ElideRight }
            Text { Layout.fillWidth: true; textFormat: Text.PlainText; text: card.app.summary || ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight }
            Text { Layout.fillWidth: true; visible: !!card.app.developer; textFormat: Text.PlainText; text: card.app.developer || ""; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; elide: Text.ElideRight }
        }
        Button {
            readonly property var job: catalog.busy[card.app.id]
            text: card.app.installed ? "Open" : "Get"
            kind: card.app.installed ? "plain" : "primary"
            busy: !!job
            progress: job ? job.progress : -1
            onClicked: card.app.installed ? catalog.open(card.app.id) : card.open(card.app.id)
        }
    }
}
