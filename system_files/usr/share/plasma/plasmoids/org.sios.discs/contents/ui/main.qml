/*
    The desktop's folder discs (Projects, Documents, Downloads, Pictures), a
    column on the left like the preview's Desktop.tsx. Double-click opens the
    folder in Files.
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import QtCore
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasma5support as P5Support

PlasmoidItem {
    id: root
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground
    preferredRepresentation: fullRepresentation

    readonly property string home: String(StandardPaths.writableLocation(StandardPaths.HomeLocation)).replace("file://", "")

    P5Support.DataSource {
        id: run
        engine: "executable"
        onNewData: (source) => disconnectSource(source)
    }

    // Projects isn't one of the standard folders; make it so the disc has something to show
    Component.onCompleted: run.connectSource("mkdir -p '" + home + "/Projects'")

    function openFolder(path) {
        // Projects isn't one of the standard folders, so make it the first time
        run.connectSource("mkdir -p '" + path + "' && xdg-open '" + path + "'");
    }

    fullRepresentation: Column {
        spacing: 12

        Repeater {
            model: [
                { label: "Projects", dir: "Projects", emblem: "projects" },
                { label: "Documents", dir: "Documents", emblem: "documents" },
                { label: "Downloads", dir: "Downloads", emblem: "downloads" },
                { label: "Pictures", dir: "Pictures", emblem: "pictures", photo: true }
            ]
            delegate: Disc {
                required property var modelData
                label: modelData.label
                path: root.home + "/" + modelData.dir
                emblem: modelData.emblem
                photo: !!modelData.photo
                onOpen: root.openFolder(path)
            }
        }
    }
}
