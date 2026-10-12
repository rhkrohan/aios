/*
    The words on the left of the top bar, as in the preview's TopBar.tsx:
      Workspaces  opens the overview of open windows and desktops
      Files       opens SIOS Files (Dolphin if it's missing)
      Apps        opens the app launcher (the SIOS logo next to it)
      System      Settings, About, Lock, Sleep, Restart, Shut down, Log out
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.extras as PlasmaExtras
import org.kde.plasma.plasma5support as P5Support
import org.kde.plasma.private.sessions as Sessions
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    P5Support.DataSource {
        id: run
        engine: "executable"
        onNewData: (source) => disconnectSource(source)
    }
    function sh(cmd) { run.connectSource(cmd); }

    Sessions.SessionManagement { id: session }

    PlasmaExtras.Menu {
        id: systemMenu
        placement: PlasmaExtras.Menu.BottomPosedLeftAlignedPopup
        PlasmaExtras.MenuItem { text: "Settings"; icon: "sios-settings"; onClicked: root.sh("sios-settings || systemsettings") }
        PlasmaExtras.MenuItem { text: "Monitor"; icon: "sios-monitor"; onClicked: root.sh("sios-monitor || plasma-systemmonitor") }
        PlasmaExtras.MenuItem { text: "About this computer"; icon: "sios-logo"; onClicked: root.sh("sios-settings || kinfocenter") }
        PlasmaExtras.MenuItem { separator: true }
        PlasmaExtras.MenuItem { text: "Lock screen"; icon: "system-lock-screen"; onClicked: session.lock() }
        PlasmaExtras.MenuItem { text: "Sleep"; icon: "system-suspend"; onClicked: session.suspend() }
        PlasmaExtras.MenuItem { text: "Restart…"; icon: "system-reboot"; onClicked: session.requestReboot() }
        PlasmaExtras.MenuItem { text: "Shut down…"; icon: "system-shutdown"; onClicked: session.requestShutdown() }
        PlasmaExtras.MenuItem { separator: true }
        PlasmaExtras.MenuItem { text: "Log out…"; icon: "system-log-out"; onClicked: session.requestLogout() }
    }

    component BarButton: Rectangle {
        id: b
        property string label
        signal activated()
        Layout.alignment: Qt.AlignVCenter
        implicitWidth: t.implicitWidth + 16
        implicitHeight: 28
        radius: 6
        color: m.containsMouse || m.pressed ? (Kirigami.Theme.backgroundColor.hslLightness < 0.5 ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(0, 0, 0, 0.06)) : "transparent"
        Text {
            id: t
            anchors.centerIn: parent
            text: b.label
            color: Kirigami.Theme.textColor
            font.family: "Instrument Sans"
            font.pixelSize: 13
            font.weight: Font.Medium
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; onClicked: b.activated() }
        Accessible.role: Accessible.Button
        Accessible.name: label
    }

    fullRepresentation: RowLayout {
        spacing: 2
        Layout.minimumWidth: implicitWidth
        Layout.preferredWidth: implicitWidth
        Layout.fillHeight: true

        BarButton { label: "Workspaces"; onActivated: root.sh("qdbus-qt6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut Overview") }
        BarButton { label: "Files"; onActivated: root.sh("sios-files || dolphin") }
        BarButton { label: "Apps"; onActivated: root.sh("qdbus-qt6 org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.activateLauncherMenu") }
        BarButton { id: systemButton; label: "System"; onActivated: { systemMenu.visualParent = systemButton; systemMenu.openRelative(); } }
    }
}
