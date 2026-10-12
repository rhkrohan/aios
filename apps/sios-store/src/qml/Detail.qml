// One app's page, like the preview's Store Detail: who makes it, Get or Open,
// what it can reach (from its sandbox settings), pictures, and what it is.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

Flickable {
    id: page
    property string appId
    property var app: ({})
    property var perms: null
    signal back()
    signal install(var app, var perms)

    contentHeight: column.height + 48
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    QQC2.ScrollBar.vertical: QQC2.ScrollBar {}

    function load() {
        app = catalog.app(appId);
        perms = null;
        catalog.loadPermissions(appId);
    }
    onAppIdChanged: load()
    Connections {
        target: catalog
        function onPermissionsReady(id, p) { if (id === page.appId) page.perms = p; }
        function onInstalledChanged() { if (page.appId) page.app = catalog.app(page.appId); }
    }

    ColumnLayout {
        id: column
        x: 32
        y: 20
        width: page.width - 64
        spacing: 20

        // back
        Row {
            spacing: 6
            Icon { name: "arrow-left"; size: 16; color: Theme.fg2; anchors.verticalCenter: parent.verticalCenter }
            Text { text: "Back"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: page.back() }
        }

        // header
        RowLayout {
            Layout.fillWidth: true
            spacing: 20
            AppIcon { source: page.app.icon || ""; name: page.app.name || ""; size: 96 }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: page.app.name || ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 26; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; text: page.app.summary || ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14; wrapMode: Text.WordWrap }
                Text { visible: !!page.app.developer; text: page.app.developer || ""; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                TrustBadge { Layout.topMargin: 6; level: page.perms ? page.perms.level : 0; label: page.perms && page.perms.known ? page.perms.label : "" }
            }
            ColumnLayout {
                spacing: 8
                readonly property var job: catalog.busy[page.appId]
                Button {
                    Layout.preferredWidth: 120
                    text: page.app.installed ? "Open" : "Get"
                    kind: page.app.installed ? "plain" : "primary"
                    busy: !!parent.job
                    progress: parent.job ? parent.job.progress : -1
                    onClicked: page.app.installed ? catalog.open(page.appId) : page.install(page.app, page.perms)
                }
                Button { visible: !!page.app.update && !parent.job; Layout.preferredWidth: 120; text: "Update"; onClicked: catalog.update(page.appId) }
                Button { visible: !!page.app.installed && !parent.job; Layout.preferredWidth: 120; text: "Remove"; kind: "danger"; onClicked: catalog.remove(page.appId) }
            }
        }

        // pictures
        ListView {
            Layout.fillWidth: true
            Layout.preferredHeight: 260
            visible: (page.app.screenshots || []).length > 0
            orientation: ListView.Horizontal
            spacing: 14
            clip: true
            model: page.app.screenshots || []
            delegate: Rectangle {
                required property string modelData
                width: Math.round(260 * 16 / 10)
                height: 260
                radius: 14
                color: Theme.surface2
                border.width: 1
                border.color: Theme.line
                clip: true
                Image { anchors.fill: parent; anchors.margins: 1; source: modelData; fillMode: Image.PreserveAspectCrop; asynchronous: true }
            }
        }

        // what it can reach
        Text { text: "What it can reach"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.DemiBold; Layout.topMargin: 4 }
        Text {
            visible: !page.perms
            text: "Checking its sandbox…"
            color: Theme.fg3
            font.family: Theme.ui
            font.pixelSize: 13
        }
        GridLayout {
            Layout.fillWidth: true
            columns: 2
            columnSpacing: 12
            rowSpacing: 12
            Repeater {
                model: page.perms ? page.perms.reach : []
                delegate: Rectangle {
                    required property var modelData
                    Layout.fillWidth: true
                    implicitHeight: fact.implicitHeight + 24
                    radius: 14
                    color: Theme.surface2
                    border.width: 1
                    border.color: Theme.line
                    RowLayout {
                        id: fact
                        anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 14 }
                        spacing: 12
                        Rectangle {
                            implicitWidth: 32; implicitHeight: 32; radius: 10
                            color: Theme.accentSoft
                            Icon { anchors.centerIn: parent; name: modelData.icon; size: 16; color: Theme.accent }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 1
                            Text { text: modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                            Text { Layout.fillWidth: true; text: modelData.body; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; wrapMode: Text.WordWrap }
                        }
                    }
                }
            }
        }

        // about
        Text { visible: !!page.app.description; text: "About"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.DemiBold; Layout.topMargin: 4 }
        Text {
            Layout.fillWidth: true
            visible: !!page.app.description
            text: page.app.description || ""
            textFormat: Text.StyledText
            wrapMode: Text.WordWrap
            color: Theme.fg2
            font.family: Theme.ui
            font.pixelSize: 14
            lineHeight: 1.25
        }
        Flow {
            Layout.fillWidth: true
            spacing: 24
            Repeater {
                model: [["Version", page.app.version || ""], ["License", page.app.license || ""], ["Website", (page.app.homepage || "").replace(/^https?:\/\//, "").replace(/\/$/, "")]]
                delegate: Column {
                    required property var modelData
                    visible: modelData[1] !== ""
                    spacing: 2
                    Text { text: modelData[0]; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    Text { text: modelData[1]; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                }
            }
        }
    }
}
