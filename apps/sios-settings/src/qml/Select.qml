// A Daylight dropdown. model: [[value, label], ...]; `picked(value)` when the
// owner chooses. The shown item follows `value`.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ComboBox {
    id: cb
    property var options: []
    property var value
    signal picked(var v)
    model: options.map(o => o[1])
    currentIndex: Math.max(0, options.findIndex(o => o[0] === value))
    onActivated: i => picked(options[i][0])
    implicitWidth: Math.max(180, contentItem.implicitWidth + 48)
    implicitHeight: 36
    font.family: Theme.ui; font.pixelSize: 13
    contentItem: Text { leftPadding: 12; rightPadding: 30; text: cb.displayText; textFormat: Text.PlainText; color: Theme.fg; font: cb.font; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
    indicator: Icon { x: cb.width - width - 12; y: (cb.height - height) / 2; name: "chevron-right"; size: 14; rotation: 90; color: Theme.fg3 }
    background: Rectangle { radius: 10; color: Theme.surface; border.width: 1; border.color: cb.activeFocus || cb.popup.visible ? Theme.accent : Theme.lineStrong }
    delegate: QQC2.ItemDelegate {
        required property int index
        required property var modelData
        width: cb.width
        highlighted: cb.highlightedIndex === index
        contentItem: Text { text: modelData; textFormat: Text.PlainText; color: Theme.fg; font: cb.font; elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter }
        background: Rectangle { radius: 8; color: parent.highlighted ? Theme.accentSoft : "transparent" }
    }
    popup: QQC2.Popup {
        y: cb.height + 4; width: cb.width; padding: 6
        implicitHeight: Math.min(contentItem.implicitHeight + 12, 320)
        contentItem: ListView { clip: true; implicitHeight: contentHeight; model: cb.popup.visible ? cb.delegateModel : null; currentIndex: cb.highlightedIndex }
        background: Rectangle { radius: 12; color: Theme.surface; border.width: 1; border.color: Theme.line }
    }
}
