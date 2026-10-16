// Display: resolution, scale, rotation, refresh rate, brightness, Night Light (kscreen-doctor, KWin's NightLight and knighttimed's schedule).
// Reads `display.state`, changes with `display.set(key, value)` and `display.act(name, params)`.
// A resolution, scale, rotation or refresh change asks "Keep these settings?" and
// goes back by itself after 15 seconds unless kept.
import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import QtQuick.Dialogs

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) display.refresh()
    Component.onCompleted: if (visible) display.refresh()

    readonly property var st: display.state
    readonly property var screens: st.screens || []
    readonly property var night: st.night || ({})
    readonly property bool several: screens.length > 1
    readonly property var mainScreen: screens.find(s => s.primary) || screens[0]

    // half hours for the Night Light times
    readonly property var halfHours: Array.from({ length: 48 }, (_, i) => {
        const h = String(Math.floor(i / 2)).padStart(2, "0"), m = i % 2 ? "30" : "00";
        return [h + ":" + m, h + ":" + m];
    })

    component Head: RowLayout {
        property string icon
        property string title
        property string tag: ""
        spacing: 12
        Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: parent.parent.icon; size: 18; color: Theme.accent } }
        Text { Layout.fillWidth: true; text: parent.title; textFormat: Text.PlainText; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold; elide: Text.ElideRight }
        Pill { visible: parent.tag !== ""; text: parent.tag; kind: "muted" }
    }

    PageTitle { title: "Display"; sub: "How big and sharp things look, and warmer colours in the evening." }

    // nothing to show (no screen information, e.g. outside a desktop session)
    Card {
        visible: pg.screens.length === 0
        RowLayout {
            spacing: 12
            Icon { name: "monitor"; size: 18; color: Theme.fg3 }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: pg.st.error ? "No screen information: " + pg.st.error : "Looking for screens…"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 14 }
        }
    }

    // one card per connected screen
    Repeater {
        model: pg.screens
        delegate: Card {
            id: sc
            required property var modelData
            readonly property var cur: modelData.current || ({})
            readonly property var size: (modelData.sizes || []).find(z => z.w === cur.w && z.h === cur.h) || ({ rates: [] })
            Head { icon: "monitor"; title: pg.several ? sc.modelData.label : "Your screen"; tag: pg.several && sc.modelData.primary ? "Main screen" : "" }
            SettingRow {
                label: "Resolution"
                sub: "More makes things sharper and smaller."
                Select {
                    options: (sc.modelData.sizes || []).map(z => [z.w + "x" + z.h, z.label])
                    value: sc.cur.w + "x" + sc.cur.h
                    onPicked: v => { const p = String(v).split("x"); display.set("size", { screen: sc.modelData.id, w: parseInt(p[0]), h: parseInt(p[1]) }); }
                }
            }
            SettingRow {
                divider: true
                label: "Scale"
                sub: "Bigger makes text and buttons easier to read."
                Select {
                    options: [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].map(x => [x, Math.round(x * 100) + "%"])
                    // the closest step, so 199.99% still shows as 200%
                    value: [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].reduce((a, b) => Math.abs(b - sc.modelData.scale) < Math.abs(a - sc.modelData.scale) ? b : a)
                    onPicked: v => display.set("scale", { screen: sc.modelData.id, value: v })
                }
            }
            SettingRow {
                divider: true
                label: "Rotation"
                Seg {
                    options: [["none", "Normal"], ["left", "Left"], ["right", "Right"], ["inverted", "Upside down"]]
                    value: sc.modelData.rotation
                    onPicked: v => display.set("rotation", { screen: sc.modelData.id, value: v })
                }
            }
            SettingRow {
                divider: true
                visible: (sc.size.rates || []).length > 0
                label: "Refresh rate"
                sub: "Higher is smoother, if the screen supports it."
                Select {
                    options: (sc.size.rates || []).map(r => [r.hz, r.label])
                    value: (sc.size.rates || []).reduce((a, r) => Math.abs(r.hz - sc.cur.hz) < Math.abs(a - sc.cur.hz) ? r.hz : a, (sc.size.rates[0] || {}).hz)
                    onPicked: v => display.set("refresh", { screen: sc.modelData.id, hz: v })
                }
            }
            SettingRow {
                divider: true
                label: "Brightness"
                RowLayout {
                    spacing: 10
                    Icon { name: "sun"; size: 14; color: Theme.fg3 }
                    Slider {
                        Layout.fillWidth: false
                        Layout.preferredWidth: 220
                        from: 1; to: 100; stepSize: 1
                        value: sc.modelData.brightness
                        onCommitted: v => display.set("brightness", { screen: sc.modelData.id, value: Math.round(v) })
                    }
                    Text { Layout.preferredWidth: 38; text: sc.modelData.brightness + "%"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; horizontalAlignment: Text.AlignRight }
                }
            }
        }
    }

    // Night Light
    Card {
        RowLayout {
            spacing: 12
            Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Qt.rgba(0.86, 0.46, 0.22, 0.14); Icon { anchors.centerIn: parent; name: "sun-moon"; size: 18; color: "#dc7637" } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { text: "Night Light"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Warmer colours after dark are easier on your eyes."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 12 }
            }
            Toggle { on: !!pg.night.active; onToggled: display.set("nightActive", !pg.night.active) }
        }
        SettingRow {
            visible: !!pg.night.active
            divider: true
            label: "When"
            Seg {
                options: [["auto", "Sunset to sunrise"], ["times", "Set times"], ["always", "Always on"]]
                value: pg.night.schedule || "auto"
                onPicked: v => display.set("nightSchedule", v)
            }
        }
        SettingRow {
            visible: !!pg.night.active && pg.night.schedule === "times"
            label: "From"
            sub: "Night Light starts at this time and ends at the second."
            Select { implicitWidth: 110; options: pg.halfHours; value: pg.night.sunset || "18:00"; onPicked: v => display.set("sunset", v) }
            Text { text: "to"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            Select { implicitWidth: 110; options: pg.halfHours; value: pg.night.sunrise || "06:00"; onPicked: v => display.set("sunrise", v) }
        }
        SettingRow {
            visible: !!pg.night.active
            divider: true
            label: "Warmth"
            sub: "Shown while you drag."
            RowLayout {
                spacing: 10
                Text { text: "Less"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
                Slider {
                    id: warmth
                    Layout.fillWidth: false
                    Layout.preferredWidth: 200
                    // 0 is 6500 K (no change), 100 is 2500 K (very warm)
                    from: 0; to: 100; stepSize: 1
                    value: (6500 - (pg.night.temperature || 4500)) / 40
                    onMoved: display.act("previewWarmth", { k: Math.round(6500 - value * 40) })
                    onCommitted: v => { display.set("nightTemp", Math.round(6500 - v * 40)); display.act("stopPreview", {}); }
                }
                Text { text: "More"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            }
        }
    }

    // the rarer settings
    Advanced {
        Card {
            Repeater {
                model: pg.screens
                delegate: SettingRow {
                    id: icc
                    required property var modelData
                    required property int index
                    divider: index > 0
                    label: "Colour profile" + (pg.several ? ": " + modelData.label : "")
                    sub: modelData.icc ? "Using " + modelData.icc.split("/").pop() : "Matches colours to a calibrated screen."
                    Select {
                        options: [["srgb", "None (standard)"], ["edid", "From the screen"], ["file", "A profile file…"]]
                        value: icc.modelData.icc ? "file" : "srgb"
                        onPicked: v => {
                            if (v === "file") { iccDialog.screen = icc.modelData.id; iccDialog.open(); }
                            else display.set("icc", { screen: icc.modelData.id, source: v });
                        }
                    }
                }
            }
            SettingRow {
                visible: pg.several
                divider: true
                label: "Main screen"
                sub: "Where the dock and new windows go."
                Select {
                    options: pg.screens.map(s => [s.id, s.label])
                    value: pg.mainScreen ? pg.mainScreen.id : -1
                    onPicked: v => display.set("primary", { screen: v })
                }
            }
            Repeater {
                model: pg.several ? pg.screens.filter(s => !s.primary) : []
                delegate: SettingRow {
                    id: side
                    required property var modelData
                    divider: true
                    label: modelData.label
                    sub: "Where it sits next to the main screen."
                    Seg {
                        options: [["left", "On the left"], ["right", "On the right"]]
                        value: pg.mainScreen && side.modelData.x < pg.mainScreen.x ? "left" : "right"
                        onPicked: v => display.set("side", { screen: side.modelData.id, value: v })
                    }
                }
            }
            SettingRow {
                divider: true
                label: "Allow tearing in full-screen games"
                sub: "Lower delay in games, sometimes with a visible line while things move."
                Toggle { on: pg.st.tearing !== false; onToggled: display.set("tearing", !(pg.st.tearing !== false)) }
            }
            SettingRow {
                divider: true
                label: "Older apps (X11)"
                sub: "Sharp lets them scale themselves; some may look small. Right size scales them for you; they may look soft."
                Seg {
                    options: [[true, "Sharp"], [false, "Right size"]]
                    value: pg.st.x11Self !== false
                    onPicked: v => display.set("x11Self", v)
                }
            }
        }
    }

    FileDialog {
        id: iccDialog
        property int screen: -1
        title: "Choose a colour profile"
        nameFilters: ["Colour profiles (*.icc *.icm)"]
        onAccepted: display.set("icc", { screen: screen, source: "file", path: decodeURIComponent(String(selectedFile).replace(/^file:\/\//, "")) })
    }

    // "Keep these settings?": a real window, 15 seconds, then back to what was there
    Window {
        id: keep
        property int left: 15
        transientParent: pg.Window.window
        flags: Qt.Dialog
        modality: Qt.ApplicationModal
        title: "Keep these settings?"
        width: 460
        height: kc.implicitHeight + 48 + kf.height
        minimumWidth: 460
        maximumWidth: 460
        color: Theme.surface
        visible: !!pg.st.confirm
        onVisibleChanged: if (visible) { left = 15; tick.restart(); raise(); requestActivate(); } else tick.stop()
        onClosing: display.act("revert", {})
        Timer { id: tick; interval: 1000; repeat: true; onTriggered: { keep.left -= 1; if (keep.left <= 0) { stop(); display.act("revert", {}); } } }
        ColumnLayout {
            id: kc
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 26 }
            spacing: 10
            RowLayout {
                spacing: 14
                Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 11; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: "monitor"; size: 20; color: Theme.accent } }
                Text { Layout.fillWidth: true; text: "Keep these settings?"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 20; font.weight: Font.DemiBold }
            }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Your screen changed. If it looks wrong, wait and it goes back by itself in " + keep.left + (keep.left === 1 ? " second." : " seconds."); color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14 }
        }
        Rectangle {
            id: kf
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: 62
            color: Theme.surface2
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors { fill: parent; leftMargin: 20; rightMargin: 20 }
                spacing: 8
                Item { Layout.fillWidth: true }
                Button { text: "Go back"; kind: "plain"; onClicked: display.act("revert", {}) }
                Button { text: "Keep"; onClicked: display.act("keep", {}) }
            }
        }
    }
}
