// A Daylight slider: a thin track, the filled part in the accent colour, a
// white knob. `moved(value)` fires while dragging; `committed(value)` when let go.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.Slider {
    id: sl
    signal committed(real value)
    Layout.fillWidth: true
    implicitHeight: 28
    onPressedChanged: if (!pressed) committed(value)
    background: Rectangle {
        x: sl.leftPadding; y: sl.topPadding + sl.availableHeight / 2 - height / 2
        width: sl.availableWidth; height: 6; radius: 3
        color: Theme.surface3
        Rectangle { width: sl.visualPosition * parent.width; height: parent.height; radius: 3; color: sl.enabled ? Theme.accent : Theme.lineStrong }
    }
    handle: Rectangle {
        x: sl.leftPadding + sl.visualPosition * (sl.availableWidth - width); y: sl.topPadding + sl.availableHeight / 2 - height / 2
        width: 20; height: 20; radius: 10
        color: "white"; border.width: 1; border.color: sl.pressed ? Theme.accent : Theme.lineStrong
    }
}
