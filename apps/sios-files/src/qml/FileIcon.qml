// A file's icon, drawn like the preview's FileIcon (Icons.tsx): a page with a
// folded corner, a hint of what's inside in the kind's colour, and a badge
// with the extension. Pictures show a real thumbnail instead.
import QtQuick

Item {
    id: icon
    property string kind: "text"
    property string ext: ""
    property string location: ""
    property bool thumbnail: kind === "image" || kind === "pdf" || kind === "video"
    property int size: 64
    width: size
    height: size

    readonly property string badge: {
        const e = ext.toUpperCase();
        if (e === "APPIMAGE") return "APP";
        if (e === "GZ") return "TGZ";
        return e.slice(0, 4);
    }

    Canvas {
        id: page
        anchors.fill: parent
        visible: !thumb.visible
        onWidthChanged: requestPaint()
        Component.onCompleted: requestPaint()
        onPaint: {
            const c = getContext("2d");
            const k = width / 64;
            const col = Theme.kindColor[icon.kind] || "#6b7480";
            c.reset();
            c.scale(k, k);
            // shadow, page, fold
            c.fillStyle = "rgba(28,36,48,0.12)";
            roundPage(c, 0, 1.4);
            c.fill();
            const g = c.createLinearGradient(0, 4, 0, 60);
            g.addColorStop(0, "#ffffff");
            g.addColorStop(1, "#f1f3f5");
            c.fillStyle = g;
            roundPage(c, 0, 0);
            c.fill();
            c.strokeStyle = "rgba(28,36,48,0.10)";
            c.lineWidth = 0.8;
            c.stroke();
            c.fillStyle = "#dde2e8";
            c.beginPath(); c.moveTo(39.5, 4); c.lineTo(39.5, 12.5); c.quadraticCurveTo(39.5, 16.5, 43.5, 16.5); c.lineTo(52, 16.5); c.closePath(); c.fill();

            c.lineCap = "round";
            const k2 = icon.kind;
            if (k2 === "image") {
                const sky = c.createLinearGradient(0, 19, 0, 41);
                sky.addColorStop(0, "#9cc4ea"); sky.addColorStop(1, "#f3d9b1");
                c.fillStyle = sky; c.fillRect(15, 19, 32, 22);
                c.fillStyle = "#fff6dc"; c.beginPath(); c.arc(39, 25, 3, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 0.85; c.fillStyle = col;
                c.beginPath(); c.moveTo(15, 37.5); c.lineTo(23.5, 29); c.lineTo(29.5, 35); c.lineTo(33.5, 31.5); c.lineTo(47, 40); c.lineTo(47, 41); c.lineTo(15, 41); c.closePath(); c.fill();
                c.globalAlpha = 1;
            } else if (k2 === "pdf" || k2 === "doc" || k2 === "text") {
                c.strokeStyle = k2 === "text" ? "#aab2bc" : col;
                c.globalAlpha = k2 === "text" ? 1 : 0.55;
                c.lineWidth = 2.4;
                for (const [y, w] of [[20, 18], [26, 26], [32, 26], [38, 16]]) { c.beginPath(); c.moveTo(17, y); c.lineTo(17 + w, y); c.stroke(); }
                c.globalAlpha = 1;
            } else if (k2 === "sheet") {
                c.globalAlpha = 0.12; c.fillStyle = col; c.fillRect(16, 18, 30, 22); c.globalAlpha = 0.6;
                c.strokeStyle = col; c.lineWidth = 1.4; c.strokeRect(16, 18, 30, 22);
                for (const y of [25.3, 32.6]) { c.beginPath(); c.moveTo(16, y); c.lineTo(46, y); c.stroke(); }
                for (const x of [26, 36]) { c.beginPath(); c.moveTo(x, 18); c.lineTo(x, 40); c.stroke(); }
                c.globalAlpha = 1;
            } else if (k2 === "slides") {
                c.globalAlpha = 0.18; c.fillStyle = col; c.fillRect(16, 19, 30, 20); c.globalAlpha = 1;
                c.strokeStyle = col; c.lineWidth = 2.4;
                c.beginPath(); c.moveTo(21, 33); c.lineTo(29, 33); c.moveTo(21, 28); c.lineTo(35, 28); c.stroke();
            } else if (k2 === "code") {
                c.strokeStyle = col; c.lineWidth = 2.6; c.lineJoin = "round";
                c.beginPath(); c.moveTo(24, 23); c.lineTo(18, 29); c.lineTo(24, 35); c.moveTo(38, 23); c.lineTo(44, 29); c.lineTo(38, 35); c.moveTo(33, 20); c.lineTo(29, 38); c.stroke();
            } else if (k2 === "archive") {
                c.globalAlpha = 0.25; c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.moveTo(31, 4); c.lineTo(31, 40); c.stroke(); c.globalAlpha = 1;
                c.lineWidth = 2.2; for (const y of [8, 14, 20, 26]) { c.beginPath(); c.moveTo(28.5, y); c.lineTo(33.5, y); c.stroke(); }
                c.fillStyle = col; c.fillRect(27.5, 29, 7, 9);
            } else if (k2 === "installer") {
                c.strokeStyle = col; c.lineWidth = 2.2; c.lineJoin = "round"; c.globalAlpha = 0.12; c.fillStyle = col;
                c.beginPath(); c.moveTo(31, 17); c.lineTo(43, 23); c.lineTo(43, 35); c.lineTo(31, 41); c.lineTo(19, 35); c.lineTo(19, 23); c.closePath(); c.fill();
                c.globalAlpha = 1; c.stroke();
                c.beginPath(); c.moveTo(19, 23); c.lineTo(31, 29); c.lineTo(43, 23); c.moveTo(31, 29); c.lineTo(31, 41); c.stroke();
            } else if (k2 === "audio" || k2 === "video") {
                c.strokeStyle = col; c.lineWidth = 2.6;
                for (const [x, y0, y1] of [[17, 29, 33], [22, 24, 38], [27, 20, 42], [32, 26, 36], [37, 22, 40], [42, 29, 33]]) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
            }

            // the extension badge
            if (icon.badge) {
                const w = Math.max(22, icon.badge.length * 6.6 + 9);
                c.fillStyle = col;
                roundRect(c, 7, 43.5, w, 12.5, 3.5); c.fill();
                c.fillStyle = "#ffffff";
                c.font = "bold 8.6px 'Instrument Sans'";
                c.textAlign = "center";
                c.fillText(icon.badge, 7 + w / 2, 52.6);
            }
        }
        function roundPage(c, dx, dy) {
            c.beginPath();
            c.moveTo(15 + dx, 4 + dy); c.lineTo(39.5 + dx, 4 + dy); c.lineTo(52 + dx, 16.5 + dy); c.lineTo(52 + dx, 55 + dy);
            c.quadraticCurveTo(52 + dx, 60 + dy, 47 + dx, 60 + dy); c.lineTo(15 + dx, 60 + dy);
            c.quadraticCurveTo(10 + dx, 60 + dy, 10 + dx, 55 + dy); c.lineTo(10 + dx, 9 + dy);
            c.quadraticCurveTo(10 + dx, 4 + dy, 15 + dx, 4 + dy); c.closePath();
        }
        function roundRect(c, x, y, w, h, r) {
            c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
        }
    }

    // a real picture when there is one (KDE's thumbnails)
    Image {
        id: thumb
        anchors.centerIn: parent
        width: parent.width * 0.86
        height: parent.height * 0.86
        visible: icon.thumbnail && status === Image.Ready && implicitWidth > 1
        source: icon.thumbnail && icon.location ? "image://thumb/" + encodeURIComponent(icon.location) : ""
        sourceSize: Qt.size(icon.size * 2, icon.size * 2)
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        cache: true
    }
}
