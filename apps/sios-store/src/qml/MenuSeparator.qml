// A thin line between groups in a SIOS menu.
import QtQuick
import QtQuick.Controls as QQC2

QQC2.MenuSeparator {
    topPadding: 4
    bottomPadding: 4
    leftPadding: 8
    rightPadding: 8
    contentItem: Rectangle { implicitHeight: 1; color: Theme.line }
}
