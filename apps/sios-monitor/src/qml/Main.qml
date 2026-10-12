// SIOS Monitor: how the computer is doing, and (with the assistant) what it's
// working on. Overview: CPU, memory, disk, network, battery and the apps using
// the most. Goals: the preview's Goals app (GoalsApp.tsx), filled once
// brain-d runs on the machine (Stage B).
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 1120
    height: 760
    minimumWidth: 760
    minimumHeight: 520
    visible: true
    title: "Monitor"
    color: Theme.surface

    property string page: "overview"

    component Tab: Rectangle {
        id: tab
        property string icon
        property string label
        property string key
        implicitWidth: row.implicitWidth + 24
        implicitHeight: 34
        radius: 10
        color: win.page === key ? Theme.surface : (m.containsMouse ? Theme.surface3 : "transparent")
        border.width: win.page === key ? 1 : 0
        border.color: Theme.line
        RowLayout {
            id: row
            anchors.centerIn: parent
            spacing: 8
            Icon { name: tab.icon; size: 15; color: win.page === tab.key ? Theme.fg : Theme.fg2 }
            Text { text: tab.label; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13; font.weight: win.page === tab.key ? Font.DemiBold : Font.Normal }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.page = tab.key }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // tabs
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 56
            color: Theme.surface2
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16
                spacing: 6
                Tab { icon: "gauge"; label: "Overview"; key: "overview" }
                Tab { icon: "sparkles"; label: "Goals"; key: "goals" }
                Item { Layout.fillWidth: true }
                Text { text: "On for " + sampler.uptime; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            }
        }

        // ---- overview
        Flickable {
            id: overview
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: win.page === "overview"
            contentHeight: col.height + 40
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            QQC2.ScrollBar.vertical: QQC2.ScrollBar {}

            ColumnLayout {
                id: col
                x: 20
                y: 20
                width: overview.width - 40
                spacing: 16

                GridLayout {
                    Layout.fillWidth: true
                    columns: overview.width > 980 ? (sampler.battery.percent !== undefined ? 5 : 4) : 2
                    columnSpacing: 12
                    rowSpacing: 12
                    StatCard {
                        Layout.fillWidth: true
                        icon: "cpu"; label: "Processor"
                        value: Math.round(sampler.cpu) + "%"
                        sub: sampler.cores + (sampler.cores === 1 ? " core" : " cores")
                        history: sampler.cpuHistory
                        tone: Theme.ai
                    }
                    StatCard {
                        Layout.fillWidth: true
                        icon: "memory-stick"; label: "Memory"
                        value: sampler.memory.text || ""
                        sub: "of " + (sampler.memory.of || "")
                        history: sampler.memoryHistory
                        tone: "#7b62c4"
                    }
                    StatCard {
                        Layout.fillWidth: true
                        icon: "hard-drive"; label: "Storage"
                        value: sampler.disk.free ? sampler.disk.free + " free" : ""
                        sub: (sampler.disk.text || "") + " of " + (sampler.disk.of || "") + " used"
                        fraction: sampler.disk.fraction || 0
                        tone: Theme.accent
                    }
                    StatCard {
                        Layout.fillWidth: true
                        icon: "arrow-down-up"; label: "Network"
                        value: sampler.network.down || ""
                        sub: "down, " + (sampler.network.up || "") + " up"
                        history: sampler.networkHistory
                        max: 1
                        tone: "#2e8d5c"
                    }
                    StatCard {
                        Layout.fillWidth: true
                        visible: sampler.battery.percent !== undefined
                        icon: sampler.battery.status === "Charging" ? "battery-charging" : "battery"; label: "Battery"
                        value: (sampler.battery.percent || 0) + "%"
                        sub: sampler.battery.status || ""
                        fraction: (sampler.battery.percent || 0) / 100
                        tone: Theme.ok
                    }
                }

                // the apps using the most
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: apps.implicitHeight + 24
                    radius: 16
                    color: Theme.surface
                    border.width: 1
                    border.color: Theme.line
                    ColumnLayout {
                        id: apps
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 12 }
                        spacing: 2
                        RowLayout {
                            Layout.fillWidth: true
                            Layout.leftMargin: 8
                            Layout.rightMargin: 8
                            Layout.bottomMargin: 6
                            Text { text: "Using the most"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold; Layout.fillWidth: true }
                            Text { text: "Processor"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; Layout.preferredWidth: 150 }
                            Text { text: "Memory"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; Layout.preferredWidth: 90; horizontalAlignment: Text.AlignRight }
                            Item { Layout.preferredWidth: 72 }
                        }
                        Repeater {
                            model: sampler.apps
                            delegate: Rectangle {
                                id: row
                                required property var modelData
                                Layout.fillWidth: true
                                implicitHeight: 44
                                radius: 10
                                color: rm.containsMouse ? Theme.surface2 : "transparent"
                                MouseArea { id: rm; anchors.fill: parent; hoverEnabled: true }
                                RowLayout {
                                    anchors.fill: parent
                                    anchors.leftMargin: 8
                                    anchors.rightMargin: 8
                                    spacing: 12
                                    Rectangle {
                                        implicitWidth: 28; implicitHeight: 28; radius: 8
                                        color: Theme.accentSoft
                                        Text { anchors.centerIn: parent; text: row.modelData.name.charAt(0); color: Theme.accent; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                                    }
                                    Text {
                                        Layout.fillWidth: true
                                        text: row.modelData.name + (row.modelData.count > 1 ? "  (" + row.modelData.count + ")" : "")
                                        color: Theme.fg
                                        font.family: Theme.ui
                                        font.pixelSize: 13
                                        elide: Text.ElideRight
                                    }
                                    // processor share, as a small bar
                                    RowLayout {
                                        Layout.fillWidth: false
                                        Layout.preferredWidth: 150
                                        Layout.maximumWidth: 150
                                        spacing: 8
                                        Rectangle {
                                            Layout.preferredWidth: 100
                                            implicitHeight: 5
                                            radius: 3
                                            color: Theme.surface3
                                            Rectangle { width: parent.width * Math.min(1, row.modelData.cpu / 100); height: parent.height; radius: 3; color: Theme.ai }
                                        }
                                        Text { text: row.modelData.cpu.toFixed(row.modelData.cpu < 10 ? 1 : 0) + "%"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; Layout.preferredWidth: 40; horizontalAlignment: Text.AlignRight }
                                    }
                                    Text { Layout.preferredWidth: 90; horizontalAlignment: Text.AlignRight; text: row.modelData.memory; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
                                    Item {
                                        Layout.preferredWidth: 72
                                        implicitHeight: 28
                                        Button {
                                            anchors.right: parent.right
                                            anchors.verticalCenter: parent.verticalCenter
                                            visible: row.modelData.mine && rm.containsMouse
                                            implicitWidth: 64
                                            implicitHeight: 28
                                            text: "Quit"
                                            kind: "danger"
                                            onClicked: if (sampler.quit(row.modelData.pids)) toast.show("Asked " + row.modelData.name + " to quit", false, false)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ---- goals (the preview's Goals app; arrives with the assistant)
        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: win.page === "goals"
            spacing: 0
            GridLayout {
                Layout.fillWidth: true
                Layout.margins: 20
                columns: 5
                columnSpacing: 12
                Repeater {
                    model: [["activity", "Running"], ["hourglass", "Waiting for you"], ["circle-check", "Done today"], ["clock", "Average time"], ["ban", "Actions blocked"]]
                    delegate: Rectangle {
                        required property var modelData
                        Layout.fillWidth: true
                        implicitHeight: 76
                        radius: 16
                        color: Theme.surface
                        border.width: 1
                        border.color: Theme.line
                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 14
                            spacing: 2
                            RowLayout {
                                spacing: 8
                                Icon { name: modelData[0]; size: 14; color: Theme.fg2 }
                                Text { text: modelData[1]; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            }
                            Text { text: modelData[1] === "Average time" ? "--" : "0"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 22; font.weight: Font.DemiBold }
                        }
                    }
                }
            }
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.line }
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                ColumnLayout {
                    anchors.centerIn: parent
                    width: Math.min(parent.width - 80, 460)
                    spacing: 10
                    Rectangle {
                        Layout.alignment: Qt.AlignHCenter
                        implicitWidth: 48; implicitHeight: 48; radius: 14
                        color: Theme.aiSoft
                        Icon { anchors.centerIn: parent; name: "activity"; size: 22; color: Theme.aiInk }
                    }
                    Text { Layout.alignment: Qt.AlignHCenter; text: "No goals yet"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 17; font.weight: Font.DemiBold }
                    Text {
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        text: "Every request to the assistant becomes a goal: who asked, what it may touch, a budget, and how success is checked. You'll watch each one move through plan, authorize, act and verify here once the assistant runs on this computer."
                        color: Theme.fg2
                        font.family: Theme.ui
                        font.pixelSize: 14
                        lineHeight: 1.2
                    }
                }
            }
        }
    }

    Toast { id: toast }
}
