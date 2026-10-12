/*
    The SIOS wordmark for the top bar: the name in Jost Light with wide
    tracking, as in the preview (TopBar.tsx). No logic, nothing to configure.
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    fullRepresentation: Item {
        Layout.minimumWidth: label.implicitWidth
        Layout.preferredWidth: label.implicitWidth
        Layout.fillHeight: true

        Text {
            id: label
            anchors.centerIn: parent
            text: "SIOS"
            color: Kirigami.Theme.textColor
            font.family: "Jost"
            font.weight: Font.Light
            font.pixelSize: 15
            font.letterSpacing: 15 * 0.42
            leftPadding: 15 * 0.42
            Accessible.name: "SIOS"
            Accessible.role: Accessible.StaticText
        }
    }
}
