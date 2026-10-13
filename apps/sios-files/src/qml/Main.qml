// SIOS Files, the preview's Files app (FilesApp.tsx) on the real machine.
//   sidebar | toolbar, grid or list, status line | details panel
// Keys: Space preview, Enter open, F2 rename, Delete to Trash, Ctrl+Z undo,
// Ctrl+A select all, Ctrl+C / X / V, Ctrl+Shift+N new folder, Ctrl+F search,
// Backspace or Alt+Left back, arrows move the selection.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.sios.files.core

QQC2.ApplicationWindow {
    id: app
    width: 1180
    height: 720
    minimumWidth: 760
    minimumHeight: 460
    visible: true
    title: folder.title + " — Files"
    color: Theme.surface

    FolderModel { id: folder; location: startLocation }
    FolderModel { id: webScan; location: "web:" }

    // ---- selection
    property var selected: []
    property string anchorLocation: ""
    property string renaming: ""
    readonly property var current: selected.length === 1 ? itemAt(selected[0]) : null

    function itemAt(location) { return folder.flatItems().find(i => i.location === location) || null; }
    function isSelected(location) { return selected.indexOf(location) >= 0; }
    function clearSelection() { selected = []; anchorLocation = ""; }
    function choose(item, mods) {
        if (mods & Qt.ControlModifier) {
            selected = isSelected(item.location) ? selected.filter(l => l !== item.location) : selected.concat([item.location]);
            anchorLocation = item.location;
        } else if (mods & Qt.ShiftModifier && anchorLocation) {
            const all = folder.flatItems().map(i => i.location);
            const a = all.indexOf(anchorLocation), b = all.indexOf(item.location);
            selected = all.slice(Math.min(a, b), Math.max(a, b) + 1);
        } else {
            selected = [item.location];
            anchorLocation = item.location;
        }
        content.forceActiveFocus();
    }
    function moveSelection(by) {
        const all = folder.flatItems();
        if (!all.length) return;
        let i = all.findIndex(x => x.location === (selected[selected.length - 1] || ""));
        i = i < 0 ? 0 : Math.max(0, Math.min(all.length - 1, i + by));
        selected = [all[i].location];
        anchorLocation = all[i].location;
    }
    function dragLocations(location) { return isSelected(location) ? selected : [location]; }
    Connections { target: folder; function onLocationChanged() { app.clearSelection(); app.renaming = ""; } }

    // ---- actions
    function activate(item) {
        if (!item) return;
        if (item.isDir) folder.go(item.target || item.location);
        else fileOps.open(item.target || item.location);
    }
    function finishRename(location, name) {
        renaming = "";
        fileOps.rename(location, name);
    }
    function trashSelected() {
        if (!selected.length || folder.isTrash) return;
        fileOps.trash(selected);
        clearSelection();
    }
    function newFolder() {
        if (!folder.location.startsWith("file:")) return;
        const made = fileOps.newFolder(folder.location);
        renameWhenListed.target = made;
    }
    function dropInto(locations, toFolder, copy) {
        if (copy) fileOps.copy(locations, toFolder); else fileOps.move(locations, toFolder);
    }
    // a new folder gets its name typed straight away, once it appears
    QtObject {
        id: renameWhenListed
        property string target: ""
    }
    Connections {
        target: folder
        function onGroupsChanged() {
            if (renameWhenListed.target && app.itemAt(renameWhenListed.target)) {
                app.selected = [renameWhenListed.target];
                app.renaming = renameWhenListed.target;
                renameWhenListed.target = "";
            }
        }
    }

    // ---- menus
    property var menuItem: null
    function itemMenu(item) {
        if (!isSelected(item.location)) choose(item, 0);
        menuItem = item;
        itemMenuPopup.popup();
    }
    function backgroundMenu() { backgroundMenuPopup.popup(); }

    Menu {
        id: itemMenuPopup
        MenuItem { text: "Open"; hint: "Enter"; onTriggered: app.activate(app.menuItem) }
        MenuItem { text: "Open with…"; enabled: !!app.menuItem && !app.menuItem.isDir; onTriggered: fileOps.openWith(app.menuItem.location) }
        MenuItem { text: "Quick look"; hint: "Space"; onTriggered: look.item = app.menuItem }
        MenuSeparator {}
        MenuItem { text: "Rename"; hint: "F2"; enabled: app.selected.length === 1 && !folder.isTrash; onTriggered: app.renaming = app.menuItem.location }
        MenuItem { text: "Copy"; hint: "Ctrl+C"; onTriggered: fileOps.toClipboard(app.selected, false) }
        MenuItem { text: "Cut"; hint: "Ctrl+X"; enabled: !folder.isTrash; onTriggered: fileOps.toClipboard(app.selected, true) }
        MenuSeparator {}
        MenuItem { text: "Show details"; onTriggered: toolbar.inspector = true }
        MenuItem { text: "Move to Trash"; hint: "Delete"; danger: true; enabled: !folder.isTrash; onTriggered: app.trashSelected() }
    }
    Menu {
        id: backgroundMenuPopup
        MenuItem { text: "New folder"; hint: "Ctrl+Shift+N"; enabled: folder.location.startsWith("file:"); onTriggered: app.newFolder() }
        MenuItem { text: "Paste"; hint: "Ctrl+V"; enabled: fileOps.clipboardHasFiles() && folder.location.startsWith("file:"); onTriggered: fileOps.paste(folder.location) }
        MenuSeparator {}
        MenuItem { text: "Select all"; hint: "Ctrl+A"; onTriggered: app.selected = folder.flatItems().map(i => i.location) }
        MenuItem { text: "Empty Trash"; danger: true; visible: folder.isTrash; enabled: folder.count > 0; onTriggered: fileOps.emptyTrash() }
    }

    Connections {
        target: fileOps
        function onMessage(text, undoable) { toast.show(text, undoable, false); }
        function onFailed(text) { toast.show(text, false, true); }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Sidebar {
            Layout.fillHeight: true
            location: folder.location
            webCount: webScan.count
            onGo: (l) => folder.go(l)
            onDropped: (locations, to, copy) => app.dropInto(locations, to, copy)
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            Toolbar {
                id: toolbar
                Layout.fillWidth: true
                folder: folder
                onNewFolder: app.newFolder()
                onEmptyTrash: fileOps.emptyTrash()
                onCopied: toast.show("Path copied", false, false)
            }

            // the items, with the keyboard
            FocusScope {
                id: content
                Layout.fillWidth: true
                Layout.fillHeight: true
                focus: true

                Keys.onPressed: (e) => {
                    const ctrl = e.modifiers & Qt.ControlModifier;
                    if (e.key === Qt.Key_Space) { look.item = app.current || app.itemAt(app.selected[0] || ""); e.accepted = true; }
                    else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter) { app.activate(app.current); e.accepted = true; }
                    else if (e.key === Qt.Key_F2 && app.current) { app.renaming = app.current.location; e.accepted = true; }
                    else if (e.key === Qt.Key_Delete) { app.trashSelected(); e.accepted = true; }
                    else if (ctrl && e.key === Qt.Key_Z) { fileOps.undo(); e.accepted = true; }
                    else if (ctrl && e.key === Qt.Key_A) { app.selected = folder.flatItems().map(i => i.location); e.accepted = true; }
                    else if (ctrl && e.key === Qt.Key_C && app.selected.length) { fileOps.toClipboard(app.selected, false); e.accepted = true; }
                    else if (ctrl && e.key === Qt.Key_X && app.selected.length) { fileOps.toClipboard(app.selected, true); e.accepted = true; }
                    else if (ctrl && e.key === Qt.Key_V) { fileOps.paste(folder.location); e.accepted = true; }
                    else if (ctrl && (e.modifiers & Qt.ShiftModifier) && e.key === Qt.Key_N) { app.newFolder(); e.accepted = true; }
                    else if (ctrl && e.key === Qt.Key_F) { toolbar.searchField.forceActiveFocus(); e.accepted = true; }
                    else if (e.key === Qt.Key_Backspace || ((e.modifiers & Qt.AltModifier) && e.key === Qt.Key_Left)) { folder.back(); e.accepted = true; }
                    else if (e.key === Qt.Key_Right || e.key === Qt.Key_Down) { app.moveSelection(toolbar.view === "grid" && e.key === Qt.Key_Down ? Math.max(1, Math.floor((content.width - 32) / 128)) : 1); e.accepted = true; }
                    else if (e.key === Qt.Key_Left || e.key === Qt.Key_Up) { app.moveSelection(-(toolbar.view === "grid" && e.key === Qt.Key_Up ? Math.max(1, Math.floor((content.width - 32) / 128)) : 1)); e.accepted = true; }
                    else if (e.key === Qt.Key_Escape) { app.clearSelection(); e.accepted = true; }
                }

                ItemGrid { anchors.fill: parent; visible: toolbar.view === "grid" && folder.count > 0; folder: folder; app: app }
                ItemList { anchors.fill: parent; visible: toolbar.view === "list" && folder.count > 0; folder: folder; app: app }

                // drop files from elsewhere into this folder
                DropArea {
                    anchors.fill: parent
                    z: -1
                    enabled: folder.location.startsWith("file:")
                    keys: ["text/uri-list"]
                    onDropped: (d) => {
                        const from = d.urls.map(u => String(u)).filter(u => u.substring(0, u.lastIndexOf("/")) !== folder.location);
                        if (from.length) app.dropInto(from, folder.location, d.proposedAction === Qt.CopyAction);
                        d.accept();
                    }
                }

                // nothing here
                Column {
                    anchors.centerIn: parent
                    visible: folder.count === 0 && !folder.loading
                    spacing: 8
                    width: 320
                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        text: folder.filter ? "Nothing matches “" + folder.filter + "”" : folder.location === "web:" ? "Nothing from the web yet" : folder.isTrash ? "Trash is empty" : "This folder is empty"
                        color: Theme.fg2
                        font.family: Theme.ui
                        font.pixelSize: 15
                        font.weight: Font.Medium
                    }
                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.WordWrap
                        text: folder.filter ? "Try fewer letters." : folder.location === "web:" ? "Files you download or save from email show up here, so you always know what came from outside." : folder.isTrash ? "Things you delete wait here until you empty it." : "Drag files here, or make a new folder."
                        color: Theme.fg3
                        font.family: Theme.ui
                        font.pixelSize: 13
                    }
                }
            }

            // status line
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 38
                color: Theme.surface
                Rectangle { width: parent.width; height: 1; color: Theme.line }
                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 24
                    anchors.rightMargin: 24
                    Text {
                        text: app.selected.length > 1 ? app.selected.length + " selected" : folder.count + (folder.count === 1 ? " item" : " items")
                        color: Theme.fg2
                        font.family: Theme.ui
                        font.pixelSize: 12
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: "Space to preview, F2 to rename, Delete to trash, drag to move"
                        color: Theme.fg3
                        font.family: Theme.ui
                        font.pixelSize: 12
                        elide: Text.ElideLeft
                        Layout.maximumWidth: parent.width * 0.6
                    }
                }
            }
        }

        Inspector {
            Layout.fillHeight: true
            visible: toolbar.inspector
            item: app.current
            selectedCount: app.selected.length
            onOpenItem: (i) => app.activate(i)
        }
    }

    QuickLook {
        id: look
        anchors.fill: parent
        onClosed: { look.item = null; content.forceActiveFocus(); }
        onStep: (by) => { app.moveSelection(by); look.item = app.current; }
        onOpenItem: (i) => app.activate(i)
    }

    Toast { id: toast; onUndo: fileOps.undo() }
}
