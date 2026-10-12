/*
    The SIOS dock, like the preview's Dock.tsx:
      Files  Browser  Mail  |  orb  |  Store  Activity  Settings  [other open apps]
    Thin line icons (the SIOS icon theme), a soft highlight on the focused app,
    a dot under running apps, a tooltip above. It is a real task manager: it
    uses KDE's TasksModel, so clicking starts, focuses or minimizes the app.
    The orb opens search for now; the Ask bar takes it over in Stage B.
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
        ["org.kde.dolphin.desktop"],
        ["org.mozilla.firefox.desktop", "firefox.desktop", "org.chromium.Chromium.desktop"],
        ["org.mozilla.Thunderbird.desktop", "thunderbird.desktop", "org.kde.kmail2.desktop"]
    ]
    readonly property var rightApps: [
        ["io.github.kolunmi.Bazaar.desktop", "org.kde.discover.desktop"],
        ["org.kde.plasma-systemmonitor.desktop"],
        ["systemsettings.desktop"]
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
    readonly property int leftCount: leftApps.map(pick).filter(x => x).length

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

    component Tip: Rectangle {
        property string text
        property bool show
        visible: show
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.top
        anchors.bottomMargin: 8
        width: tipText.implicitWidth + 20
        height: 24
        radius: 8
        color: Qt.rgba(27 / 255, 32 / 255, 39 / 255, 0.92)
        Text { id: tipText; anchors.centerIn: parent; text: parent.text; color: "white"; font.family: "Instrument Sans"; font.pixelSize: 12; font.weight: Font.Medium }
    }

    component Separator: Rectangle {
        Layout.alignment: Qt.AlignVCenter
        Layout.leftMargin: 4
        Layout.rightMargin: 4
        implicitWidth: 1
        implicitHeight: 24
        color: root.dark ? Qt.rgba(1, 1, 1, 0.12) : Qt.rgba(29 / 255, 29 / 255, 31 / 255, 0.1)
    }

    component AppButton: Item {
        id: btn
        required property int index
        required property var model
        readonly property bool active: !!model.IsActive && !model.IsLauncher
        readonly property bool running: !model.IsLauncher || !!model.IsStartup
        Layout.alignment: Qt.AlignVCenter
        implicitWidth: 44
        implicitHeight: 44

        Rectangle {
            anchors.fill: parent
            radius: 14
            visible: btn.active
            color: root.dark ? Qt.rgba(1, 1, 1, 0.12) : Qt.rgba(1, 1, 1, 0.85)
            border.width: root.dark ? 0 : 1
            border.color: Qt.rgba(1, 1, 1, 0.9)
        }
        Kirigami.Icon {
            anchors.centerIn: parent
            source: btn.model.decoration
            implicitWidth: mouse.containsMouse ? 26 : 22
            implicitHeight: implicitWidth
            Behavior on implicitWidth { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
        }
        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.bottom
            anchors.topMargin: 1
            width: 4
            height: 4
            radius: 2
            color: Qt.rgba(root.fg.r, root.fg.g, root.fg.b, 0.5)
            visible: btn.running
        }
        Tip { show: mouse.containsMouse; text: btn.model.AppName || btn.model.display || "" }
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
        Accessible.role: Accessible.Button
        Accessible.name: model.AppName || model.display || ""
    }

    fullRepresentation: RowLayout {
        spacing: 4
        Layout.minimumWidth: implicitWidth
        Layout.preferredWidth: implicitWidth

        Repeater {
            model: tasks
            delegate: AppButton { visible: index < root.leftCount }
        }

        Separator {}

        // the orb
        Item {
            id: orbSlot
            Layout.alignment: Qt.AlignVCenter
            implicitWidth: 44
            implicitHeight: 44
            Rectangle {
                anchors.fill: parent
                radius: width / 2
                color: root.dark ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(1, 1, 1, 0.7)
                border.width: 1
                border.color: root.dark ? Qt.rgba(1, 1, 1, 0.12) : Qt.rgba(1, 1, 1, 0.9)
            }
            Orb {
                anchors.centerIn: parent
                width: 30
                height: 30
                lively: orbMouse.containsMouse
            }
            Tip { show: orbMouse.containsMouse; text: "Search  (Ask SIOS is coming)" }
            MouseArea {
                id: orbMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: run.connectSource("qdbus-qt6 org.kde.krunner /App org.kde.krunner.App.toggleDisplay")
            }
            Accessible.role: Accessible.Button
            Accessible.name: "Search"
        }

        Separator {}

        Repeater {
            model: tasks
            delegate: AppButton { visible: index >= root.leftCount }
        }
    }
}
