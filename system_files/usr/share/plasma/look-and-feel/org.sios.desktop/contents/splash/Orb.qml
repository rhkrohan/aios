/*
    The SIOS orb, ported from the preview's StringOrb.tsx: a ball of thin
    luminous strings. Each strand is a closed loop whose radius wobbles with two
    sine waves, squashed and rotated; together they weave a sphere. It drifts
    slowly, and livens up under the pointer. About 20 frames a second, so it
    stays cheap even without a GPU.
    SPDX-License-Identifier: GPL-2.0-or-later
*/

import QtQuick


Canvas {
    id: orb
    property int strands: 16
    property bool lively: false
    Component.onCompleted: requestPaint()
    property real t: 0
    // KDE's animation speed set to Instant means reduced motion: draw one still frame
    readonly property bool still: false
    onStillChanged: requestPaint()
    property real live: lively ? 1 : 0
    Behavior on live { NumberAnimation { duration: 400 } }

    readonly property var seeds: {
        const out = [];
        for (let i = 0; i < strands; i++) out.push({
            tilt: i / strands * Math.PI,
            phase: i * 2.399,
            reach: i % 6 === 0 ? 0.34 : i % 4 === 0 ? 0.16 : 0.05,
            hue: i / strands,
            base: Math.sqrt((((i * 7) % strands) + 0.5) / strands)
        });
        return out;
    }

    Timer {
        interval: 50
        repeat: true
        running: orb.visible && !orb.still
        onTriggered: { orb.t += 0.05 * (0.35 + orb.live * 0.75); orb.requestPaint(); }
    }

    function hsla(h, s, l, a) { return Qt.hsla((h % 360) / 360, s / 100, l / 100, a); }

    onPaint: {
        const ctx = getContext("2d");
        const size = width;
        const c = size / 2;
        const R = size * 0.36;
        const breathe = 1 + live * 0.05 * Math.sin(t * 1.3);
        ctx.reset();

        const glow = ctx.createRadialGradient(c, c, 0, c, c, R * 1.25);
        glow.addColorStop(0, "rgba(170,160,255,0.55)");
        glow.addColorStop(0.45, "rgba(90,110,255,0.22)");
        glow.addColorStop(1, "rgba(90,110,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(c, c, R * 1.25, 0, Math.PI * 2); ctx.fill();

        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = Math.max(0.6, size / 140);
        for (const s of seeds) {
            const amp = 0.05 + live * 0.07 + s.reach * (0.6 + live * 0.5);
            const grad = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
            grad.addColorStop(0, hsla(195 + s.hue * 30, 95, 72, 0.5));
            grad.addColorStop(0.5, hsla(232 + s.hue * 20, 90, 66, 0.55));
            grad.addColorStop(1, hsla(268 + s.hue * 18, 85, 70, 0.45));
            ctx.strokeStyle = grad;
            ctx.beginPath();
            const steps = 48;
            const rot = s.tilt + t * (0.2 + live * 0.15);
            const squash = 0.35 + 0.65 * Math.abs(Math.cos(s.tilt + t * 0.15));
            for (let k = 0; k <= steps; k++) {
                const a = k / steps * Math.PI * 2;
                const wobble = Math.sin(3 * a + s.phase + t) * amp + Math.sin(2 * a - s.phase * 1.3 - t * 0.8) * amp * 0.35;
                const r = R * breathe * (0.16 + 0.82 * s.base + wobble * (0.45 + 0.55 * s.base));
                const x = Math.cos(a) * r;
                const y = Math.sin(a) * r * squash;
                const px = c + x * Math.cos(rot) - y * Math.sin(rot);
                const py = c + x * Math.sin(rot) + y * Math.cos(rot);
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";

        const core = ctx.createRadialGradient(c, c, 0, c, c, R * 0.35);
        core.addColorStop(0, "rgba(255,255,255,0.85)");
        core.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(c, c, R * 0.35, 0, Math.PI * 2); ctx.fill();
    }
}
