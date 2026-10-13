/*
    One folder as a disc, like the preview's FolderDisc
    (build_concept_html/src/components/icons/FolderDisc.tsx):
      outer ring  what kinds of files are inside, sized by how many
      core        the folder's emblem, or a photo for Pictures
    The rings come from the real folder, read with FolderListModel.
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
        ring.requestPaint();
    }

    function summary() {
        if (!total) return "Empty";
        return segments.slice(0, 3).map(g => g.n + " " + (g.n === 1 ? plural[g.kind].replace(/s$/, "") : plural[g.kind])).join(", ");
    }

    // the disc
    Item {
        id: body
        width: 74
        height: 74
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: 6

        Canvas {
            id: ring
            anchors.fill: parent
            antialiasing: true
            renderStrategy: Canvas.Cooperative
            property real grow: disc.hovered ? 1.03 : 1.0
            Behavior on grow { NumberAnimation { duration: 350; easing.type: Easing.OutCubic } }
            onGrowChanged: requestPaint()
            readonly property string photoUrl: disc.photo ? (disc.newestPicture || "file:///usr/share/wallpapers/SIOS-Lake/contents/images/2880x1920.jpg") : ""
            property bool photoReady: false
            onPhotoUrlChanged: { photoReady = false; if (photoUrl) loadImage(photoUrl); }
            onImageLoaded: { photoReady = true; requestPaint(); }
            Component.onCompleted: if (photoUrl) loadImage(photoUrl)

            onPaint: {
                const ctx = getContext("2d");
                const k = width / 100;
                ctx.reset();
                ctx.scale(k, k);
                const TAU = Math.PI * 2;

                const arc = (r, a0, a1) => ctx.arc(50, 50, r, a0 - Math.PI / 2, a1 - Math.PI / 2, false);

                // the preview's FolderDisc, layer by layer (FolderDisc.tsx, tone
                // "glass"). Its frosted blur needs a GPU, so the glass here is a
                // light wash over the wallpaper plus the same soft drop shadow.
                const sh = ctx.createRadialGradient(50, 63, 28, 50, 63, 54);
                sh.addColorStop(0, "rgba(10,20,40,0.5)");
                sh.addColorStop(1, "rgba(10,20,40,0)");
                ctx.fillStyle = sh;
                ctx.beginPath(); ctx.arc(50, 63, 54, 0, TAU); ctx.fill();

                // body: clear glass lit from the top
                const body = ctx.createRadialGradient(50, 38, 0, 50, 38, 65);
                body.addColorStop(0, "rgba(236,242,255,0.52)");
                body.addColorStop(1, "rgba(214,224,246,0.30)");
                ctx.fillStyle = body;
                ctx.beginPath(); ctx.arc(50, 50, 48, 0, TAU); ctx.fill();
                // rim: white, with a faint dark line just under it
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgba(10,20,40,0.18)";
                ctx.beginPath(); ctx.arc(50, 51, 48, 0, TAU); ctx.stroke();
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = "rgba(255,255,255,0.7)";
                ctx.beginPath(); ctx.arc(50, 50, 48, 0, TAU); ctx.stroke();

                // outer ring: what's inside, one colour per kind (folders white)
                ctx.save();
                ctx.translate(50, 50); ctx.scale(grow, grow); ctx.translate(-50, -50);
                ctx.lineWidth = 6;
                ctx.strokeStyle = "rgba(255,255,255,0.3)";
                ctx.beginPath(); ctx.arc(50, 50, 41, 0, TAU); ctx.stroke();
                const segs = disc.segments;
                const gap = segs.length > 1 ? 0.07 : 0;
                ctx.lineCap = segs.length > 1 ? "round" : "butt";
                for (const pass of disc.hovered ? ["glow", "ring"] : ["ring"]) {
                    let start = 0;
                    for (const sg of segs) {
                        const span = sg.n / Math.max(1, disc.total) * TAU;
                        ctx.strokeStyle = disc.colors[sg.kind];
                        // hovered: a soft halo under each segment (the preview's glow)
                        ctx.lineWidth = pass === "glow" ? 11 : 6;
                        ctx.globalAlpha = pass === "glow" ? 0.22 : (disc.hovered ? 1 : 0.88);
                        ctx.beginPath();
                        if (span >= TAU - 1e-3) ctx.arc(50, 50, 41, 0, TAU);
                        else arc(41, start + gap / 2, start + span - gap / 2);
                        ctx.stroke();
                        start += span;
                    }
                }
                ctx.globalAlpha = 1;
                ctx.restore();

                // groove, then the inner ring
                ctx.lineWidth = 0.6;
                ctx.strokeStyle = "rgba(255,255,255,0.5)";
                ctx.beginPath(); ctx.arc(50, 50, 34.5, 0, TAU); ctx.stroke();
                ctx.save();
                const shrink = disc.hovered ? 0.97 : 1;
                ctx.translate(50, 50); ctx.scale(shrink, shrink); ctx.translate(-50, -50);
                ctx.lineWidth = 2.2;
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.beginPath(); ctx.arc(50, 50, 29, 0, TAU); ctx.stroke();
                ctx.restore();

                // core: a soft shadow so it sits above the glass, then white
                const cs = ctx.createRadialGradient(50, 51.5, 14, 50, 51.5, 24);
                cs.addColorStop(0, "rgba(10,20,40,0.2)");
                cs.addColorStop(1, "rgba(10,20,40,0)");
                ctx.fillStyle = cs;
                ctx.beginPath(); ctx.arc(50, 51.5, 24, 0, TAU); ctx.fill();
                const c = ctx.createRadialGradient(50, 40, 0, 50, 40, 22.8);
                c.addColorStop(0, "#ffffff");
                c.addColorStop(1, "#f4f7fb");
                ctx.fillStyle = c;
                ctx.beginPath(); ctx.arc(50, 50, 19, 0, TAU); ctx.fill();
                if (photoUrl && isImageLoaded(photoUrl)) {
                    ctx.save();
                    ctx.beginPath(); ctx.arc(50, 50, 19, 0, TAU); ctx.clip();
                    ctx.drawImage(photoUrl, 31, 31, 38, 38);
                    ctx.restore();
                }
                ctx.lineWidth = 0.8;
                ctx.strokeStyle = "#ffffff";
                ctx.beginPath(); ctx.arc(50, 50, 19, 0, TAU); ctx.stroke();
            }
        }

        Image {
            visible: !disc.photo || !ring.photoReady
            anchors.centerIn: parent
            width: 15
            height: 15
            sourceSize: Qt.size(45, 45)
            source: Qt.resolvedUrl("../images/" + disc.emblem + ".svg")
        }
    }

    Text {
        id: title
        anchors.top: body.bottom
        anchors.topMargin: 6
        anchors.horizontalCenter: parent.horizontalCenter
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
