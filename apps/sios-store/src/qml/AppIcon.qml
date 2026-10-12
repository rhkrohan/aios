// An app's own icon from the catalog, in a soft rounded tile like the
// preview's CapTile; the first letter while it loads or if there's none.
import QtQuick

Rectangle {
    id: tile
    property string source
    property string name
    property int size: 56
    width: size
    height: size
    radius: size * 0.26
    color: img.status === Image.Ready ? "transparent" : Theme.accentSoft

    Image {
        id: img
        anchors.fill: parent
        anchors.margins: tile.size * 0.04
        source: tile.source
        sourceSize: Qt.size(tile.size * 2, tile.size * 2)
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        smooth: true
    }
    Text {
        anchors.centerIn: parent
        visible: img.status !== Image.Ready
        text: (tile.name || "?").charAt(0).toUpperCase()
        color: Theme.accent
        font.family: Theme.ui
        font.pixelSize: tile.size * 0.42
        font.weight: Font.DemiBold
    }
}
