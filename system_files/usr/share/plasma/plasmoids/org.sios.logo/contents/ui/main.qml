/*
    The SIOS logo at the top left, as in the preview's TopBar.tsx: a small
    menu, not an app launcher (Apps in the top bar and the orb do that).
      Show or hide buddy, Security Center (arrives with the assistant), Settings
      Sleep, Restart, Shut down
      Lock screen
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

    // buddy is its own widget; ask plasmashell whether it's showing, and flip it
    readonly property string buddyScript: "panels().concat(desktops()).forEach(c => c.widgets('org.sios.buddy').forEach(w => { w.currentConfigGroup = ['General']; %1 }))"
    readonly property string qdbus: "qdbus-qt6 org.kde.plasmashell /PlasmaShell org.kde.PlasmaShell.evaluateScript "
    property bool buddyShown: true

    P5Support.DataSource {
        id: run
        engine: "executable"
        onNewData: (source, data) => {
            if (source.indexOf("print(") >= 0)
                root.buddyShown = String(data.stdout).trim() !== "false";
            disconnectSource(source);
        }
    }
    function sh(cmd) { run.connectSource(cmd); }
    function quote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }
    function checkBuddy() { sh(qdbus + quote(buddyScript.arg("print(w.readConfig('visible', true))"))); }
    function setBuddy(show) {
        sh(qdbus + quote(buddyScript.arg("w.writeConfig('visible', " + show + "); w.reloadConfig()")));
        buddyShown = show;
    }

    Sessions.SessionManagement { id: session }

    PlasmaExtras.Menu {
        id: menu
        placement: PlasmaExtras.Menu.BottomPosedLeftAlignedPopup
        PlasmaExtras.MenuItem { text: root.buddyShown ? "Hide buddy" : "Show buddy"; icon: root.buddyShown ? "view-hidden" : "view-visible"; onClicked: root.setBuddy(!root.buddyShown) }
        PlasmaExtras.MenuItem { text: "Security Center (with the assistant)"; icon: "security-high"; enabled: false }
        PlasmaExtras.MenuItem { text: "Settings"; icon: "preferences-system"; onClicked: root.sh("sios-settings || systemsettings") }
        PlasmaExtras.MenuItem { separator: true }
        PlasmaExtras.MenuItem { text: "Sleep"; icon: "system-suspend"; onClicked: session.suspend() }
        PlasmaExtras.MenuItem { text: "Restart…"; icon: "system-reboot"; onClicked: session.requestReboot() }
        PlasmaExtras.MenuItem { text: "Shut down…"; icon: "system-shutdown"; onClicked: session.requestShutdown() }
        PlasmaExtras.MenuItem { separator: true }
        PlasmaExtras.MenuItem { text: "Lock screen"; icon: "system-lock-screen"; onClicked: session.lock() }
    }

    fullRepresentation: Item {
        Layout.minimumWidth: 32
        Layout.preferredWidth: 32
        Layout.fillHeight: true

        Rectangle {
            id: button
            anchors.centerIn: parent
            width: 30; height: 30; radius: 15
            color: m.containsMouse || m.pressed ? (Kirigami.Theme.backgroundColor.hslLightness < 0.5 ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(0, 0, 0, 0.06)) : "transparent"
            Kirigami.Icon { anchors.centerIn: parent; width: 22; height: 22; source: "sios-start" }
            MouseArea {
                id: m
                anchors.fill: parent
                hoverEnabled: true
                onClicked: { root.checkBuddy(); menu.visualParent = button; menu.openRelative(); }
            }
            Accessible.role: Accessible.ButtonMenu
            Accessible.name: "SIOS menu"
        }
    }
}
