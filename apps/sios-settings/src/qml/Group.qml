// Settings' Group (Daylight), shared by every page
import QtQuick
import QtQuick.Layouts

Item {
    default property alias rows: col.data
    Layout.fillWidth: true
    implicitHeight: col.implicitHeight
    Rectangle { anchors.fill: parent; radius: 14; color: Theme.surface }
    ColumnLayout { id: col; width: parent.width; spacing: 0 }
    // the frame sits on top so a row's hover colour never covers it
    Rectangle { anchors.fill: parent; radius: 14; color: "transparent"; border.width: 1; border.color: Theme.line }
}
