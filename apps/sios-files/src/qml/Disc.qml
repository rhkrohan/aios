// A folder in SIOS Files: the SIOS folder (warm, with a blue badge for what's
// inside; ui/make-folders.py, owner's pick 2026-10-14). Same inputs as before
// (name, stats, open, size), so every place that shows a folder is unchanged.
import QtQuick

Item {
    id: disc
    property string name
    property var stats: ({ total: 0, segments: [], untrusted: 0 })
    property bool open: false   // hovered or selected: lifts a little
    property int size: 64
    width: size
    height: size

    // known folders get their sign; anything else is a plain folder
    readonly property string kind: ({
        projects: "projects", documents: "documents", downloads: "downloads", pictures: "pictures",
        screenshots: "pictures", images: "pictures", photos: "pictures", music: "music",
        videos: "videos", desktop: "desktop", home: "home"
    })[name.toLowerCase()] || "folder"

    Image {
        anchors.centerIn: parent
        width: disc.size
        height: disc.size
        sourceSize: Qt.size(disc.size * 2, disc.size * 2)
        source: "qrc:/qt/qml/org/sios/files/src/folders/" + disc.kind + ".svg"
        smooth: true
        scale: disc.open ? 1.05 : 1.0
        Behavior on scale { NumberAnimation { duration: 120 } }
    }
}
