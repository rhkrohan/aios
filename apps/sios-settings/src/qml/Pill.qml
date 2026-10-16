// Settings' Pill (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

Rectangle {
    property string text
    property string kind: "ok"   // ok, danger, muted
    implicitWidth: pt.implicitWidth + 20
    implicitHeight: 24
    radius: 12
    color: kind === "ok" ? Theme.okSoft : kind === "danger" ? Theme.dangerSoft : Theme.surface3
    Text { id: pt; anchors.centerIn: parent; textFormat: Text.PlainText; text: parent.text; color: parent.kind === "ok" ? Theme.ok : parent.kind === "danger" ? Theme.danger : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
}
