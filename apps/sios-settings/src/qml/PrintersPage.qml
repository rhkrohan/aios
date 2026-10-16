// Printers: found printers, add one (driverless), default, test page (CUPS: lpstat, lpadmin).
// Reads `printers.state`, changes with `printers.set(key, value)` and `printers.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) printers.refresh()
    PageTitle { title: "Printers"; sub: "" }
}
