// Power: profile, screen off and sleep timers, battery (power-profiles-daemon, PowerDevil).
// Reads `power.state`, changes with `power.set(key, value)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    readonly property var s: power.state
    readonly property var bat: s.battery || ({})
    readonly property bool hasBattery: !!bat.present
    // which set of timers is shown: plugged in, or on battery
    property string which: "ac"
    readonly property var timers: (which === "onBattery" ? s.onBattery : s.ac) || ({})
    onVisibleChanged: if (visible) power.refresh()
    Component.onCompleted: if (visible) power.refresh()
    Timer { interval: 30000; repeat: true; running: pg.visible && pg.hasBattery; onTriggered: power.refresh() }

    function span(secs) {
        const m = Math.round(secs / 60);
        return m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min";
    }
    // a list of choices that always holds the current value, even an unusual one
    function withCurrent(opts, v) {
        return opts.some(o => o[0] === v) || v === undefined ? opts : opts.concat([[v, span(v)]]);
    }
    readonly property var actions: [[16, "Ask what to do"], [1, "Sleep"], [2, "Hibernate"], [8, "Shut down"], [32, "Lock the screen"], [64, "Turn off the screen"], [0, "Do nothing"]]

    PageTitle { title: "Power"; sub: "How this computer saves energy, and when it rests." }

    // the battery, or that there isn't one
    Card {
        RowLayout {
            spacing: 14
            Rectangle {
                implicitWidth: 40; implicitHeight: 40; radius: 11
                color: pg.hasBattery && pg.bat.percent <= 15 && pg.bat.state === 2 ? Theme.dangerSoft : Theme.okSoft
                Icon {
                    anchors.centerIn: parent; size: 20
                    name: !pg.hasBattery ? "plug" : pg.bat.state === 1 ? "battery-charging" : pg.bat.percent <= 15 ? "battery-low" : "battery"
                    color: pg.hasBattery && pg.bat.percent <= 15 && pg.bat.state === 2 ? Theme.danger : Theme.ok
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text {
                    text: pg.hasBattery ? pg.bat.percent + "%" : "No battery: plugged in"
                    color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold
                }
                Text {
                    Layout.fillWidth: true; wrapMode: Text.WordWrap
                    color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
                    text: !pg.hasBattery ? "This computer runs on mains power."
                        : pg.bat.state === 1 ? "Charging" + (pg.bat.toFull > 0 ? ", full in " + pg.span(pg.bat.toFull) : "")
                        : pg.bat.state === 4 ? "Fully charged"
                        : pg.bat.state === 2 ? "On battery" + (pg.bat.toEmpty > 0 ? ", " + pg.span(pg.bat.toEmpty) + " left" : "")
                        : "Plugged in, not charging"
                }
            }
        }
        Rectangle {
            visible: pg.hasBattery
            Layout.fillWidth: true
            implicitHeight: 6; radius: 3; color: Theme.surface3
            Rectangle { width: parent.width * Math.max(0, Math.min(100, pg.bat.percent || 0)) / 100; height: 6; radius: 3; color: (pg.bat.percent || 0) <= 15 ? Theme.danger : Theme.ok }
        }
    }

    // the power mode, only the ones this computer offers
    Card {
        Text { text: "Power mode"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
        Seg {
            visible: (pg.s.profiles || []).length > 0
            options: [["power-saver", "Power saver"], ["balanced", "Balanced"], ["performance", "Performance"]].filter(o => (pg.s.profiles || []).indexOf(o[0]) >= 0)
            value: pg.s.profile
            onPicked: v => power.set("profile", v)
        }
        Text {
            Layout.fillWidth: true; wrapMode: Text.WordWrap
            color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13
            text: (pg.s.profiles || []).length === 0 ? "This computer doesn't offer power modes."
                : ({ "power-saver": "Slower and quieter; the battery lasts longer.", balanced: "Fast when it needs to be, thrifty when it doesn't.", performance: "Full speed; uses more power and may get warm." })[pg.s.profile] || ""
        }
    }

    // timers: separate for plugged in and on battery when there's a battery
    Card {
        RowLayout {
            Text { Layout.fillWidth: true; text: "When you're away"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 14; font.weight: Font.DemiBold }
            Seg {
                visible: pg.hasBattery
                options: [["ac", "Plugged in"], ["onBattery", "On battery"]]
                value: pg.which
                onPicked: v => pg.which = v
            }
        }
        SettingRow {
            label: "Dim the screen after"
            Select {
                options: pg.withCurrent([[0, "Never"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [600, "10 min"], [900, "15 min"], [1800, "30 min"]], pg.timers.dim)
                value: pg.timers.dim
                onPicked: v => power.set(pg.which + ".dim", v)
            }
        }
        SettingRow {
            divider: true
            label: "Turn the screen off after"
            Select {
                options: pg.withCurrent([[0, "Never"], [120, "2 min"], [300, "5 min"], [600, "10 min"], [900, "15 min"], [1800, "30 min"], [3600, "1 h"]], pg.timers.screenOff)
                value: pg.timers.screenOff
                onPicked: v => power.set(pg.which + ".screenOff", v)
            }
        }
        SettingRow {
            divider: true
            label: "Sleep after"
            sub: "Open apps and files stay as they are."
            Select {
                options: pg.withCurrent([[0, "Never"], [300, "5 min"], [600, "10 min"], [900, "15 min"], [1800, "30 min"], [3600, "1 h"], [7200, "2 h"]], pg.timers.sleep)
                value: pg.timers.sleep
                onPicked: v => power.set(pg.which + ".sleep", v)
            }
        }
    }

    Card {
        SettingRow {
            label: "When the power button is pressed"
            Select {
                options: pg.actions
                value: (pg.s.ac || {}).powerButton
                onPicked: v => power.set("powerButton", v)
            }
        }
    }

    Advanced {
        Card {
            SettingRow {
                label: "When the lid is closed"
                sub: "Laptops only."
                Select {
                    options: pg.actions.filter(a => a[0] !== 16)
                    value: (pg.s.ac || {}).lid
                    onPicked: v => power.set("lid", v)
                }
            }
            SettingRow {
                divider: true
                label: "Even with a monitor plugged in"
                sub: "Off: closing the lid while a monitor is connected keeps working."
                Toggle { on: !!(pg.s.ac || {}).lidWithMonitor; onToggled: power.set("lidWithMonitor", !on) }
            }
            SettingRow {
                visible: pg.hasBattery
                divider: true
                label: "When the battery is almost empty"
                Select {
                    options: [[1, "Sleep"], [2, "Hibernate"], [8, "Shut down"], [0, "Do nothing"]]
                    value: pg.s.critical
                    onPicked: v => power.set("critical", v)
                }
            }
            SettingRow {
                divider: true
                label: "Pause music and videos before sleeping"
                Toggle { on: !!pg.s.pauseMedia; onToggled: power.set("pauseMedia", !on) }
            }
        }
    }
}
