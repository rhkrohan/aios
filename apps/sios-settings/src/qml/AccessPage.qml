// Accessibility: larger text, reduce motion, high contrast, a bigger pointer, sticky, slow and bounce keys, the screen reader, zoom (kdeglobals, kaccessrc, kwinrc).
// Reads `access.state`, changes with `access.set(key, value)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) access.refresh()
    Component.onCompleted: if (visible) access.refresh()

    readonly property var st: access.state

    component Head: RowLayout {
        property string icon
        property string title
        spacing: 12
        Layout.bottomMargin: 2
        Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: parent.parent.icon; size: 18; color: Theme.accent } }
        Text { Layout.fillWidth: true; text: parent.title; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
    }

    PageTitle { title: "Accessibility"; sub: "Make the computer easier to see, hear and type on." }

    Card {
        Head { icon: "eye"; title: "Seeing" }
        SettingRow {
            label: "Text size"
            sub: "Makes text bigger everywhere."
            Seg {
                options: [[100, "Normal"], [115, "Large"], [130, "Larger"], [150, "Largest"]]
                value: pg.st.textScale || 100
                onPicked: v => access.set("textScale", v)
            }
        }
        SettingRow {
            divider: true
            label: "High contrast"
            sub: "Black text on white, with stronger colours."
            Toggle { on: !!pg.st.highContrast; onToggled: access.set("highContrast", !pg.st.highContrast) }
        }
        SettingRow {
            divider: true
            label: "Pointer size"
            Seg {
                options: [[24, "Normal"], [36, "Large"], [48, "Larger"], [72, "Largest"]]
                value: [24, 36, 48, 72].reduce((a, b) => Math.abs(b - (pg.st.cursorSize || 24)) < Math.abs(a - (pg.st.cursorSize || 24)) ? b : a)
                onPicked: v => access.set("cursorSize", v)
            }
        }
        SettingRow {
            divider: true
            label: "Zoom"
            sub: "Meta and = zooms in, Meta and − zooms out."
            Toggle { on: !!pg.st.zoom; onToggled: access.set("zoom", !pg.st.zoom) }
        }
        SettingRow {
            divider: true
            label: "Screen reader"
            sub: pg.st.orca === false ? "The screen reader (Orca) isn't installed on this computer." : "Reads out what's on the screen. Meta, Alt and S turns it on or off."
            Toggle { opacity: pg.st.orca === false ? 0.4 : 1; on: !!pg.st.screenReader; onToggled: if (pg.st.orca !== false) access.set("screenReader", !pg.st.screenReader) }
        }
    }

    Card {
        Head { icon: "move"; title: "Motion" }
        SettingRow {
            label: "Reduce motion"
            sub: "Windows and menus appear without sliding or fading."
            Toggle { on: !!pg.st.reduceMotion; onToggled: access.set("reduceMotion", !pg.st.reduceMotion) }
        }
    }

    Card {
        Head { icon: "keyboard"; title: "Typing" }
        SettingRow {
            label: "Sticky keys"
            sub: "Press Shift, Ctrl or Alt, then the next key, instead of holding them together."
            Toggle { on: !!pg.st.stickyKeys; onToggled: access.set("stickyKeys", !pg.st.stickyKeys) }
        }
        SettingRow {
            divider: true
            label: "Slow keys"
            sub: "A key counts only when held for a moment."
            Toggle { on: !!pg.st.slowKeys; onToggled: access.set("slowKeys", !pg.st.slowKeys) }
        }
        SettingRow {
            divider: true
            label: "Bounce keys"
            sub: "Quick repeated presses of the same key count once."
            Toggle { on: !!pg.st.bounceKeys; onToggled: access.set("bounceKeys", !pg.st.bounceKeys) }
        }
    }

    Advanced {
        Card {
            SettingRow {
                label: "Slow keys: hold for"
                RowLayout {
                    spacing: 10
                    Slider { Layout.fillWidth: false; Layout.preferredWidth: 200; from: 50; to: 1000; stepSize: 50; value: pg.st.slowKeysDelay || 500; onCommitted: v => access.set("slowKeysDelay", Math.round(v)) }
                    Text { Layout.preferredWidth: 60; text: (pg.st.slowKeysDelay || 500) + " ms"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; horizontalAlignment: Text.AlignRight }
                }
            }
            SettingRow {
                divider: true
                label: "Bounce keys: ignore repeats within"
                RowLayout {
                    spacing: 10
                    Slider { Layout.fillWidth: false; Layout.preferredWidth: 200; from: 50; to: 1000; stepSize: 50; value: pg.st.bounceKeysDelay || 500; onCommitted: v => access.set("bounceKeysDelay", Math.round(v)) }
                    Text { Layout.preferredWidth: 60; text: (pg.st.bounceKeysDelay || 500) + " ms"; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13; horizontalAlignment: Text.AlignRight }
                }
            }
            SettingRow {
                divider: true
                label: "Flash the screen for alert sounds"
                sub: "A visual bell, for when you can't hear the computer."
                Toggle { on: !!pg.st.visualBell; onToggled: access.set("visualBell", !pg.st.visualBell) }
            }
            SettingRow {
                divider: true
                visible: !pg.st.reduceMotion
                label: "Animation speed"
                Seg {
                    options: [[0.5, "Faster"], [1, "Normal"], [2, "Slower"]]
                    value: [0.5, 1, 2].reduce((a, b) => Math.abs(b - (pg.st.motionSpeed || 1)) < Math.abs(a - (pg.st.motionSpeed || 1)) ? b : a)
                    onPicked: v => access.set("motionSpeed", v)
                }
            }
        }
    }
}
