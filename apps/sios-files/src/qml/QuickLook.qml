// The space-bar preview, like the preview's files/QuickLook.tsx: a large look
// at the selected file without opening an app. Left and right move through
// the folder; Space or Esc closes.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: look
    property var item: null
    signal closed()
    signal step(int by)
    signal openItem(var item)

    visible: !!item
    color: Qt.rgba(10 / 255, 14 / 255, 22 / 255, 0.55)
    focus: visible

    Keys.onPressed: (e) => {
        if (e.key === Qt.Key_Space || e.key === Qt.Key_Escape) { look.closed(); e.accepted = true; }
        else if (e.key === Qt.Key_Right || e.key === Qt.Key_Down) { look.step(1); e.accepted = true; }
        else if (e.key === Qt.Key_Left || e.key === Qt.Key_Up) { look.step(-1); e.accepted = true; }
        else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter) { look.openItem(look.item); e.accepted = true; }
    }

    MouseArea { anchors.fill: parent; onClicked: look.closed() }

    Rectangle {
        id: card
        anchors.centerIn: parent
        width: Math.min(parent.width - 80, 860)
        height: Math.min(parent.height - 80, 620)
        radius: 18
        color: Theme.surface
        border.width: 1
        border.color: Theme.line
        MouseArea { anchors.fill: parent }

        ColumnLayout {
            anchors.fill: parent
            spacing: 0

            RowLayout {
                Layout.fillWidth: true
                Layout.margins: 14
                spacing: 10
                Text {
                    Layout.fillWidth: true
                    text: look.item ? look.item.name : ""
                    color: Theme.fg
                    font.family: Theme.ui
                    font.pixelSize: 14
                    font.weight: Font.DemiBold
                    elide: Text.ElideMiddle
                }
                Text { text: look.item ? [look.item.sizeText, look.item.modifiedText].filter(x => x).join("   ") : ""; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                Rectangle {
                    implicitWidth: openText.implicitWidth + 20
                    implicitHeight: 28
                    radius: 8
                    color: Theme.accent
                    Text { id: openText; anchors.centerIn: parent; text: "Open"; color: "white"; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: look.openItem(look.item) }
                }
                Icon { name: "x"; size: 18; color: Theme.fg2; MouseArea { anchors.fill: parent; onClicked: look.closed() } }
            }
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }

            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                readonly property string kind: look.item ? look.item.kind : ""

                // pictures: the file itself
                Image {
                    anchors.fill: parent
                    anchors.margins: 16
                    visible: parent.kind === "image"
                    source: visible && look.item ? look.item.location : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    sourceSize: Qt.size(1600, 1600)
                }
                // PDFs and videos: a big thumbnail
                Image {
                    anchors.fill: parent
                    anchors.margins: 16
                    visible: parent.kind === "pdf" || parent.kind === "video"
                    source: visible && look.item ? "image://thumb/" + encodeURIComponent(look.item.location) : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    sourceSize: Qt.size(900, 900)
                }
                // text and code: the start of the file
                Flickable {
                    id: textView
                    anchors.fill: parent
                    anchors.margins: 18
                    visible: ["text", "code"].indexOf(parent.kind) >= 0 && body.text !== ""
                    contentHeight: body.height
                    clip: true
                    Text {
                        id: body
                        width: textView.width
                        text: look.item && ["text", "code"].indexOf(look.item.kind) >= 0 ? fileOps.readText(look.item.location) : ""
                        color: Theme.fg
                        font.family: "JetBrains Mono"
                        font.pixelSize: 13
                        wrapMode: Text.WrapAnywhere
                        textFormat: Text.PlainText
                    }
                }
                // anything else: the big icon
                Column {
                    anchors.centerIn: parent
                    visible: ["image", "pdf", "video"].indexOf(parent.kind) < 0 && !textView.visible
                    spacing: 12
                    Disc { visible: !!look.item && look.item.isDir; anchors.horizontalCenter: parent.horizontalCenter; size: 160; name: look.item ? look.item.name : ""; stats: look.item && look.item.stats ? look.item.stats : ({ total: 0, segments: [] }); open: true }
                    FileIcon { visible: !!look.item && !look.item.isDir; anchors.horizontalCenter: parent.horizontalCenter; size: 160; kind: look.item ? look.item.kind : "text"; ext: look.item ? look.item.ext : ""; thumbnail: false }
                    Text { anchors.horizontalCenter: parent.horizontalCenter; text: look.item ? (look.item.isDir ? "Folder" : (look.item.mimeComment || "")) : ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                }
            }
        }
    }
}
