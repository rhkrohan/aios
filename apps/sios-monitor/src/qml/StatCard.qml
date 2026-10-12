// A reading at a glance, like the preview's Goals stat cards: an icon and a
// label, a big number, and the last minute as a small line.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: card
    property string icon
    property string label
    property string value
    property string sub: ""
    property var history: []
    property real max: 100
    property real fraction: -1     // a bar instead of a line, for "how full"
    property color tone: Theme.ai
    implicitHeight: 150
    radius: 16
    color: Theme.surface
    border.width: 1
    border.color: Theme.line

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 4
        RowLayout {
            spacing: 8
            Icon { name: card.icon; size: 15; color: Theme.fg2 }
            Text { text: card.label; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
        }
        Text { text: card.value; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 26; font.weight: Font.DemiBold }
        Text { visible: card.sub !== ""; text: card.sub; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        Item { Layout.fillHeight: true }

        // the last minute
        Canvas {
            id: line
            visible: card.fraction < 0
            Layout.fillWidth: true
            Layout.preferredHeight: 34
            onWidthChanged: requestPaint()
            Connections { target: card; function onHistoryChanged() { line.requestPaint(); } }
            onPaint: {
                const c = getContext("2d");
                c.reset();
                const h = card.history || [];
                if (h.length < 2) return;
                const top = Math.max(card.max, ...h) || 1;
                const step = width / 59;
                const y = v => height - 2 - (v / top) * (height - 4);
                c.beginPath();
                const x0 = width - (h.length - 1) * step;
                c.moveTo(x0, y(h[0]));
                for (let i = 1; i < h.length; i++) c.lineTo(x0 + i * step, y(h[i]));
                c.strokeStyle = String(card.tone);
                c.lineWidth = 1.6;
                c.lineJoin = "round";
                c.stroke();
                c.lineTo(width, height); c.lineTo(x0, height); c.closePath();
                const g = c.createLinearGradient(0, 0, 0, height);
                g.addColorStop(0, Qt.rgba(card.tone.r, card.tone.g, card.tone.b, 0.22));
                g.addColorStop(1, Qt.rgba(card.tone.r, card.tone.g, card.tone.b, 0));
                c.fillStyle = g;
                c.fill();
            }
        }
        // how full
        Rectangle {
            visible: card.fraction >= 0
            Layout.fillWidth: true
            implicitHeight: 8
            radius: 4
            color: Theme.surface3
            Rectangle {
                width: parent.width * Math.max(0, Math.min(1, card.fraction))
                height: parent.height
                radius: 4
                color: card.fraction > 0.9 ? Theme.warn : card.tone
                Behavior on width { NumberAnimation { duration: 300 } }
            }
        }
    }
}
