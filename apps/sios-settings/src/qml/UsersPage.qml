// Your account: your picture and name, your username, changing your password (in
// its own window; the system then asks for your current password), automatic
// sign-in. Reads `users.state`, changes with `users.set(key, value)` and `users.act("password", ...)`.
import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import QtQuick.Dialogs

ColumnLayout {
    id: pg
    spacing: 18
    readonly property QtObject area: users
    readonly property var st: area.state
    property bool picking: false
    onVisibleChanged: if (visible) { area.refresh(); nameField.text = ""; }
    Component.onCompleted: if (visible) { area.refresh(); nameField.text = ""; }

    PageTitle { title: "Your account"; sub: "How you appear on this computer, and how you sign in." }

    Rectangle {
        visible: pg.st.available === false
        Layout.fillWidth: true
        implicitHeight: 64; radius: 14
        color: Theme.surface2; border.width: 1; border.color: Theme.line
        Text { anchors { fill: parent; leftMargin: 18; rightMargin: 18 } verticalAlignment: Text.AlignVCenter; wrapMode: Text.WordWrap; text: "Your account details can't be read right now (the account service isn't running)."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
    }

    // ---- picture and name
    Card {
        visible: pg.st.available !== false
        RowLayout {
            spacing: 18
            // the picture: click to change it
            Rectangle {
                implicitWidth: 84; implicitHeight: 84; radius: 42
                color: Theme.surface3
                clip: true
                Image { id: face; anchors.fill: parent; visible: status === Image.Ready; source: pg.st.icon ? "file://" + pg.st.icon : ""; sourceSize: Qt.size(168, 168); fillMode: Image.PreserveAspectCrop; cache: false }
                Icon { anchors.centerIn: parent; visible: face.status !== Image.Ready; name: "user-round"; size: 38; color: Theme.fg3 }
                MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: pg.picking = !pg.picking }
                Accessible.role: Accessible.Button
                Accessible.name: "Change your picture"
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { Layout.fillWidth: true; elide: Text.ElideRight; textFormat: Text.PlainText; text: pg.st.name || pg.st.username || ""; color: Theme.fg; font.family: Theme.display; font.pixelSize: 24; font.weight: Font.DemiBold }
                Text { textFormat: Text.PlainText; text: "Username: " + (pg.st.username || ""); color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
                Text { visible: !!pg.st.admin; text: "Can change this computer's settings (administrator)"; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            }
            Button { text: pg.picking ? "Done" : "Change picture"; kind: "plain"; onClicked: pg.picking = !pg.picking }
        }
        // SIOS's faces, or a picture of your own
        ColumnLayout {
            visible: pg.picking
            Layout.fillWidth: true
            spacing: 10
            Flow {
                Layout.fillWidth: true
                spacing: 10
                Repeater {
                    model: pg.st.faces || []
                    delegate: Rectangle {
                        required property string modelData
                        width: 56; height: 56; radius: 28
                        color: Theme.surface3
                        border.width: pg.st.icon === modelData ? 2 : 0
                        border.color: Theme.accent
                        clip: true
                        Image { anchors.fill: parent; anchors.margins: 2; source: "file://" + modelData; sourceSize: Qt.size(112, 112); fillMode: Image.PreserveAspectCrop; asynchronous: true }
                        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: pg.area.set("icon", modelData) }
                    }
                }
            }
            RowLayout {
                Button { text: "Choose a picture…"; kind: "plain"; onClicked: chooser.open() }
                Text { Layout.fillWidth: true; text: "PNG or JPEG, up to 5 MB."; color: Theme.fg3; font.family: Theme.ui; font.pixelSize: 12 }
            }
        }
        SettingRow {
            divider: true
            label: "Your name"
            sub: "Shown on the sign-in screen and in SIOS."
            Field { id: nameField; Layout.preferredWidth: 220; placeholder: pg.st.name || "Your name"; onAccepted: saveName.clicked() }
            Button { id: saveName; text: "Save"; kind: "plain"; onClicked: if (nameField.text.trim()) { pg.area.set("name", nameField.text.trim()); nameField.text = ""; } }
        }
    }

    // ---- signing in
    Card {
        visible: pg.st.available !== false
        Text { text: "Signing in"; color: Theme.fg; font.family: Theme.ui; font.pixelSize: 15; font.weight: Font.DemiBold }
        SettingRow {
            label: "Password"
            sub: "Change the password you sign in with."
            Button { text: "Change password"; kind: "plain"; onClicked: pw.open() }
        }
        SettingRow {
            divider: true
            label: "Sign in automatically"
            sub: "Starts straight into your desktop, without the sign-in screen. Anyone who turns the computer on gets in. Asks for your password."
            Toggle { on: !!pg.st.autologin; onToggled: pg.area.set("autologin", !pg.st.autologin) }
        }
    }

    FileDialog {
        id: chooser
        title: "Choose your picture"
        nameFilters: ["Pictures (*.png *.jpg *.jpeg)"]
        onAccepted: pg.area.set("icon", String(selectedFile))
    }

    // the new password, twice, in a window of its own; cleared whatever happens
    Window {
        id: pw
        function open() { a.text = ""; b.text = ""; show(); raise(); requestActivate(); a.field.forceActiveFocus(); }
        function done() { a.text = ""; b.text = ""; close(); }
        flags: Qt.Dialog
        modality: Qt.ApplicationModal
        title: "Change password"
        width: 460; minimumWidth: 460; maximumWidth: 460
        height: pwBody.implicitHeight + 52 + pwFoot.height
        color: Theme.surface
        readonly property bool same: a.text === b.text
        readonly property bool ok: a.text.length >= 8 && same
        onVisibleChanged: if (!visible) { a.text = ""; b.text = ""; }
        ColumnLayout {
            id: pwBody
            anchors { left: parent.left; right: parent.right; top: parent.top; margins: 26 }
            spacing: 12
            RowLayout {
                spacing: 14
                Rectangle { implicitWidth: 40; implicitHeight: 40; radius: 11; color: Theme.accentSoft; Icon { anchors.centerIn: parent; name: "key-round"; size: 20; color: Theme.accent } }
                Text { Layout.fillWidth: true; text: "Change your password"; color: Theme.fg; font.family: Theme.display; font.pixelSize: 20; font.weight: Font.DemiBold }
            }
            Text { Layout.fillWidth: true; wrapMode: Text.WordWrap; text: "Type the new password twice. Next, the system asks for your current password to confirm it's you."; color: Theme.fg2; font.family: Theme.ui; font.pixelSize: 13 }
            Field { id: a; placeholder: "New password (at least 8 characters)"; secret: TextInput.Password; implicitHeight: 36 }
            Field { id: b; placeholder: "The new password again"; secret: TextInput.Password; implicitHeight: 36; onAccepted: if (pw.ok) change.clicked() }
            Text { visible: b.text.length > 0 && !pw.same; text: "The two aren't the same yet."; color: Theme.danger; font.family: Theme.ui; font.pixelSize: 12 }
        }
        Rectangle {
            id: pwFoot
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: 62
            color: Theme.surface2
            Rectangle { width: parent.width; height: 1; color: Theme.line }
            RowLayout {
                anchors { fill: parent; leftMargin: 20; rightMargin: 20 }
                spacing: 8
                Item { Layout.fillWidth: true }
                Button { text: "Cancel"; kind: "plain"; onClicked: pw.done() }
                Button {
                    id: change
                    text: "Change password"
                    opacity: pw.ok ? 1 : 0.5
                    onClicked: {
                        if (!pw.ok) return;
                        pg.area.act("password", { password: a.text, again: b.text });
                        pw.done();
                    }
                }
            }
        }
        Shortcut { sequence: "Escape"; onActivated: pw.done() }
    }
}
