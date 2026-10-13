// A folder as a disc, like the preview's FolderDisc inside a window (tone
// "surface", icons/FolderDisc.tsx): the outer ring shows what kinds of files
// are inside (sized by how many, folders near-white), the inner ring turns
// amber for the share that came from the web, and the core carries the
// folder's emblem.
import QtQuick

Item {
    id: disc
    property string name
    property var stats: ({ total: 0, segments: [], untrusted: 0 })
    property bool open: false   // hovered or selected: rings lift a little
    property int size: 64
    width: size
    height: size

    readonly property string emblem: ({
        projects: "code-xml", documents: "file-text", downloads: "download", pictures: "image",
        screenshots: "image", images: "image", photos: "image"
    })[name.toLowerCase()] || "folder"

    // the preview's colours per kind; folders near-white so they show on the surface
    readonly property var colors: ({
        folder: Theme.dark ? "#c9d0dc" : "#dfe4ec", pdf: "#d4524b", doc: "#3b74bf", sheet: "#2e8d5c", slides: "#dc7637",
        image: "#7b62c4", archive: "#8b7652", installer: "#56616e", code: "#2f5d8a",
        text: "#6b7480", audio: "#c1457d", video: "#c1457d"
    })

    onStatsChanged: ring.requestPaint()
    onOpenChanged: ring.requestPaint()

    Canvas {
        id: ring
        anchors.fill: parent
        onWidthChanged: requestPaint()
        Component.onCompleted: requestPaint()
        onPaint: {
            const c = getContext("2d");
            const k = width / 100;
            const TAU = Math.PI * 2;
            c.reset();
            c.scale(k, k);
            const arc = (r, a0, a1) => c.arc(50, 50, r, a0 - Math.PI / 2, a1 - Math.PI / 2, false);

            // body: the window's surface, lit from the top, with a hairline rim
            const g = c.createRadialGradient(50, 38, 0, 50, 38, 65);
            g.addColorStop(0, String(Theme.surface));
            g.addColorStop(1, String(Theme.surface3));
            c.fillStyle = g;
            c.beginPath(); c.arc(50, 50, 48, 0, TAU); c.fill();
            c.strokeStyle = String(Theme.line); c.lineWidth = 1;
            c.beginPath(); c.arc(50, 50, 48, 0, TAU); c.stroke();

            // outer ring: what's inside (white for folders, the kind's colour for files)
            const s = disc.stats || { total: 0, segments: [] };
            const total = Math.max(1, s.total || 0);
            const segs = s.segments || [];
            c.save();
            const grow = disc.open ? 1.03 : 1;
            c.translate(50, 50); c.scale(grow, grow); c.translate(-50, -50);
            c.lineWidth = 6;
            c.strokeStyle = String(Theme.surface3);
            c.beginPath(); c.arc(50, 50, 41, 0, TAU); c.stroke();
            const gap = segs.length > 1 ? 0.07 : 0;
            c.lineCap = segs.length > 1 ? "round" : "butt";
            let start = 0;
            for (const seg of segs) {
                const span = seg.n / total * TAU;
                c.globalAlpha = disc.open ? 1 : 0.88;
                c.strokeStyle = disc.colors[seg.kind] || disc.colors.text;
                c.beginPath();
                if (span >= TAU - 1e-3) c.arc(50, 50, 41, 0, TAU); else arc(41, start + gap / 2, start + span - gap / 2);
                c.stroke();
                start += span;
            }
            c.globalAlpha = 1;
            c.restore();

            // groove, inner ring and the share from the web
            c.strokeStyle = String(Theme.line); c.lineWidth = 0.6;
            c.beginPath(); c.arc(50, 50, 34.5, 0, TAU); c.stroke();
            c.strokeStyle = String(Theme.surface3); c.lineWidth = 2.2;
            c.beginPath(); c.arc(50, 50, 29, 0, TAU); c.stroke();
            if ((s.untrusted || 0) > 0) {
                c.strokeStyle = "#e0a03a"; c.lineCap = "round";
                c.beginPath(); arc(29, 0, Math.min(s.untrusted / total * TAU, TAU - 0.001)); c.stroke();
            }

            // core: a white button with a soft shadow, so it sits above the glass
            const core = c.createRadialGradient(50, 40, 0, 50, 40, 22.8);
            core.addColorStop(0, "#ffffff");
            core.addColorStop(1, "#eef1f6");
            c.fillStyle = core;
            c.beginPath(); c.arc(50, 50, 19, 0, TAU); c.fill();
            c.strokeStyle = String(Theme.line); c.lineWidth = 0.8;
            c.beginPath(); c.arc(50, 50, 19, 0, TAU); c.stroke();
        }
    }

    Icon {
        anchors.centerIn: parent
        name: disc.emblem
        size: Math.max(10, Math.round(disc.size * 0.2))
        color: "#4a5568"
    }
}
