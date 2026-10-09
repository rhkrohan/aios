"use client";

import { useEffect, useRef } from "react";

/**
 * The SIOS orb: a ball of thin luminous strings. Each strand is a closed loop
 * whose radius wobbles with two sine waves, rotated around the centre, so
 * together they weave a sphere. A few strands reach past the edge as loose
 * filaments. Calm when idle; faster and wilder while the assistant works.
 */
export function StringOrb({ size = 72, busy = false, strands = 24 }: { size?: number; busy?: boolean; strands?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const c = size / 2;
    const R = size * 0.36;
    // fixed per-strand personality, so the weave is stable across frames
    const seeds = Array.from({ length: strands }, (_, i) => ({
      tilt: (i / strands) * Math.PI,
      phase: i * 2.399, // golden angle spreads them evenly
      reach: i % 6 === 0 ? 0.34 : i % 4 === 0 ? 0.16 : 0.05, // a few loose filaments
      hue: i / strands,
      // Each strand gets its own size. sqrt spreads them evenly by area, so the
      // ball is filled through the middle instead of crowding at the rim.
      // Shuffled (i * 7) so size isn't tied to tilt.
      base: Math.sqrt((((i * 7) % strands) + 0.5) / strands),
    }));

    let energy = busyRef.current ? 1 : 0;
    let t = 0;
    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      energy += ((busyRef.current ? 1 : 0) - energy) * Math.min(1, dt * 3);
      t += dt * (0.35 + energy * 1.1);

      ctx.clearRect(0, 0, size, size);

      // soft core glow
      const glow = ctx.createRadialGradient(c, c, 0, c, c, R * 1.25);
      glow.addColorStop(0, `rgba(170, 160, 255, ${0.55 + energy * 0.25})`);
      glow.addColorStop(0.45, "rgba(90, 110, 255, 0.22)");
      glow.addColorStop(1, "rgba(90, 110, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c, c, R * 1.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(0.6, size / 140);
      for (const s of seeds) {
        const amp = 0.05 + s.reach * (0.6 + energy * 0.7) + energy * 0.04;
        const grad = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
        grad.addColorStop(0, `hsla(${195 + s.hue * 30}, 95%, 72%, ${0.5 + energy * 0.2})`);
        grad.addColorStop(0.5, `hsla(${232 + s.hue * 20}, 90%, 66%, ${0.55 + energy * 0.2})`);
        grad.addColorStop(1, `hsla(${268 + s.hue * 18}, 85%, 70%, ${0.45 + energy * 0.2})`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        const steps = 72;
        for (let k = 0; k <= steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const wobble = Math.sin(3 * a + s.phase + t) * amp + Math.sin(2 * a - s.phase * 1.3 - t * 0.8) * amp * 0.35;
          const r = R * (0.16 + 0.82 * s.base + wobble * (0.45 + 0.55 * s.base));
          // squash into an ellipse and rotate: many tilted ellipses read as a sphere
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r * (0.35 + 0.65 * Math.abs(Math.cos(s.tilt + t * 0.15)));
          const rot = s.tilt + t * 0.2;
          const px = c + x * Math.cos(rot) - y * Math.sin(rot);
          const py = c + x * Math.sin(rot) + y * Math.cos(rot);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      // bright centre
      const core = ctx.createRadialGradient(c, c, 0, c, c, R * 0.35);
      core.addColorStop(0, "rgba(255,255,255,0.85)");
      core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(c, c, R * 0.35, 0, Math.PI * 2);
      ctx.fill();

      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, strands]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden className="shrink-0" />;
}
