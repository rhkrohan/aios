// Sound: output and input devices, volumes, mute, a test sound (PipeWire: wpctl, pw-dump).
// Reads `sound.state`, changes with `sound.set(key, value)` and `sound.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) sound.refresh()
    PageTitle { title: "Sound"; sub: "" }
}
