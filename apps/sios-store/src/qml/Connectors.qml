// Store > Connectors (C3, D105, D108; docs/design/store-connectors.html, approved).
// Two shelves: Verified by SIOS (the signed catalog: every tool reviewed, exact risk
// chips, pinned) and All MCP servers (the official MCP Registry, cached by the
// broker, shown as plain text and "Not reviewed by SIOS"). A connector's page shows
// who makes it, the one address it talks to, every tool's risk and who can use it.
// Installing, signing in, removing and choosing who can use it ask for the owner's
// password (the broker). Logos: Simple Icons for known brands (Brands.js), a
// registry icon fetched by the broker as PNG or WebP only, or a monogram.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import "Brands.js" as Brands

Item {
    id: cn
    property string shelf: "all"            // all | verified | online | local
    property string query: ""
    property var verified: []
    property var reg: ({ servers: [], total: 0, all: 0 })
    property var more: []                     // registry results loaded so far
    property bool fetching: false
    property string open_: ""                 // "v:<id>" or "r:<name>"
    property var apps: []
    property var agents: []
    property var icons: ({})                  // registry icon url -> local file
    signal toast(string text, bool bad)

    function load() {
        broker.request("connectors.view", {}, "c-view");
        broker.request("iam.apps", {}, "c-apps");
        broker.request("agents.view", {}, "c-agents");
        search(0);
    }
    function search(offset) { broker.request("registry.view", { query: cn.query, offset: offset, limit: 30 }, offset ? "c-more" : "c-reg"); }
    function refreshRegistry() { fetching = true; broker.request("registry.refresh", {}, "c-refresh"); }
    Component.onCompleted: load()
    onQueryChanged: searchTimer.restart()
    Timer { id: searchTimer; interval: 250; onTriggered: cn.search(0) }

    Connections {
        target: broker
        function onDone(tag, ok, error) {
            if (!String(tag).startsWith("c-")) return;
            if (tag === "c-view") { if (!error) cn.verified = ok.connectors || []; return; }
            if (tag === "c-apps") { if (!error) cn.apps = ok.apps || []; return; }
            if (tag === "c-agents") { if (!error) cn.agents = (ok.agents || []).filter(a => a.brain && a.brain !== "builtin"); return; }
            if (tag === "c-reg") { if (!error) { cn.reg = ok; cn.more = ok.servers || []; if (ok.all === 0 && !cn.fetching) cn.refreshRegistry(); } return; }
            if (tag === "c-more") { if (!error) cn.more = cn.more.concat(ok.servers || []); return; }
            if (tag === "c-refresh") { cn.fetching = false; if (error) cn.toast("Couldn't get the MCP Registry: " + error, true); else { cn.toast(ok.servers + " MCP servers listed", false); cn.search(0); } return; }
            if (String(tag).startsWith("c-icon|")) { if (!error) { const m = Object.assign({}, cn.icons); m[tag.slice(7)] = "file://" + ok.file; cn.icons = m; } return; }
            // installs, removals, who can use it: say what happened, then look again
            const t = String(tag).split("|");
            if (error) cn.toast(error === "not confirmed: the owner's password wasn't given" ? "You closed the password window. Nothing changed." : t[1] + ": " + error, true);
            else cn.toast(t[1] || "Done", false);
            broker.request("connectors.view", {}, "c-view");
        }
    }
    function act(method, params, done) { broker.request(method, params, "c-act|" + done); }

    // ---- logos
    function brandOf(title, publisher) {
        const w = String(title || "").toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
        return Brands.colors[w] ? w : "";
    }
    component Logo: Rectangle {
        id: lg
        property string brand
        property string title
        property string iconUrl
        property int size: 40
        readonly property string file: iconUrl ? (cn.icons[iconUrl] || "") : ""
        implicitWidth: size; implicitHeight: size; radius: size * 0.28
        color: Theme.surface; border.width: 1; border.color: Theme.line
        Component.onCompleted: if (iconUrl && !brand && !cn.icons[iconUrl]) broker.request("registry.icon", { url: iconUrl }, "c-icon|" + iconUrl)
        Icon { visible: !!lg.brand; anchors.centerIn: parent; name: lg.brand ? "logo-" + lg.brand : ""; size: lg.size * 0.55; color: Brands.colors[lg.brand] && Brands.colors[lg.brand] !== "#000000" ? Brands.colors[lg.brand] : Theme.fg }
        Image { visible: !lg.brand && !!lg.file; anchors.centerIn: parent; width: lg.size * 0.62; height: width; source: lg.file; fillMode: Image.PreserveAspectFit; sourceSize: Qt.size(96, 96); asynchronous: true; smooth: true }
        Text { visible: !lg.brand && !lg.file; anchors.centerIn: parent; textFormat: Text.PlainText; text: String(lg.title || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?"; color: Theme.fg2; font.family: Theme.display; font.pixelSize: lg.size * 0.36; font.weight: Font.DemiBold }
    }
    component Chip: Rectangle {
        property string text
        property string kind: "muted"            // read, change, send, x, muted, acc
        implicitWidth: ct.implicitWidth + 16; implicitHeight: 20; radius: 10
        color: kind === "read" ? Theme.okSoft : kind === "change" ? Theme.accentSoft : kind === "send" ? Theme.warnSoft : kind === "x" ? Theme.dangerSoft : kind === "acc" ? Theme.accentSoft : Theme.surface3
        Text { id: ct; anchors.centerIn: parent; textFormat: Text.PlainText; text: parent.text; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.DemiBold
               color: parent.kind === "read" ? Theme.ok : parent.kind === "change" ? Theme.accent : parent.kind === "send" ? Theme.warn : parent.kind === "x" ? Theme.danger : parent.kind === "acc" ? Theme.accent : Theme.fg2 }
    }
    function riskCounts(tools) {
        const n = { read: 0, reversible: 0, irreversible: 0 };
        for (const t of tools || []) n[t.level] = (n[t.level] || 0) + 1;
        return n;
    }
    readonly property var vShown: verified.filter(c => !query || (c.name + " " + c.about + " " + c.publisher).toLowerCase().indexOf(query.toLowerCase()) >= 0)
    readonly property var rShown: more.filter(s => shelf === "online" ? s.installable : shelf === "local" ? !s.installable : true)
    readonly property var current: open_.startsWith("v:") ? verified.find(c => "v:" + c.id === open_) : open_.startsWith("r:") ? more.find(s => "r:" + s.name === open_) : null

    // ================================================================ browse
    Flickable {
        id: browse
        visible: !cn.current
        anchors.fill: parent
        contentHeight: bc.implicitHeight + 50
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
        onAtYEndChanged: if (atYEnd && cn.shelf !== "verified" && cn.more.length < cn.reg.total) cn.search(cn.more.length)
        ColumnLayout {
            id: bc
            x: 34; y: 26
            width: browse.width - 68
            spacing: 14
            Text { text: "Connectors"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 32; font.weight: Font.DemiBold }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Give your AIs safe access to services and tools. SIOS checks every call they make."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 15 }
            RowLayout {
                spacing: 10
                Rectangle {
                    Layout.preferredWidth: 520
                    implicitHeight: 40; radius: 12; color: Theme.surface; border.width: 1; border.color: q.activeFocus ? Theme.accent : Theme.lineStrong
                    RowLayout {
                        anchors { fill: parent; leftMargin: 12; rightMargin: 8 }
                        Icon { name: "search"; size: 15; color: Theme.fg3 }
                        QQC2.TextField { id: q; Layout.fillWidth: true; leftPadding: 4; background: null; placeholderText: "Search connectors: GitHub, calendar, notes…"; placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; onTextChanged: cn.query = text.trim() }
                    }
                }
                Text { textFormat: Text.PlainText; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12
                       text: cn.fetching ? "Getting the MCP Registry…" : cn.reg.all ? cn.reg.all.toLocaleString(Qt.locale(), "f", 0) + " servers in the MCP Registry" : "" }
            }
            Row {
                spacing: 8
                Repeater {
                    model: [["all", "All"], ["verified", "Verified by SIOS"], ["online", "Online"], ["local", "On this computer"]]
                    delegate: Rectangle {
                        required property var modelData
                        readonly property bool on: cn.shelf === modelData[0]
                        width: sl.implicitWidth + 28; height: 32; radius: 16
                        color: on ? Theme.accent : Theme.surface; border.width: 1; border.color: on ? Theme.accent : Theme.lineStrong
                        Text { id: sl; anchors.centerIn: parent; textFormat: Text.PlainText; text: modelData[1]; color: parent.on ? "white" : Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; font.weight: parent.on ? Font.DemiBold : Font.Normal }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: cn.shelf = modelData[0] }
                    }
                }
            }

            // ---- Verified by SIOS
            Text { visible: cn.shelf === "all" || cn.shelf === "verified"; Layout.topMargin: 10; text: "Verified by SIOS"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 18; font.weight: Font.DemiBold }
            Text { visible: cn.shelf === "all" || cn.shelf === "verified"; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Every tool reviewed, with exact risk; if the service changes a tool, SIOS switches it off until you look."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            GridLayout {
                visible: cn.shelf === "all" || cn.shelf === "verified"
                Layout.fillWidth: true
                columns: width > 1000 ? 3 : 2
                columnSpacing: 14; rowSpacing: 14
                Repeater {
                    model: cn.vShown
                    delegate: Rectangle {
                        id: vc
                        required property var modelData
                        readonly property var n: cn.riskCounts(modelData.tools)
                        Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                        implicitHeight: vcc.implicitHeight + 32
                        radius: 16; color: Theme.surface; border.width: 1; border.color: vm.containsMouse ? Theme.lineStrong : Theme.line
                        ColumnLayout {
                            id: vcc
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                            spacing: 10
                            RowLayout {
                                spacing: 10
                                Logo { brand: Brands.colors[vc.modelData.id] ? vc.modelData.id : cn.brandOf(vc.modelData.name); title: vc.modelData.name }
                                ColumnLayout {
                                    spacing: 1
                                    Text { textFormat: Text.PlainText; text: vc.modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                                    Row { spacing: 5
                                        Text { textFormat: Text.PlainText; text: vc.modelData.publisher; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                        Text { visible: !!vc.modelData.verified; text: "✓ Verified"; color: Theme.accent; font.family: Theme.ui; font.pixelSize: 11; font.weight: Font.Bold } }
                                }
                            }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight; textFormat: Text.PlainText; text: vc.modelData.about; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            Flow {
                                Layout.fillWidth: true
                                spacing: 6
                                Chip { visible: vc.n.read > 0; text: vc.n.read + " read"; kind: "read" }
                                Chip { visible: vc.n.reversible > 0; text: vc.n.reversible + " change"; kind: "change" }
                                Chip { visible: vc.n.irreversible > 0; text: vc.n.irreversible + " can't undo"; kind: "x" }
                                Repeater { model: vc.modelData.destinations || []; delegate: Chip { required property string modelData; text: modelData } }
                            }
                            RowLayout {
                                Text { textFormat: Text.PlainText; text: vc.modelData.disabled ? "Switched off: it changed" : vc.modelData.installed ? "✓ Installed" : vc.modelData.signin ? "Sign in with a key" : ""; color: vc.modelData.disabled ? Theme.warn : vc.modelData.installed ? Theme.ok : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12; font.weight: Font.DemiBold }
                                Item { Layout.fillWidth: true }
                                Button { text: vc.modelData.installed ? "Open" : "Install"; kind: vc.modelData.installed ? "plain" : "primary"; onClicked: cn.open_ = "v:" + vc.modelData.id }
                            }
                        }
                        MouseArea { id: vm; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
                    }
                }
            }

            // ---- All MCP servers (the registry)
            Text { visible: cn.shelf !== "verified"; Layout.topMargin: 18; text: "All MCP servers"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 18; font.weight: Font.DemiBold }
            Text { visible: cn.shelf !== "verified"; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "From the official MCP Registry. Not reviewed by SIOS: every tool asks you each time until you say what it does. Names and descriptions are the publishers' own words."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            RowLayout {
                visible: cn.shelf !== "verified" && cn.reg.all === 0
                spacing: 10
                Text { textFormat: Text.PlainText; text: cn.fetching ? "Getting the list (about a minute)…" : "The list isn't here yet."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                Button { visible: !cn.fetching; text: "Get the list"; kind: "plain"; onClicked: cn.refreshRegistry() }
            }
            GridLayout {
                visible: cn.shelf !== "verified"
                Layout.fillWidth: true
                columns: width > 1000 ? 3 : 2
                columnSpacing: 14; rowSpacing: 14
                Repeater {
                    model: cn.rShown
                    delegate: Rectangle {
                        id: rc
                        required property var modelData
                        readonly property string brand: Brands.colors[modelData.owner] ? modelData.owner : ""
                        Layout.fillWidth: true; Layout.preferredWidth: 1; Layout.alignment: Qt.AlignTop
                        implicitHeight: rcc.implicitHeight + 32
                        radius: 16; color: Theme.surface; border.width: 1; border.color: rm.containsMouse ? Theme.lineStrong : Theme.line
                        ColumnLayout {
                            id: rcc
                            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                            spacing: 10
                            RowLayout {
                                spacing: 10
                                Logo { brand: rc.brand; title: rc.modelData.title; iconUrl: rc.modelData.icon }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 1
                                    Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: rc.modelData.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                                    Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: (rc.modelData.maker ? "From its maker · " : "") + rc.modelData.publisher; color: rc.modelData.maker ? Theme.accent : Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                }
                            }
                            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; maximumLineCount: 2; elide: Text.ElideRight; textFormat: Text.PlainText; text: rc.modelData.about || "No description."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            Flow {
                                Layout.fillWidth: true
                                spacing: 6
                                Chip { visible: rc.modelData.installable; text: rc.modelData.talks_to || "online"; kind: "acc" }
                                Chip { visible: !rc.modelData.installable; text: "runs on this computer"; kind: "muted" }
                                Chip { text: "not reviewed"; kind: "send" }
                            }
                            RowLayout {
                                Text { textFormat: Text.PlainText; text: rc.modelData.version ? "v" + rc.modelData.version : ""; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                                Item { Layout.fillWidth: true }
                                Button { text: "Details"; kind: "plain"; onClicked: cn.open_ = "r:" + rc.modelData.name }
                            }
                        }
                        MouseArea { id: rm; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
                    }
                }
            }
            Text { visible: cn.shelf !== "verified" && cn.more.length > 0; Layout.alignment: Qt.AlignHCenter; Layout.topMargin: 6; textFormat: Text.PlainText
                   text: cn.more.length < cn.reg.total ? "Showing " + cn.more.length + " of " + cn.reg.total.toLocaleString(Qt.locale(), "f", 0) + ": scroll for more" : cn.reg.total.toLocaleString(Qt.locale(), "f", 0) + " servers"
                   color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
        }
    }

    // ================================================================ a connector's page
    Flickable {
        id: page
        visible: !!cn.current
        anchors.fill: parent
        contentHeight: pc.implicitHeight + 50
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        QQC2.ScrollBar.vertical: QQC2.ScrollBar {}
        readonly property bool isV: cn.open_.startsWith("v:")
        readonly property var c: cn.current || ({})
        RowLayout {
            id: pc
            x: 34; y: 22
            width: page.width - 68
            spacing: 26
            ColumnLayout {
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
                spacing: 14
                Text { text: "‹ Connectors"; color: Theme.accent; font.family: Theme.ui; font.pixelSize: 13; font.weight: Font.DemiBold; MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: cn.open_ = "" } }
                RowLayout {
                    spacing: 16
                    Logo { size: 64; brand: page.isV ? (Brands.colors[page.c.id] ? page.c.id : cn.brandOf(page.c.name)) : (Brands.colors[page.c.owner] ? page.c.owner : ""); title: (page.isV ? page.c.name : page.c.title) || ""; iconUrl: page.isV ? "" : (page.c.icon || "") }
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3
                        Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: page.isV ? page.c.name || "" : page.c.title || ""; color: Theme.fg; font.family: Theme.display; font.pixelSize: 30; font.weight: Font.DemiBold }
                        Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                               text: page.isV ? page.c.publisher + (page.c.verified ? " · ✓ Verified by SIOS" : "") + " · talks only to " + (page.c.destinations || []).join(", ")
                                             : (page.c.maker ? "From its maker, " : "Published by ") + page.c.publisher + " (checked by the MCP Registry)" + (page.c.talks_to ? " · talks to " + page.c.talks_to : "") }
                    }
                }
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: page.isV ? page.c.about || "" : page.c.about || "No description."; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14 }

                // verified: every tool with its risk
                Rectangle {
                    visible: page.isV
                    Layout.fillWidth: true
                    implicitHeight: tl.implicitHeight + 28; radius: 14; color: Theme.surface; border.width: 1; border.color: Theme.line
                    ColumnLayout {
                        id: tl
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                        spacing: 0
                        Text { Layout.bottomMargin: 8; text: "What its tools can do"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        Repeater {
                            model: page.isV ? page.c.tools || [] : []
                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.topMargin: 6; Layout.bottomMargin: 6
                                spacing: 10
                                Chip { Layout.preferredWidth: 78; text: modelData.level === "read" ? "Reads" : modelData.level === "reversible" ? "Changes" : "Can't undo"; kind: modelData.level === "read" ? "read" : modelData.level === "reversible" ? "change" : "x" }
                                Text { textFormat: Text.PlainText; text: modelData.name; color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.about; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                            }
                        }
                    }
                }
                // the registry: what it is, honestly
                Rectangle {
                    visible: !page.isV
                    Layout.fillWidth: true
                    implicitHeight: rl.implicitHeight + 28; radius: 14; color: Theme.surface; border.width: 1; border.color: Theme.line
                    ColumnLayout {
                        id: rl
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                        spacing: 8
                        Text { text: "About this server"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        Repeater {
                            model: page.isV ? [] : [
                                ["Registry name", page.c.name], ["Version", page.c.version], ["Online address", (page.c.remotes || []).join("\n") || "none (it runs on this computer)"],
                                ["Packages", (page.c.packages || []).join("\n") || "none"], ["Website", page.c.website || "none"], ["Source code", page.c.repository || "none"]
                            ]
                            delegate: RowLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: 12
                                Text { Layout.preferredWidth: 120; Layout.alignment: Qt.AlignTop; textFormat: Text.PlainText; text: modelData[0]; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 13 }
                                Text { Layout.fillWidth: true; wrapMode: Text.WrapAnywhere; textFormat: Text.PlainText; text: modelData[1] || ""; color: Theme.fg; font.family: "JetBrains Mono"; font.pixelSize: 12 }
                            }
                        }
                    }
                }
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: wn.implicitHeight + 24; radius: 12; color: Theme.warnSoft; border.width: 1; border.color: "#ecd2c4"
                    Text { id: wn; anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 14 } wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                           text: page.isV ? "What a service answers is information, never instructions: SIOS marks it as untrusted, and once an AI has read something on this computer, every call to a service asks you first."
                                          : "Not reviewed by SIOS. When installing from the registry arrives, SIOS lists its tools and pins them, and every tool asks you each time until you say what it does. It may only talk to its own address." }
                }
            }

            // ---- right column: install, sign-in, who can use it
            ColumnLayout {
                Layout.preferredWidth: 340
                Layout.alignment: Qt.AlignTop
                Layout.topMargin: 34
                spacing: 14
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: ic.implicitHeight + 28; radius: 14; color: Theme.surface; border.width: 1; border.color: Theme.line
                    ColumnLayout {
                        id: ic
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                        spacing: 10
                        Text { text: page.isV && page.c.installed ? "Installed" : "Install"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        // verified: a key from the service, kept encrypted by SIOS
                        Text { visible: page.isV && !!page.c.signin; Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: page.c.signin ? page.c.signin.label || "" : ""; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                        Rectangle {
                            visible: page.isV && !!page.c.signin
                            Layout.fillWidth: true
                            implicitHeight: 36; radius: 9; color: Theme.surface; border.width: 1; border.color: key.activeFocus ? Theme.accent : Theme.lineStrong
                            QQC2.TextField { id: key; anchors { fill: parent; leftMargin: 10; rightMargin: 6 } leftPadding: 0; background: null; echoMode: TextInput.Password; placeholderText: "Paste it here"; placeholderTextColor: Theme.fg3; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                        }
                        Text { visible: page.isV && !!page.c.signin; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "SIOS keeps it encrypted; no AI ever sees it."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                        RowLayout {
                            visible: page.isV
                            spacing: 8
                            Button { text: page.c.installed ? "Update sign-in" : "Install"; onClicked: { cn.act("connectors.install", { id: page.c.id, ais: page.c.installed ? page.c.ais : ["sios"], secret: key.text }, (page.c.name || "") + " installed"); key.text = ""; } }
                            Button { visible: !!page.c.installed; text: "Remove"; kind: "danger"; onClicked: cn.act("connectors.remove", { id: page.c.id }, (page.c.name || "") + " removed") }
                        }
                        Text { visible: !page.isV; Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                               text: page.c.installable ? "Installing servers from the registry comes next, with sign-in through your browser." : "This one runs on this computer; it becomes installable with SIOS's locked-container runner." }
                    }
                }
                Rectangle {
                    visible: page.isV && !!page.c.installed
                    Layout.fillWidth: true
                    implicitHeight: wc.implicitHeight + 28; radius: 14; color: Theme.surface; border.width: 1; border.color: Theme.line
                    ColumnLayout {
                        id: wc
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 14 }
                        spacing: 4
                        Text { Layout.bottomMargin: 6; text: "Who can use it"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
                        Repeater {
                            model: [{ id: "sios", name: "SIOS (your assistant)" }].concat(cn.apps.map(a => ({ id: a.id, name: a.name + " (paired app)" }))).concat(cn.agents.map(a => ({ id: a.id, name: a.name + " (agent)" })))
                            delegate: RowLayout {
                                required property var modelData
                                readonly property bool on: (page.c.ais || []).indexOf(modelData.id) >= 0
                                Layout.fillWidth: true
                                Layout.topMargin: 4; Layout.bottomMargin: 4
                                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: modelData.name; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 13 }
                                Rectangle {
                                    implicitWidth: 34; implicitHeight: 20; radius: 10; color: parent.on ? Theme.accent : Theme.lineStrong
                                    Rectangle { width: 16; height: 16; radius: 8; y: 2; x: parent.parent.on ? 16 : 2; color: "white" }
                                    MouseArea {
                                        anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                        onClicked: {
                                            const cur = page.c.ais || [];
                                            const next = parent.parent.on ? cur.filter(x => x !== modelData.id) : cur.concat([modelData.id]);
                                            cn.act("connectors.set_ais", { id: page.c.id, ais: next }, "Saved who can use " + page.c.name);
                                        }
                                    }
                                }
                            }
                        }
                        Text { Layout.topMargin: 6; Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Each use by an app or agent asks you, unless its role already allows it. Changes ask for your password."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                    }
                }
                Rectangle {
                    visible: page.isV && !!page.c.disabled
                    Layout.fillWidth: true
                    implicitHeight: dc.implicitHeight + 24; radius: 14; color: Theme.warnSoft; border.width: 1; border.color: "#ecd2c4"
                    Text { id: dc; anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; margins: 14 } wrapMode: Text.WordWrap; textFormat: Text.PlainText; color: Theme.warn; font.family: Theme.ui; font.pixelSize: 13
                           text: "Switched off: " + (page.c.disabled || "") + ". Look at what changed with the service, then update its sign-in to allow the new version." }
                }
            }
        }
    }
}
