// A folder as a disc, like the preview's FolderDisc (icons/FolderDisc.tsx),
// in its "inside a window" look: the outer ring shows what kinds of files are
// inside (sized by how many), the inner ring turns amber for the share that
// came from the web, and the core carries the folder's emblem.
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

            // body and rim
            const g = c.createRadialGradient(50, 38, 0, 50, 38, 65);
            g.addColorStop(0, String(Theme.surface));
            g.addColorStop(1, String(Theme.surface3));
            c.fillStyle = g;
            c.beginPath(); c.arc(50, 50, 48, 0, TAU); c.fill();
            c.strokeStyle = String(Theme.line); c.lineWidth = 1;
            c.beginPath(); c.arc(50, 50, 48, 0, TAU); c.stroke();

            // outer ring: what's inside
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
                c.strokeStyle = seg.kind === "folder" ? "#dfe4ec" : (Theme.kindColor[seg.kind] || "#6b7480");
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

            // core
            const core = c.createRadialGradient(50, 42, 0, 50, 42, 23);
            core.addColorStop(0, Theme.dark ? "#3a3f45" : "#ffffff");
            core.addColorStop(1, Theme.dark ? "#2c3034" : "#eef1f6");
            c.fillStyle = core;
            c.beginPath(); c.arc(50, 50, 19, 0, TAU); c.fill();
            c.strokeStyle = String(Theme.line); c.lineWidth = 0.8;
            c.stroke();
        }
    }

    Icon {
        anchors.centerIn: parent
        name: disc.emblem
        size: Math.max(10, Math.round(disc.size * 0.2))
        color: Theme.dark ? "#c9ced6" : "#4a5568"
    }
}
