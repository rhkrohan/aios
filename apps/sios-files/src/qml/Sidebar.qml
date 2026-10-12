// The sidebar, like the preview's Files: Places, Views, Trash and how full
// the disk is. Drop files on a place to move them there.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: side
    property string location
    property int webCount: 0
    signal go(string location)
    signal dropped(var locations, string toFolder, bool copy)

    color: Theme.surface2
    implicitWidth: 208

    Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }

    readonly property string home: fileOps.home
    function at(sub) { return home + "/" + sub; }

    component Header: Text {
        Layout.leftMargin: 18
        Layout.topMargin: 14
        Layout.bottomMargin: 4
        color: Theme.fg3
        font.family: Theme.ui
        font.pixelSize: 12
        font.weight: Font.DemiBold
    }

    component Place: Rectangle {
        id: place
        property string label
        property string icon
        property string target
        property color tint: Theme.ai
        property string count: ""
        property bool enabledView: true
        property string note: ""
        readonly property bool current: side.location === target
        Layout.fillWidth: true
        Layout.leftMargin: 8
        Layout.rightMargin: 8
        implicitHeight: 34
        radius: 10
        color: current ? Theme.surface : (hover.containsMouse && enabledView ? Theme.surface3 : (drop.containsDrag ? Theme.accentSoft : "transparent"))
        border.width: current ? 1 : 0
        border.color: Theme.line
        opacity: enabledView ? 1 : 0.55

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 10
            anchors.rightMargin: 10
            spacing: 10
            Rectangle {
                implicitWidth: 22
                implicitHeight: 22
                radius: 6
                color: Qt.rgba(place.tint.r, place.tint.g, place.tint.b, Theme.dark ? 0.2 : 0.12)
                Icon { anchors.centerIn: parent; name: place.icon; size: 14; color: place.tint }
            }
            Text {
                Layout.fillWidth: true
                text: place.label
                color: Theme.fg
                font.family: Theme.ui
                font.pixelSize: 14
                font.weight: place.current ? Font.DemiBold : Font.Normal
                elide: Text.ElideRight
            }
            Text { visible: place.count !== ""; text: place.count; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        }
        MouseArea {
            id: hover
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: place.enabledView ? Qt.PointingHandCursor : Qt.ArrowCursor
            onClicked: if (place.enabledView) side.go(place.target)
        }
        DropArea {
            id: drop
            anchors.fill: parent
            enabled: place.enabledView && place.target.startsWith("file:")
            keys: ["text/uri-list"]
            onDropped: (d) => { side.dropped(d.urls.map(u => String(u)), place.target, d.proposedAction === Qt.CopyAction); d.accept(); }
        }
        ToolTipBubble { visible: hover.containsMouse && place.note !== ""; text: place.note }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }

    component ToolTipBubble: Rectangle {
        property string text
        x: parent.width - 8
        y: (parent.height - height) / 2
        z: 10
        width: tipText.implicitWidth + 16
        height: 26
        radius: 8
        color: "#1b2027"
        Text { id: tipText; anchors.centerIn: parent; text: parent.text; color: "white"; font.family: Theme.ui; font.pixelSize: 12 }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.bottomMargin: 12
        spacing: 2

        Header { text: "Places" }
        Place { label: "Home"; icon: "house"; target: side.home }
        Place { label: "Documents"; icon: "file-text"; target: side.at("Documents") }
        Place { label: "Downloads"; icon: "download"; target: side.at("Downloads") }
        Place { label: "Projects"; icon: "code-xml"; target: side.at("Projects") }
        Place { label: "Pictures"; icon: "image"; target: side.at("Pictures") }

        Header { text: "Views" }
        Place { label: "Recent"; icon: "clock"; target: "recentlyused:/files"; tint: Theme.fg2 }
        Place { label: "From the web"; icon: "globe"; target: "web:"; tint: "#c9852e"; count: side.webCount > 0 ? String(side.webCount) : "" }
        Place { label: "Threads"; icon: "git-branch"; target: "ai:threads"; enabledView: false; note: "Arrives with the assistant" }
        Place { label: "Changed by AI"; icon: "sparkles"; target: "ai:changed"; tint: Theme.ai; enabledView: false; note: "Arrives with the assistant" }
        Place { label: "Sensitive"; icon: "lock"; target: "ai:sensitive"; tint: Theme.danger; enabledView: false; note: "Arrives with the assistant" }

        Item { Layout.fillHeight: true }

        Place { label: "Trash"; icon: "trash-2"; target: "trash:/"; tint: Theme.fg2 }

        // how full the disk is
        ColumnLayout {
            Layout.fillWidth: true
            Layout.leftMargin: 18
            Layout.rightMargin: 18
            Layout.topMargin: 10
            spacing: 6
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 4
                radius: 2
                color: Theme.surface3
                Rectangle {
                    width: parent.width * Math.min(1, fileOps.storage.fraction || 0)
                    height: parent.height
                    radius: 2
                    color: Theme.accent
                }
            }
            Text { text: fileOps.storage.text || ""; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        }
    }
}
