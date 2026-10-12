// A line icon (Lucide, as in the preview) in any colour. Drawn by the app's
// "icon" image service, so it needs no GPU.
import QtQuick
import QtQuick.Layouts

Image {
    id: icon
    property string name
    property color color: Theme.fg
    property int size: 18
    width: size
    height: size
    // an image reports its own pixel size; layouts should use ours
    Layout.preferredWidth: size
    Layout.preferredHeight: size
    fillMode: Image.PreserveAspectFit
    sourceSize: Qt.size(size * 2, size * 2)
    source: name ? "image://icon/line/" + name + "/" + String(color).replace("#", "") : ""
    smooth: true
}
