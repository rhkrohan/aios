// A folder as a disc, drawn like the desktop's glass discs (a blue glass puck
// with white rings and a white core; icons/FolderDisc.tsx): the outer ring shows what kinds of files are
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

            // the puck: a darker edge underneath gives it depth, like the desktop discs
            c.fillStyle = Theme.dark ? "#1b2233" : "#4c5d86";
            c.beginPath(); c.arc(50, 53.5, 47, 0, TAU); c.fill();
            // glass body: the blue the desktop discs take from the wallpaper
            const g = c.createRadialGradient(50, 34, 4, 50, 50, 52);
            g.addColorStop(0, Theme.dark ? "#5a6c95" : "#a7b6d6");
            g.addColorStop(0.55, Theme.dark ? "#43537a" : "#8394bd");
            g.addColorStop(1, Theme.dark ? "#33405f" : "#6a7ba6");
            c.fillStyle = g;
            c.beginPath(); c.arc(50, 50, 47, 0, TAU); c.fill();
            c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 1.4;
            c.beginPath(); c.arc(50, 50, 47, 0, TAU); c.stroke();

            // outer ring: what's inside (white for folders, the kind's colour for files)
            const s = disc.stats || { total: 0, segments: [] };
            const total = Math.max(1, s.total || 0);
            const segs = s.segments || [];
            c.save();
            const grow = disc.open ? 1.03 : 1;
            c.translate(50, 50); c.scale(grow, grow); c.translate(-50, -50);
            c.lineWidth = 7;
            c.strokeStyle = "rgba(255,255,255,0.32)";
            c.beginPath(); c.arc(50, 50, 40, 0, TAU); c.stroke();
            const gap = segs.length > 1 ? 0.08 : 0;
            c.lineCap = segs.length > 1 ? "round" : "butt";
            let start = 0;
            for (const seg of segs) {
                const span = seg.n / total * TAU;
                c.globalAlpha = disc.open ? 1 : 0.92;
                c.strokeStyle = "#ffffff"; // always white, like the desktop discs
                c.beginPath();
                if (span >= TAU - 1e-3) c.arc(50, 50, 40, 0, TAU); else arc(40, start + gap / 2, start + span - gap / 2);
                c.stroke();
                start += span;
            }
            c.globalAlpha = 1;
            c.restore();

            // groove, inner ring and the share from the web
            c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 0.8;
            c.beginPath(); c.arc(50, 50, 33, 0, TAU); c.stroke();
            c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = 2.6;
            c.beginPath(); c.arc(50, 50, 28, 0, TAU); c.stroke();
            if ((s.untrusted || 0) > 0) {
                c.strokeStyle = "#f0b04a"; c.lineCap = "round";
                c.beginPath(); arc(28, 0, Math.min(s.untrusted / total * TAU, TAU - 0.001)); c.stroke();
            }

            // core: a white button with a soft shadow, so it sits above the glass
            c.fillStyle = "rgba(10,20,40,0.22)";
            c.beginPath(); c.arc(50, 52, 20, 0, TAU); c.fill();
            const core = c.createRadialGradient(50, 42, 0, 50, 42, 24);
            core.addColorStop(0, "#ffffff");
            core.addColorStop(1, "#eef2f8");
            c.fillStyle = core;
            c.beginPath(); c.arc(50, 50, 19.5, 0, TAU); c.fill();
        }
    }

    Icon {
        anchors.centerIn: parent
        name: disc.emblem
        size: Math.max(10, Math.round(disc.size * 0.2))
        color: "#2a3346"
    }
}
