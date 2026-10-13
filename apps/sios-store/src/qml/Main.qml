// SIOS Store, the preview's Store (StoreApp.tsx) on the real machine: apps
// from Flathub through Flatpak, each showing what it can reach before you
// install it. The preview's assistant connections (GitHub, Gmail, ...) have
// their own page and arrive with the assistant (Stage B).
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2

QQC2.ApplicationWindow {
    id: win
    width: 1180
    height: 760
    minimumWidth: 820
    minimumHeight: 520
    visible: true
    title: "Store"
    color: Theme.surface

    // where we are: discover | installed | updates | category | search | connections, plus an open app page
    property string page: "discover"
    property var category: null
    property string detail: ""
    property var history: []
    function go(p, cat) { history = history.concat([{ page: page, category: category, detail: detail }]); page = p; category = cat || null; detail = ""; }
    function openApp(id) { history = history.concat([{ page: page, category: category, detail: detail }]); detail = id; }
    function back() {
        if (!history.length) { detail = ""; return; }
        const last = history[history.length - 1];
        history = history.slice(0, -1);
        page = last.page; category = last.category; detail = last.detail;
    }

    Connections {
        target: catalog
        function onFinished(id, action, ok, message) {
            if (action === "install") return; // the sheet tells that story
            const name = catalog.app(id).name || id;
            toast.show(ok ? ({ remove: name + " removed", update: name + " updated" })[action] || "Done" : "That didn't work: " + message, false, !ok);
        }
    }

    component NavItem: Rectangle {
        id: nav
        property string icon
        property string label
        property string count: ""
        property bool badge: false
        property bool on: false
        signal clicked()
        Layout.fillWidth: true
        implicitHeight: 40
        radius: 11
        color: on ? Theme.surface : (m.containsMouse ? Theme.surface3 : "transparent")
        border.width: on ? 1 : 0
        border.color: Theme.line
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 10
            Icon { name: nav.icon; size: 17; color: nav.on ? Theme.fg : Theme.fg2 }
            Text { Layout.fillWidth: true; text: nav.label; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: nav.on ? Font.DemiBold : Font.Normal }
            Rectangle {
                visible: nav.count !== ""
                implicitWidth: Math.max(20, c.implicitWidth + 10)
                implicitHeight: 20
                radius: 10
                color: nav.badge ? Theme.ai : "transparent"
                Text { id: c; anchors.centerIn: parent; text: nav.count; color: nav.badge ? "white" : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: nav.badge ? Font.DemiBold : Font.Normal }
            }
        }
        MouseArea { id: m; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: nav.clicked() }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ---- sidebar
        Rectangle {
            Layout.fillHeight: true
            implicitWidth: 236
            color: Theme.surface2
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.line }

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 14
                spacing: 4

                // search the store
                Rectangle {
                    Layout.fillWidth: true
                    Layout.bottomMargin: 10
                    implicitHeight: 36
                    radius: 11
                    color: Theme.surface
                    border.width: 1
                    border.color: search.activeFocus ? Theme.accentLine : Theme.line
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 11
                        anchors.rightMargin: 8
                        spacing: 8
                        Icon { name: "search"; size: 15; color: Theme.fg3 }
                        QQC2.TextField {
                            id: search
                            Layout.fillWidth: true
                            placeholderText: "Search the Store"
                            placeholderTextColor: Theme.fg3
                            color: Theme.fg
                            font.family: Theme.ui
                            font.pixelSize: 13
                            background: null
                            padding: 0
                            onTextEdited: if (text.trim().length >= 2) { if (win.page !== "search") win.go("search"); win.detail = ""; } else if (win.page === "search" && text === "") win.back()
                            Keys.onEscapePressed: { text = ""; if (win.page === "search") win.back(); }
                        }
                    }
                }

                NavItem { icon: "sparkles"; label: "Discover"; on: win.page === "discover" && !win.detail; onClicked: { win.go("discover"); search.text = ""; } }
                NavItem { icon: "package-check"; label: "Installed"; count: catalog.installed.length ? String(catalog.installed.length) : ""; on: win.page === "installed" && !win.detail; onClicked: win.go("installed") }
                NavItem { icon: "refresh-cw"; label: "Updates"; count: catalog.updates.length ? String(catalog.updates.length) : ""; badge: true; on: win.page === "updates" && !win.detail; onClicked: win.go("updates") }

                Text { text: "Categories"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold; Layout.topMargin: 20; Layout.leftMargin: 12; Layout.bottomMargin: 6 }
                Repeater {
                    model: catalog.categories
                    delegate: NavItem {
                        required property var modelData
                        icon: modelData.icon
                        label: modelData.label
                        on: win.page === "category" && win.category && win.category.id === modelData.id && !win.detail
                        onClicked: win.go("category", modelData)
                    }
                }

                Item { Layout.fillHeight: true }

                // the preview's "Add a server by URL", for the assistant (Stage B)
                NavItem { icon: "plug"; label: "Assistant connections"; on: win.page === "connections"; onClicked: win.go("connections") }
            }
        }

        // ---- pages
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // Discover, a category, search results: a featured banner and a grid of cards
            Flickable {
                id: browse
                anchors.fill: parent
                visible: !win.detail && ["discover", "category", "search"].indexOf(win.page) >= 0
                contentHeight: browseCol.height + 40
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                QQC2.ScrollBar.vertical: QQC2.ScrollBar {}

                readonly property var items: win.page === "discover" ? catalog.popular : win.page === "category" && win.category ? catalog.inCategory(win.category.id) : win.page === "search" ? catalog.search(search.text) : []

                ColumnLayout {
                    id: browseCol
                    x: 32
                    y: 32
                    width: browse.width - 64
                    spacing: 18

                    // featured, like the preview's dark hero card
                    Rectangle {
                        visible: win.page === "discover" && !!catalog.featured.id
                        Layout.fillWidth: true
                        implicitHeight: 248
                        radius: 22
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0; color: "#1b2027" }
                            GradientStop { position: 0.6; color: "#2a3350" }
                            GradientStop { position: 1; color: "#5d74e8" }
                        }
                        ColumnLayout {
                            anchors { left: parent.left; top: parent.top; bottom: parent.bottom; right: heroIcon.left; margins: 28 }
                            spacing: 8
                            Text { text: "Featured"; color: Qt.rgba(1, 1, 1, 0.7); font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.Medium }
                            Text { text: catalog.featured.name || ""; color: "white"; font.family: Theme.ui; font.pixelSize: 32; font.weight: Font.DemiBold }
                            Text { Layout.fillWidth: true; text: catalog.featured.summary || ""; color: Qt.rgba(1, 1, 1, 0.85); font.family: Theme.ui; font.pixelSize: 15; wrapMode: Text.WordWrap; maximumLineCount: 3; elide: Text.ElideRight }
                            Item { Layout.fillHeight: true }
                            Rectangle {
                                implicitWidth: lm.implicitWidth + 32
                                implicitHeight: 36
                                radius: 18
                                color: "white"
                                Text { id: lm; anchors.centerIn: parent; text: "Learn more"; color: "#1b2027"; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold }
                                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.openApp(catalog.featured.id) }
                            }
                        }
                        AppIcon { id: heroIcon; anchors.right: parent.right; anchors.rightMargin: 40; anchors.verticalCenter: parent.verticalCenter; source: catalog.featured.icon || ""; name: catalog.featured.name || ""; size: 112 }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        Text {
                            text: win.page === "discover" ? "Popular" : win.page === "category" && win.category ? win.category.label : "Results for “" + search.text + "”"
                            color: Theme.fg
                            font.family: Theme.ui
                            font.pixelSize: 20
                            font.weight: Font.DemiBold
                        }
                        Item { Layout.fillWidth: true }
                        Text { visible: win.page === "discover"; text: "Every app runs in its own sandbox"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    }

                    Text {
                        visible: !catalog.ready || browse.items.length === 0
                        text: !catalog.ready ? (catalog.refreshing ? "Getting the catalog…" : "Loading…") : win.page === "search" ? "No apps match. Try another word." : "Nothing here yet."
                        color: Theme.fg3
                        font.family: Theme.ui
                        font.pixelSize: 14
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: browse.width > 1000 ? 3 : 2
                        columnSpacing: 14
                        rowSpacing: 14
                        Repeater {
                            model: browse.items
                            delegate: AppCard { required property var modelData; app: modelData; Layout.fillWidth: true; onOpen: (id) => win.openApp(id) }
                        }
                    }
                }
            }

            // Installed and Updates: a list with Open, Update, Remove
            Flickable {
                id: mine
                anchors.fill: parent
                visible: !win.detail && (win.page === "installed" || win.page === "updates")
                contentHeight: mineCol.height + 40
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
                readonly property var items: win.page === "updates" ? catalog.updates : catalog.installed

                ColumnLayout {
                    id: mineCol
                    x: 32
                    y: 32
                    width: mine.width - 64
                    spacing: 10
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.bottomMargin: 6
                        Text { text: win.page === "updates" ? "Updates" : "Installed"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 22; font.weight: Font.DemiBold }
                        Item { Layout.fillWidth: true }
                        Button { visible: win.page === "updates" && mine.items.length > 1; text: "Update all"; onClicked: catalog.updateAll() }
                    }
                    Text {
                        visible: mine.items.length === 0
                        text: win.page === "updates" ? "Everything is up to date." : "Apps you install show up here."
                        color: Theme.fg3
                        font.family: Theme.ui
                        font.pixelSize: 14
                    }
                    Repeater {
                        model: mine.items
                        delegate: Rectangle {
                            id: row
                            required property var modelData
                            readonly property var job: catalog.busy[modelData.id]
                            Layout.fillWidth: true
                            implicitHeight: 72
                            radius: 14
                            color: rm.containsMouse ? Theme.surface2 : Theme.surface
                            border.width: 1
                            border.color: Theme.line
                            MouseArea { id: rm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.openApp(row.modelData.id) }
                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 12
                                spacing: 14
                                AppIcon { source: row.modelData.icon || ""; name: row.modelData.name || ""; size: 46 }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 1
                                    Text { text: row.modelData.name || row.modelData.id; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                                    Text { Layout.fillWidth: true; text: [row.modelData.summary || "", row.modelData.version ? "Version " + row.modelData.version : ""].filter(x => x).join("  ·  "); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12; elide: Text.ElideRight }
                                }
                                Button { visible: !!row.modelData.update; text: "Update"; busy: !!row.job; progress: row.job ? row.job.progress : -1; onClicked: catalog.update(row.modelData.id) }
                                Button { visible: !row.modelData.update; text: "Open"; kind: "plain"; onClicked: catalog.open(row.modelData.id) }
                                Button { visible: win.page === "installed"; text: "Remove"; kind: "danger"; busy: !!row.job && !row.modelData.update; onClicked: catalog.remove(row.modelData.id) }
                            }
                        }
                    }
                }
            }

            // the preview's assistant connections, which need the assistant running
            ColumnLayout {
                anchors.centerIn: parent
                width: Math.min(parent.width - 80, 520)
                visible: !win.detail && win.page === "connections"
                spacing: 12
                Rectangle {
                    Layout.alignment: Qt.AlignHCenter
                    implicitWidth: 64; implicitHeight: 64; radius: 20
                    color: Theme.aiSoft
                    Icon { anchors.centerIn: parent; name: "plug"; size: 28; color: Theme.ai }
                }
                Text { Layout.alignment: Qt.AlignHCenter; text: "Assistant connections"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 20; font.weight: Font.DemiBold }
                Text {
                    Layout.fillWidth: true
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                    text: "GitHub, Gmail, Google Calendar and other services the assistant can use for you, each with what it may do (Just looks, Asks the first time, Always asks), and adding your own by URL. These arrive with the assistant."
                    color: Theme.fg2
                    font.family: Theme.ui
                    font.pixelSize: 14
                    lineHeight: 1.2
                }
            }

            Detail {
                anchors.fill: parent
                visible: !!win.detail
                appId: win.detail
                onBack: win.back()
                onInstall: (app, perms) => { sheet.perms = perms; sheet.step = "review"; sheet.app = app; }
            }
        }
    }

    InstallSheet { id: sheet; anchors.fill: parent; onClosed: { sheet.app = null; } }
    Toast { id: toast }
}
