/*
    The right-hand column of the desktop, like the preview's Widgets.tsx:
      - greeting card: good morning/afternoon/evening, the date, your to-dos
      - recent activity: the files you used last (from KDE's activity history)
      - suggestions: what SIOS noticed and offers to do (A7). Headlines are
        written by SIOS (no file contents); "Do it" opens the Ask bar on that
        card, which runs it as a normal goal (plan, OK, undo).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.private.kicker as Kicker
import org.kde.kirigami as Kirigami
import org.kde.plasma.plasma5support as P5Support

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    // SIOS tokens (build_concept_html/src/app/globals.css), light and dark
    readonly property bool dark: Kirigami.Theme.backgroundColor.hslLightness < 0.5
    readonly property color card: dark ? Qt.rgba(30 / 255, 32 / 255, 35 / 255, 0.9) : Qt.rgba(253 / 255, 253 / 255, 1, 0.9)
    readonly property color cardLine: dark ? Qt.rgba(1, 1, 1, 0.1) : Qt.rgba(1, 1, 1, 0.7)
    readonly property color fg: dark ? "#ececea" : "#1d1d1f"
    readonly property color fg2: dark ? "#a9a9a4" : "#5c5c59"
    readonly property color fg3: dark ? "#7c7c77" : "#8b8b86"
    readonly property color line: dark ? "#33373c" : "#e4e4df"
    readonly property color ok: dark ? "#94c29a" : "#4d7a52"
    readonly property string ui: "Instrument Sans"

    property date now: new Date()
    Timer { interval: 60000; running: true; repeat: true; onTriggered: root.now = new Date() }

    function greeting(h) { return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

    // to-dos live in the widget's own settings: "0|text" or "1|text"
    readonly property var todos: (Plasmoid.configuration.todos || []).map(s => ({ done: s.charAt(0) === "1", text: s.slice(2) }))
    readonly property int remaining: todos.filter(t => !t.done).length
    function save(list) { Plasmoid.configuration.todos = list.map(t => (t.done ? "1|" : "0|") + t.text); }
    function toggle(i) { const l = todos.slice(); l[i] = { done: !l[i].done, text: l[i].text }; save(l); }
    function add(text) { if (text.trim()) save(todos.concat([{ done: false, text: text.trim() }])); }
    function clearDone() { save(todos.filter(t => !t.done)); }

    // SIOS's suggestion cards: headlines only, from brain-d
    property var cards: []
    P5Support.DataSource {
        id: sh
        engine: "executable"
        onNewData: (source, data) => {
            if (source === root.readCards) {
                try { root.cards = JSON.parse(String(data.stdout)) || []; } catch (e) { root.cards = []; }
            }
            disconnectSource(source);
        }
    }
    readonly property string readCards: "brain-d suggestions 2>/dev/null"
    Timer { interval: 30000; running: true; repeat: true; triggeredOnStart: true; onTriggered: sh.connectSource(root.readCards) }
    // ids are plain hex from brain-d; anything else never reaches the shell
    function safe(id) { return /^s[0-9a-f]{1,40}$/.test(id); }
    function doIt(id) { if (safe(id)) sh.connectSource("sios-ask --suggestion " + id); }
    function notNow(id) { if (safe(id)) { sh.connectSource("brain-d suggestions --dismiss " + id); root.cards = root.cards.filter(c => c.id !== id); } }

    Kicker.RecentUsageModel {
        id: recent
        shownItems: Kicker.RecentUsageModel.OnlyDocs
        ordering: 0 // most recent first
    }

    component Card: Rectangle {
        radius: 22
        color: root.card
        border.color: root.cardLine
        border.width: 1
    }

    fullRepresentation: ColumnLayout {
        implicitWidth: 316
        implicitHeight: 560
        spacing: 12

        // ---- greeting
        Card {
            Layout.fillWidth: true
            implicitHeight: greet.implicitHeight + 40

            ColumnLayout {
                id: greet
                anchors { left: parent.left; right: parent.right; top: parent.top; margins: 20 }
                spacing: 0

                RowLayout {
                    Layout.fillWidth: true
                    Kirigami.Icon {
                        source: root.now.getHours() >= 6 && root.now.getHours() < 19 ? "weather-clear" : "weather-clear-night"
                        implicitWidth: 30
                        implicitHeight: 30
                    }
                    Item { Layout.fillWidth: true }
                    ColumnLayout {
                        spacing: 0
                        Text { Layout.alignment: Qt.AlignRight; text: root.now.toLocaleDateString(Qt.locale(), "dddd"); color: root.fg; font.family: root.ui; font.pixelSize: 15; font.weight: Font.Medium }
                        Text { Layout.alignment: Qt.AlignRight; text: root.now.toLocaleDateString(Qt.locale(), "MMMM d"); color: root.fg2; font.family: root.ui; font.pixelSize: 12 }
                    }
                }
                Text {
                    Layout.topMargin: 8
                    text: root.greeting(root.now.getHours())
                    color: root.fg
                    font.family: root.ui
                    font.pixelSize: 22
                    font.weight: Font.DemiBold
                }
                Text {
                    text: root.todos.length === 0 ? "Nothing on your list yet." : root.remaining ? root.remaining + (root.remaining === 1 ? " thing" : " things") + " left today." : "You're all set for today."
                    color: root.fg2
                    font.family: root.ui
                    font.pixelSize: 14
                }

                Item { implicitHeight: 8 }

                Repeater {
                    model: root.todos
                    delegate: Item {
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        implicitHeight: 40
                        Rectangle { visible: index > 0; anchors.top: parent.top; width: parent.width; height: 1; color: root.line; opacity: 0.7 }
                        RowLayout {
                            anchors.fill: parent
                            spacing: 12
                            Rectangle {
                                implicitWidth: 18
                                implicitHeight: 18
                                radius: 9
                                color: modelData.done ? root.ok : "transparent"
                                border.width: modelData.done ? 0 : 1.5
                                border.color: root.fg3
                                Kirigami.Icon { anchors.centerIn: parent; visible: modelData.done; source: "checkmark"; color: "white"; isMask: true; implicitWidth: 11; implicitHeight: 11 }
                            }
                            Text {
                                Layout.fillWidth: true
                                text: modelData.text
                                elide: Text.ElideRight
                                color: modelData.done ? root.fg2 : root.fg
                                font.family: root.ui
                                font.pixelSize: 14
                                font.strikeout: modelData.done
                            }
                        }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.toggle(index) }
                    }
                }

                // add a to-do
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: 4
                    spacing: 12
                    Rectangle { implicitWidth: 18; implicitHeight: 18; radius: 9; color: "transparent"; border.width: 1.5; border.color: root.line
                        Text { anchors.centerIn: parent; text: "+"; color: root.fg3; font.pixelSize: 13 } }
                    QQC2.TextField {
                        id: entry
                        Layout.fillWidth: true
                        placeholderText: "Add a to-do"
                        font.family: root.ui
                        font.pixelSize: 14
                        background: null
                        leftPadding: 0
                        onAccepted: { root.add(text); text = ""; }
                    }
                    Text {
                        visible: root.todos.some(t => t.done)
                        text: "Clear done"
                        color: root.fg3
                        font.family: root.ui
                        font.pixelSize: 12
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.clearDone() }
                    }
                }
            }
        }

        // ---- recent activity
        // what SIOS noticed (A7)
        Card {
            visible: root.cards.length > 0
            Layout.fillWidth: true
            implicitHeight: sugCol.implicitHeight + 32
            ColumnLayout {
                id: sugCol
                anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                spacing: 10
                Text { Layout.leftMargin: 4; text: "SIOS noticed"; color: root.fg; font.family: root.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                Repeater {
                    model: root.cards.slice(0, 3)
                    delegate: ColumnLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.leftMargin: 4
                        Layout.rightMargin: 4
                        spacing: 6
                        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: modelData.headline; color: root.fg; font.family: root.ui; font.pixelSize: 13 }
                        RowLayout {
                            spacing: 8
                            Rectangle {
                                implicitWidth: doT.implicitWidth + 22; implicitHeight: 28; radius: 14
                                color: doM.containsMouse ? "#3f68e0" : "#4f7bf7"
                                Text { id: doT; anchors.centerIn: parent; text: "Do it"; color: "white"; font.family: root.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                                MouseArea { id: doM; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.doIt(modelData.id) }
                            }
                            Text {
                                text: "Not now"
                                color: root.fg2; font.family: root.ui; font.pixelSize: 12
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.notNow(modelData.id) }
                            }
                        }
                    }
                }
            }
        }

        Card {
            Layout.fillWidth: true
            implicitHeight: rec.implicitHeight + 32

            ColumnLayout {
                id: rec
                anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                spacing: 4

                RowLayout {
                    Layout.fillWidth: true
                    Layout.leftMargin: 4
                    Layout.rightMargin: 4
                    Text { text: "Recent activity"; color: root.fg; font.family: root.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: "See all"
                        color: root.fg2
                        font.family: root.ui
                        font.pixelSize: 13
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Qt.openUrlExternally("recentlyused:/files") }
                    }
                }

                Text {
                    visible: recent.count === 0
                    Layout.leftMargin: 4
                    Layout.topMargin: 6
                    Layout.bottomMargin: 4
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                    text: "Files you open will show up here."
                    color: root.fg2
                    font.family: root.ui
                    font.pixelSize: 13
                }

                Repeater {
                    model: recent
                    delegate: Rectangle {
                        required property int index
                        required property var model
                        visible: index < 3
                        Layout.fillWidth: true
                        implicitHeight: visible ? 52 : 0
                        radius: 12
                        color: hover.containsMouse ? (root.dark ? Qt.rgba(1, 1, 1, 0.06) : Qt.rgba(0, 0, 0, 0.04)) : "transparent"
                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 6
                            spacing: 12
                            Kirigami.Icon { source: model.decoration; implicitWidth: 36; implicitHeight: 36 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 0
                                Text { Layout.fillWidth: true; text: model.display; elide: Text.ElideRight; color: root.fg; font.family: root.ui; font.pixelSize: 14; font.weight: Font.Medium }
                                Text { Layout.fillWidth: true; text: model.description || ""; elide: Text.ElideMiddle; color: root.fg2; font.family: root.ui; font.pixelSize: 12 }
                            }
                        }
                        MouseArea { id: hover; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: recent.trigger(index, "", null) }
                    }
                }
            }
        }

        Item { Layout.fillHeight: true }
    }
}
