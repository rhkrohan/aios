// Installing an app, like the preview's InstallFlow: first a calm review of
// what it can reach, then progress, then "Ready" with Open.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: sheet
    property var app: null
    property var perms: null
    property string step: "review"   // review | installing | ready | failed
    property string error: ""
    signal closed()

    visible: !!app
    color: Qt.rgba(10 / 255, 14 / 255, 22 / 255, 0.45)
    MouseArea { anchors.fill: parent; onClicked: if (sheet.step !== "installing") sheet.closed() }

    readonly property var job: app ? catalog.busy[app.id] : undefined
    Connections {
        target: catalog
        function onFinished(id, action, ok, message) {
            if (!sheet.app || id !== sheet.app.id || action !== "install") return;
            sheet.step = ok ? "ready" : "failed";
            sheet.error = message;
        }
    }

    Rectangle {
        anchors.centerIn: parent
        width: 440
        height: body.implicitHeight + 48
        radius: 20
        color: Theme.surface
        border.width: 1
        border.color: Theme.line
        MouseArea { anchors.fill: parent }

        ColumnLayout {
            id: body
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 24 }
            spacing: 16

            // the steps, as in the preview
            Row {
                spacing: 8
                Repeater {
                    model: [["review", "Review"], ["installing", "Installing"], ["ready", "Ready"]]
                    delegate: Row {
                        required property var modelData
                        required property int index
                        readonly property int at: ["review", "installing", "ready"].indexOf(sheet.step === "failed" ? "installing" : sheet.step)
                        spacing: 8
                        Rectangle {
                            width: 22; height: 22; radius: 11
                            color: index <= parent.at ? Theme.accent : Theme.surface3
                            Text { anchors.centerIn: parent; text: index + 1; color: index <= parent.parent.at ? "white" : Theme.fg3; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold }
                        }
                        Text { anchors.verticalCenter: parent.verticalCenter; text: modelData[1]; color: index <= parent.at ? Theme.fg : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.Medium }
                        Rectangle { visible: index < 2; anchors.verticalCenter: parent.verticalCenter; width: 18; height: 1; color: Theme.line }
                    }
                }
            }

            RowLayout {
                spacing: 14
                AppIcon { source: sheet.app ? sheet.app.icon || "" : ""; name: sheet.app ? sheet.app.name : ""; size: 56 }
                ColumnLayout {
                    spacing: 2
                    Text { text: sheet.app ? sheet.app.name : ""; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.DemiBold }
                    Text { text: sheet.app && sheet.app.developer ? sheet.app.developer : "From Flathub"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                }
            }

            // review: what it will be able to reach
            ColumnLayout {
                visible: sheet.step === "review"
                Layout.fillWidth: true
                spacing: 8
                TrustBadge { level: sheet.perms ? sheet.perms.level : 0; label: sheet.perms && sheet.perms.known ? sheet.perms.label : "" }
                Repeater {
                    model: sheet.perms ? sheet.perms.reach : []
                    delegate: RowLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: 10
                        Icon { name: modelData.icon; size: 15; color: Theme.fg2 }
                        Text { Layout.fillWidth: true; text: modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                    }
                }
                Text {
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: "Apps run in their own sandbox. You can remove it anytime from Installed."
                    color: Theme.fg3
                    font.family: Theme.ui
                    font.pixelSize: 12
                }
            }

            // installing
            ColumnLayout {
                visible: sheet.step === "installing"
                Layout.fillWidth: true
                spacing: 8
                Text { text: sheet.job && sheet.job.progress >= 0 ? "Installing… " + sheet.job.progress + "%" : "Installing…"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 6
                    radius: 3
                    color: Theme.surface3
                    Rectangle {
                        width: parent.width * (sheet.job && sheet.job.progress >= 0 ? sheet.job.progress / 100 : 0.15)
                        height: parent.height
                        radius: 3
                        color: Theme.accent
                        Behavior on width { NumberAnimation { duration: 250 } }
                    }
                }
            }

            Text {
                visible: sheet.step === "ready"
                text: "Ready. You'll find it in Apps and in Installed."
                color: Theme.ok
                font.family: Theme.ui
                font.pixelSize: 13
                font.weight: Font.Medium
            }
            Text {
                visible: sheet.step === "failed"
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: "That didn't install. " + (sheet.error || "Check the internet connection and try again.")
                color: Theme.danger
                font.family: Theme.ui
                font.pixelSize: 13
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.topMargin: 4
                Item { Layout.fillWidth: true }
                Button { visible: sheet.step !== "installing"; text: sheet.step === "ready" ? "Done" : "Cancel"; kind: "plain"; onClicked: sheet.closed() }
                Button {
                    visible: sheet.step === "review" || sheet.step === "ready"
                    text: sheet.step === "ready" ? "Open" : "Install"
                    onClicked: {
                        if (sheet.step === "ready") { catalog.open(sheet.app.id); sheet.closed(); return; }
                        sheet.step = "installing";
                        catalog.install(sheet.app.id);
                    }
                }
            }
        }
    }
}
