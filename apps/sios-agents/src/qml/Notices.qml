// Small news in the window's top-right corner ("GitHub is on", "Saved").
// They fade after a few seconds. Anything
// that needs a decision opens an Alert window instead.
import QtQuick
import QtQuick.Layouts

Column {
    id: notices
    anchors { top: parent.top; right: parent.right; margins: 18 }
    spacing: 10
    width: 360
    z: 10

    // add(title, sub, {logo, error})
    function add(title, sub, opts) {
        const o = opts || {};
        list.append({ title: title, sub: sub || "", logo: o.logo || "", error: !!o.error });
        while (list.count > 3) list.remove(0);
    }

    ListModel { id: list }
    Repeater {
        model: list
        delegate: Rectangle {
            id: n
            required property int index
            required property string title
            required property string sub
            required property string logo
            required property bool error
            width: notices.width
            height: row.implicitHeight + 24
            radius: 14
            color: Theme.surface
            border.width: 1
            border.color: error ? Qt.rgba(Theme.danger.r, Theme.danger.g, Theme.danger.b, 0.45) : Theme.line
            Timer { running: true; interval: n.error ? 9000 : 6000; onTriggered: list.remove(n.index) }
            RowLayout {
                id: row
                anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                spacing: 12
                Logo { visible: n.logo !== ""; key: n.logo; size: 34 }
                Rectangle {
                    visible: n.logo === ""
                    implicitWidth: 34; implicitHeight: 34; radius: 10
                    color: n.error ? Theme.dangerSoft : Theme.okSoft
                    Icon { anchors.centerIn: parent; name: n.error ? "circle-alert" : "circle-check"; size: 17; color: n.error ? Theme.danger : Theme.ok }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 2
                    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: n.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                    Text { Layout.fillWidth: true; visible: n.sub !== ""; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: n.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                }
                Rectangle {
                    Layout.alignment: Qt.AlignTop
                    implicitWidth: 24; implicitHeight: 24; radius: 7
                    color: xm.containsMouse ? Theme.surface3 : "transparent"
                    Icon { anchors.centerIn: parent; name: "x"; size: 14; color: Theme.fg3 }
                    MouseArea { id: xm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: list.remove(n.index) }
                    Accessible.role: Accessible.Button
                    Accessible.name: "Close"
                }
            }
        }
    }
}
