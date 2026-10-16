// Your account: name, picture, password (AccountsService over D-Bus).
// Reads `users.state`, changes with `users.set(key, value)` and `users.act(name, params)`.
import QtQuick
import QtQuick.Layouts

ColumnLayout {
    id: pg
    spacing: 18
    onVisibleChanged: if (visible) users.refresh()
    PageTitle { title: "Your account"; sub: "" }
}
