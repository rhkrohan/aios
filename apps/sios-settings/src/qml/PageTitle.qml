// Settings' PageTitle (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    property string title
    property string sub
    Layout.fillWidth: true
    Layout.bottomMargin: 8
    spacing: 6
    Text { textFormat: Text.PlainText; text: parent.title; color: Theme.fg; font.family: Theme.display; font.pixelSize: 34; font.weight: Font.DemiBold }
    Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: parent.sub; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 15 }
}
