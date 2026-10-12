// A short note at the bottom after something changed ("Moved 2 items to
// Trash"), with Undo when it can be undone, like the preview's toasts.
import QtQuick
import QtQuick.Layouts

Rectangle {
    id: toast
    property string text
    property bool undoable: false
    property bool error: false
    signal undo()

    function show(t, canUndo, isError) {
        text = t;
        undoable = !!canUndo;
        error = !!isError;
        opacity = 1;
        timer.restart();
    }

    anchors.horizontalCenter: parent.horizontalCenter
    anchors.bottom: parent.bottom
    anchors.bottomMargin: 48
    width: row.implicitWidth + 28
    height: 40
    radius: 20
    color: "#1b2027"
    opacity: 0
    visible: opacity > 0
    Behavior on opacity { NumberAnimation { duration: 180 } }
    Timer { id: timer; interval: 5000; onTriggered: toast.opacity = 0 }

    RowLayout {
        id: row
        anchors.centerIn: parent
        spacing: 14
        Text { text: toast.text; color: toast.error ? "#f4b0a6" : "white"; font.family: Theme.ui; font.pixelSize: 13 }
        Text {
            visible: toast.undoable
            text: "Undo"
            color: "#a9bdff"
            font.family: Theme.ui
            font.pixelSize: 13
            font.weight: Font.DemiBold
            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { toast.undo(); toast.opacity = 0; } }
        }
    }
}
