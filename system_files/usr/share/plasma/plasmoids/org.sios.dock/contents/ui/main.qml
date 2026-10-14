/*
    The SIOS dock (owner's pick, 2026-10-14: "D5, no bar"):
      Files  Browser  Mail   orb   Store  Activity  Settings  [other open apps]
    No bar behind it: the icons float on the desktop with their own soft shadows,
    a small pill marks running apps (longer for the focused one), and the orb is
    the one larger item. A tooltip above. It is a real task manager: it
    uses KDE's TasksModel, so clicking starts, focuses or minimizes the app.
    The orb opens the Ask bar (apps, files, settings now; the assistant in Stage B).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support
import org.kde.taskmanager as TaskManager
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    readonly property bool dark: Kirigami.Theme.backgroundColor.hslLightness < 0.5
    readonly property color fg: dark ? "#ececea" : "#1d1d1f"

    // the pinned apps, left and right of the orb; the first that's installed wins
    readonly property var leftApps: [
        ["org.sios.files.desktop", "org.kde.dolphin.desktop"],
        ["org.mozilla.firefox.desktop", "firefox.desktop", "org.chromium.Chromium.desktop"],
        ["org.mozilla.Thunderbird.desktop", "thunderbird.desktop", "org.kde.kmail2.desktop"]
    ]
    readonly property var rightApps: [
        ["org.sios.store.desktop", "io.github.kolunmi.Bazaar.desktop", "org.kde.discover.desktop"],
        ["org.sios.monitor.desktop", "org.kde.plasma-systemmonitor.desktop"],
        ["org.sios.settings.desktop", "systemsettings.desktop"]
    ]

    P5Support.DataSource {
        id: run
        engine: "executable"
        onNewData: (source) => disconnectSource(source)
    }

    // which .desktop files exist, so missing apps (no mail app yet) are skipped
    property var installed: ({})
    P5Support.DataSource {
        engine: "executable"
        connectedSources: ["for d in " + root.leftApps.concat(root.rightApps).reduce((a, b) => a.concat(b), []).join(" ")
            + "; do for dir in $HOME/.local/share/applications /usr/share/applications /var/lib/flatpak/exports/share/applications $HOME/.local/share/flatpak/exports/share/applications;"
            + " do [ -f \"$dir/$d\" ] && echo $d && break; done; done"]
        onNewData: (source, data) => {
            const found = {};
            String(data.stdout).split("\n").filter(x => x).forEach(x => found[x] = true);
            root.installed = found;
            disconnectSource(source);
        }
    }
    function pick(choices) { return choices.find(c => installed[c]) || ""; }
    readonly property var launchers: leftApps.map(pick).concat(rightApps.map(pick)).filter(x => x).map(x => "applications:" + x)
    // which side of the orb an app sits on goes by which app it is, not by its
    // place in the list (a running app can move in the list)
    readonly property var leftLaunchers: leftApps.map(pick).filter(x => x).map(x => "applications:" + x)
    function onLeft(model) { return leftLaunchers.indexOf(String(model.LauncherUrlWithoutIcon || "")) >= 0; }

    TaskManager.VirtualDesktopInfo { id: desktopInfo }
    TaskManager.ActivityInfo { id: activityInfo }

    TaskManager.TasksModel {
        id: tasks
        launcherList: root.launchers
        separateLaunchers: false
        launchInPlace: true
        groupMode: TaskManager.TasksModel.GroupApplications
        groupInline: false
        sortMode: TaskManager.TasksModel.SortManual
        filterByVirtualDesktop: false
        filterByActivity: true
        activity: activityInfo.currentActivity
        virtualDesktop: desktopInfo.currentDesktop
    }

    component AppButton: Item {
        id: btn
        required property int index
        required property var model
        readonly property bool active: !!model.IsActive && !model.IsLauncher
        readonly property bool running: !model.IsLauncher || !!model.IsStartup
        Layout.alignment: Qt.AlignVCenter
        implicitWidth: 62
        implicitHeight: 62

        // the icon floats on the desktop: its own soft shadow, no tile behind it.
        // Hover scales and lifts it (a transform, so nothing around it moves).
        Kirigami.Icon {
            id: icon
            anchors.centerIn: parent
            source: btn.model.decoration
            implicitWidth: 46
            implicitHeight: 46
            scale: mouse.pressed ? 0.95 : (mouse.containsMouse ? 1.12 : 1.0)
            transform: Translate { y: mouse.containsMouse ? -4 : 0; Behavior on y { NumberAnimation { duration: 320; easing.type: Easing.OutQuint } } }
            Behavior on scale { NumberAnimation { duration: 320; easing.type: Easing.OutQuint } }
            // the icons carry their own soft ground shadow, so nothing is redrawn while they move
            smooth: true
        }
        // running: a small pill under the icon; the focused app's is longer
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.bottom
            anchors.topMargin: -1
            width: btn.active ? 18 : 10
            height: 4
            radius: 2
            color: Qt.rgba(1, 1, 1, 0.92)
            visible: btn.running
            Behavior on width { NumberAnimation { duration: 320; easing.type: Easing.OutQuint } }
        }
        // the name: Plasma's own tooltip, a small card above the dock in the SIOS style
        PlasmaCore.ToolTipArea {
            anchors.fill: parent
            mainText: btn.model.AppName || btn.model.display || ""
            location: PlasmaCore.Types.BottomEdge
            MouseArea {
                id: mouse
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.MiddleButton
                onClicked: (e) => {
                    const i = tasks.makeModelIndex(btn.index);
                    if (e.button === Qt.MiddleButton || btn.model.IsLauncher) tasks.requestNewInstance(i);
                    else if (btn.active) tasks.requestToggleMinimized(i);
                    else tasks.requestActivate(i);
                }
            }
        }
        Accessible.role: Accessible.Button
        Accessible.name: model.AppName || model.display || ""
    }

    fullRepresentation: RowLayout {
        spacing: 8
        Layout.minimumWidth: implicitWidth
        Layout.preferredWidth: implicitWidth

        Repeater {
            model: tasks
            delegate: AppButton { visible: root.onLeft(model) }
        }

        // the orb: the one larger item, nothing behind it
        Item {
            id: orbSlot
            Layout.alignment: Qt.AlignVCenter
            Layout.leftMargin: 6
            Layout.rightMargin: 6
            implicitWidth: 84
            implicitHeight: 84
            Orb {
                anchors.centerIn: parent
                width: 78
                height: 78
                lively: orbMouse.containsMouse
                scale: orbMouse.pressed ? 0.96 : (orbMouse.containsMouse ? 1.07 : 1.0)
                Behavior on scale { NumberAnimation { duration: 520; easing.type: Easing.OutQuint } }
            }
            PlasmaCore.ToolTipArea {
                anchors.fill: parent
                mainText: "Ask SIOS"
                subText: "Meta+Space"
                location: PlasmaCore.Types.BottomEdge
                MouseArea {
                    id: orbMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: run.connectSource("sios-ask || qdbus-qt6 org.kde.krunner /App org.kde.krunner.App.toggleDisplay")
                }
            }
            Accessible.role: Accessible.Button
            Accessible.name: "Search"
        }

        Repeater {
            model: tasks
            delegate: AppButton { visible: !root.onLeft(model) }
        }
    }
}
