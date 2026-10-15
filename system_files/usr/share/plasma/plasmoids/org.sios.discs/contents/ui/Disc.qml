/*
    One folder on the desktop: the SIOS folder for its kind, its name, and what's
    inside (read from the real folder with FolderListModel; shown on hover).
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick
import Qt.labs.folderlistmodel

Item {
    id: disc
    property string label
    property string path         // absolute path
    property string emblem       // file in ../images, without .svg
    property bool photo: false   // show the newest picture in the core
    signal open()

    width: 100
    height: 74 + 46

    readonly property var colors: ({
        folder: "#ffffff", pdf: "#d4524b", doc: "#3b74bf", sheet: "#2e8d5c", slides: "#dc7637",
        image: "#7b62c4", archive: "#8b7652", installer: "#56616e", code: "#2f5d8a",
        text: "#6b7480", audio: "#c1457d", video: "#c1457d"
    })
    readonly property var kinds: ({
        pdf: "pdf", doc: "doc", docx: "doc", odt: "doc", rtf: "doc",
        xls: "sheet", xlsx: "sheet", ods: "sheet", csv: "sheet",
        ppt: "slides", pptx: "slides", odp: "slides", key: "slides",
        png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", heic: "image", svg: "image", avif: "image",
        zip: "archive", tar: "archive", gz: "archive", xz: "archive", zst: "archive", "7z": "archive", rar: "archive",
        rpm: "installer", flatpakref: "installer", appimage: "installer", dmg: "installer", exe: "installer", msi: "installer", deb: "installer",
        js: "code", ts: "code", py: "code", rs: "code", c: "code", h: "code", cpp: "code", go: "code", java: "code",
        sh: "code", json: "code", toml: "code", yaml: "code", yml: "code", html: "code", css: "code", qml: "code",
        mp3: "audio", wav: "audio", flac: "audio", ogg: "audio", m4a: "audio",
        mp4: "video", mov: "video", mkv: "video", webm: "video"
    })
    readonly property var plural: ({ folder: "folders", pdf: "PDFs", doc: "docs", sheet: "sheets", slides: "slides",
        image: "images", archive: "archives", installer: "installers", code: "code files", text: "text files",
        audio: "audio files", video: "videos" })

    property var segments: []
    property int total: 0
    property string newestPicture: ""
    property bool hovered: mouse.containsMouse || activeFocus

    FolderListModel {
        id: files
        folder: "file://" + disc.path
        showDirs: true
        showDotAndDotDot: false
        showHidden: false
        sortField: FolderListModel.Time
        onStatusChanged: disc.recount()
        onCountChanged: disc.recount()
    }

    function recount() {
        if (files.status !== FolderListModel.Ready) return;
        const counts = {};
        let pic = "";
        for (let i = 0; i < files.count; i++) {
            const kind = files.get(i, "fileIsDir") ? "folder" : (kinds[String(files.get(i, "fileSuffix")).toLowerCase()] || "text");
            counts[kind] = (counts[kind] || 0) + 1;
            if (!pic && kind === "image") pic = String(files.get(i, "fileUrl"));
        }
        segments = Object.keys(counts).map(k => ({ kind: k, n: counts[k] })).sort((a, b) => b.n - a.n);
        total = files.count;
        newestPicture = pic;

    }

    function summary() {
        if (!total) return "Empty";
        return segments.slice(0, 3).map(g => g.n + " " + (g.n === 1 ? plural[g.kind].replace(/s$/, "") : plural[g.kind])).join(", ");
    }

    // the folder: the SIOS folder for this kind (ui/make-folders.py, owner's pick
    // 2026-10-14), lifting a little under the pointer
    Item {
        id: body
        width: 74
        height: 74
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: 6
        Image {
            anchors.fill: parent
            sourceSize: Qt.size(148, 148)
            source: Qt.resolvedUrl("../images/" + (disc.emblem || "folder") + ".svg")
            smooth: true
            scale: disc.hovered ? 1.06 : 1.0
            Behavior on scale { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }
        }
    }

    Text {
        id: title
        anchors.top: body.bottom
        anchors.topMargin: 6
        anchors.horizontalCenter: parent.horizontalCenter
        textFormat: Text.PlainText
        text: disc.label
        color: "white"
        font.family: "Instrument Sans"
        font.pixelSize: 13
        font.weight: Font.DemiBold
        style: Text.Raised
        styleColor: Qt.rgba(0, 0, 0, 0.35)
    }
    Text {
        anchors.top: title.bottom
        anchors.horizontalCenter: parent.horizontalCenter
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        elide: Text.ElideRight
        textFormat: Text.PlainText
        text: disc.hovered ? disc.summary() : disc.total + (disc.total === 1 ? " item" : " items")
        color: Qt.rgba(1, 1, 1, 0.85)
        font.family: "Instrument Sans"
        font.pixelSize: 12
        opacity: 0.95
        style: Text.Raised
        styleColor: Qt.rgba(0, 0, 0, 0.35)
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onDoubleClicked: disc.open()
    }
    Keys.onReturnPressed: disc.open()
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: label + ": " + summary()
}
