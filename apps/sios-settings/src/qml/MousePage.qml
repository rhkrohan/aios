// Mouse & touchpad: speed, acceleration, natural scrolling, left-handed, scroll
// speed; a touchpad's tapping, two-finger click and typing guard; advanced:
// middle-click emulation and the scroll method. A setting a device doesn't
// offer is shown greyed with a word why.
// Reads `mouse.state`, changes with `mouse.set("mouse.<property>" or "touchpad.<property>", value)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    // the backend, by a name a click handler's own `mouse` can't hide
    readonly property QtObject area: mouse
    readonly property var st: area.state
    readonly property var m: st.mouse || ({})
    readonly property var t: st.touchpad || ({})
    readonly property bool hasMouse: !!m.sysName
    readonly property bool hasPad: !!t.sysName
    onVisibleChanged: if (visible) area.refresh()
    Component.onCompleted: if (visible) area.refresh()

    // a switch for one device property, greyed when the device can't do it
    component Switch: SettingRow {
        id: sw
        property string kind
        property string prop
        property bool can: true
        property bool inverted: false
        readonly property var dev: kind === "touchpad" ? pg.t : pg.m
        enabled: can
        opacity: can ? 1 : 0.5
        sub: can ? "" : "This " + (kind === "touchpad" ? "touchpad" : "mouse") + " doesn't offer it."
        Toggle { on: sw.inverted ? !sw.dev[sw.prop] : !!sw.dev[sw.prop]; onToggled: pg.area.set(sw.kind + "." + sw.prop, sw.inverted ? !!sw.dev[sw.prop] : !sw.dev[sw.prop]) }
    }

    PageTitle { title: "Mouse & touchpad"; sub: "How the pointer moves and how scrolling feels." }

    Rectangle {
        visible: !pg.hasMouse && !pg.hasPad
        Layout.fillWidth: true
        implicitHeight: 64; radius: 14
        color: Theme.surface2; border.width: 1; border.color: Theme.line
        RowLayout {
            anchors { fill: parent; leftMargin: 18; rightMargin: 18 }
            spacing: 12
            Icon { name: "mouse"; size: 18; color: Theme.fg3 }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "No mouse or touchpad found. Connect one and it shows here."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
        }
    }

    // ---- mouse
    Card {
        visible: pg.hasMouse
        RowLayout {
            spacing: 12
            Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.surface3; Icon { anchors.centerIn: parent; name: "mouse"; size: 18; color: Theme.fg2 } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { text: "Mouse"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: (pg.st.mice || []).join(", "); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            }
        }
        SettingRow {
            divider: true
            enabled: !!pg.m.supportsPointerAcceleration
            opacity: enabled ? 1 : 0.5
            label: "Pointer speed"
            sub: enabled ? "" : "This mouse doesn't offer it."
            Slider { Layout.fillWidth: false; Layout.preferredWidth: 240; from: -1; to: 1; stepSize: 0.05; value: pg.m.pointerAcceleration || 0; onCommitted: v => pg.area.set("mouse.pointerAcceleration", v) }
        }
        Switch { kind: "mouse"; prop: "pointerAccelerationProfileFlat"; inverted: true; can: !!pg.m.supportsPointerAccelerationProfileFlat; label: "Speed up with fast movements"; divider: true }
        Switch { kind: "mouse"; prop: "naturalScroll"; can: !!pg.m.supportsNaturalScroll; label: "Natural scrolling"; divider: true }
        Switch { kind: "mouse"; prop: "leftHanded"; can: !!pg.m.supportsLeftHanded; label: "Left-handed (swap the buttons)"; divider: true }
        SettingRow {
            divider: true
            label: "Scroll speed"
            sub: (Math.round((pg.m.scrollFactor || 1) * 10) / 10) + "×"
            Slider { Layout.fillWidth: false; Layout.preferredWidth: 240; from: 0.2; to: 3; stepSize: 0.1; value: pg.m.scrollFactor || 1; onCommitted: v => pg.area.set("mouse.scrollFactor", v) }
        }
    }

    // ---- touchpad
    Card {
        visible: pg.hasPad
        RowLayout {
            spacing: 12
            Rectangle { implicitWidth: 36; implicitHeight: 36; radius: 10; color: Theme.surface3; Icon { anchors.centerIn: parent; name: "pointer"; size: 18; color: Theme.fg2 } }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 1
                Text { text: "Touchpad"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: (pg.st.touchpads || []).join(", "); color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            }
        }
        Switch { kind: "touchpad"; prop: "tapToClick"; can: (pg.t.tapFingerCount || 0) > 0; label: "Tap to click"; divider: true }
        Switch { kind: "touchpad"; prop: "clickMethodClickfinger"; can: !!pg.t.supportsClickMethodClickfinger; label: "Click with two fingers for a right click"; divider: true }
        Switch { kind: "touchpad"; prop: "naturalScroll"; can: !!pg.t.supportsNaturalScroll; label: "Natural scrolling"; divider: true }
        Switch { kind: "touchpad"; prop: "disableWhileTyping"; can: !!pg.t.supportsDisableWhileTyping; label: "Ignore the touchpad while typing"; divider: true }
        SettingRow {
            divider: true
            enabled: !!pg.t.supportsPointerAcceleration
            opacity: enabled ? 1 : 0.5
            label: "Pointer speed"
            sub: enabled ? "" : "This touchpad doesn't offer it."
            Slider { Layout.fillWidth: false; Layout.preferredWidth: 240; from: -1; to: 1; stepSize: 0.05; value: pg.t.pointerAcceleration || 0; onCommitted: v => pg.area.set("touchpad.pointerAcceleration", v) }
        }
    }

    // ---- the rarer ones
    Advanced {
        visible: pg.hasMouse || pg.hasPad
        Card {
            Switch { visible: pg.hasMouse; kind: "mouse"; prop: "middleEmulation"; can: !!pg.m.supportsMiddleEmulation; label: "Press both buttons for a middle click (mouse)" }
            Switch { visible: pg.hasPad; kind: "touchpad"; prop: "middleEmulation"; can: !!pg.t.supportsMiddleEmulation; label: "Press both buttons for a middle click (touchpad)"; divider: pg.hasMouse }
            SettingRow {
                visible: pg.hasPad
                divider: true
                enabled: !!pg.t.supportsScrollTwoFinger || !!pg.t.supportsScrollEdge
                opacity: enabled ? 1 : 0.5
                label: "Scroll on the touchpad with"
                Seg {
                    options: [["twoFinger", "Two fingers"], ["edge", "The edge"]]
                    value: pg.t.scrollEdge ? "edge" : "twoFinger"
                    onPicked: v => pg.area.set(v === "edge" ? "touchpad.scrollEdge" : "touchpad.scrollTwoFinger", true)
                }
            }
        }
    }
}
