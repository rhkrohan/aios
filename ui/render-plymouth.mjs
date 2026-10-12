// The SIOS boot screen pieces for the Plymouth script theme, drawn from the
// preview's own code (StringOrb.tsx and Power.tsx BootScreen):
//   orb-00..47.png   the busy string orb, played forward then back so it loops smoothly
//   wordmark.png     "SIOS" in Jost ExtraLight, wide tracking
//   track.png, fill.png   the progress bar (white 10%; light blue to violet)
//   caption-*.png    the line under the bar
// Run: node <browser-automation>/browser.mjs about:blank --script ui/render-plymouth.mjs
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url).pathname;
const out = `${root}system_files/usr/share/plymouth/themes/sios/`;
const font = (f) => readFileSync(`${root}system_files/usr/share/fonts/sios/${f}`).toString("base64");
const FRAMES = 48, SIZE = 240, ORB = 170;

export default async function run(page) {
  await page.setViewportSize({ width: 800, height: 400 });
  await page.setContent(`<html><head><style>
    @font-face { font-family: Jost; src: url(data:font/ttf;base64,${font("Jost[wght].ttf")}); font-weight: 100 900; }
    @font-face { font-family: Inst; src: url(data:font/ttf;base64,${font("InstrumentSans[wdth,wght].ttf")}); font-weight: 100 900; }
    body { margin: 0; background: transparent; }
  </style></head><body><canvas id="c"></canvas></body></html>`);
  await page.evaluate(() => document.fonts.load("200 44px Jost").then(() => document.fonts.load("400 13px Inst")));

  const png = async (fn, w, h) => {
    const data = await page.evaluate(({ src, w, h }) => {
      const c = document.getElementById("c");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      new Function("ctx", "w", "h", src)(ctx, w, h);
      return c.toDataURL("image/png").split(",")[1];
    }, { src: fn, w, h });
    return Buffer.from(data, "base64");
  };

  // the orb, as in StringOrb.tsx with busy = true (energy 1)
  const orbSrc = (t) => `
    const size = ${ORB}, strands = 24, ox = (w - size) / 2, oy = (h - size) / 2;
    const c = size / 2, R = size * 0.36, energy = 1, live = 0, breathe = 1, t = ${t};
    ctx.translate(ox, oy);
    const seeds = Array.from({ length: strands }, (_, i) => ({ tilt: (i / strands) * Math.PI, phase: i * 2.399,
      reach: i % 6 === 0 ? 0.34 : i % 4 === 0 ? 0.16 : 0.05, hue: i / strands, base: Math.sqrt((((i * 7) % strands) + 0.5) / strands) }));
    const glow = ctx.createRadialGradient(c, c, 0, c, c, R * 1.25);
    glow.addColorStop(0, "rgba(170,160,255," + (0.55 + energy * 0.25) + ")");
    glow.addColorStop(0.45, "rgba(90,110,255,0.22)");
    glow.addColorStop(1, "rgba(90,110,255,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(c, c, R * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(0.6, size / 140);
    for (const s of seeds) {
      const amp = 0.05 + live * 0.07 + s.reach * (0.6 + live * 0.5 + energy * 0.7) + energy * 0.04;
      const grad = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
      grad.addColorStop(0, "hsla(" + (195 + s.hue * 30) + ",95%,72%," + (0.5 + energy * 0.2) + ")");
      grad.addColorStop(0.5, "hsla(" + (232 + s.hue * 20) + ",90%,66%," + (0.55 + energy * 0.2) + ")");
      grad.addColorStop(1, "hsla(" + (268 + s.hue * 18) + ",85%,70%," + (0.45 + energy * 0.2) + ")");
      ctx.strokeStyle = grad; ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const wobble = Math.sin(3 * a + s.phase + t) * amp + Math.sin(2 * a - s.phase * 1.3 - t * 0.8) * amp * 0.35;
        const r = R * breathe * (0.16 + 0.82 * s.base + wobble * (0.45 + 0.55 * s.base));
        const x = Math.cos(a) * r, y = Math.sin(a) * r * (0.35 + 0.65 * Math.abs(Math.cos(s.tilt + t * 0.15)));
        const rot = s.tilt + t * (0.2 + live * 0.15);
        const px = c + x * Math.cos(rot) - y * Math.sin(rot), py = c + x * Math.sin(rot) + y * Math.cos(rot);
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    const core = ctx.createRadialGradient(c, c, 0, c, c, R * 0.35);
    core.addColorStop(0, "rgba(255,255,255,0.85)"); core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(c, c, R * 0.35, 0, Math.PI * 2); ctx.fill();`;
  // busy speed is about 1.45 per second; 48 frames over ~1.9 s, played forward then back
  for (let i = 0; i < FRAMES; i++) writeFileSync(`${out}orb-${String(i).padStart(2, "0")}.png`, await png(orbSrc(i * 0.06), SIZE, SIZE));

  writeFileSync(`${out}wordmark.png`, await png(`
    ctx.fillStyle = "#ffffff"; ctx.font = "200 44px Jost"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.letterSpacing = "22px"; ctx.fillText("SIOS", w / 2 + 11, h / 2);`, 360, 70));
  writeFileSync(`${out}track.png`, await png(`
    ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.beginPath(); ctx.roundRect(0, 0, w, h, h / 2); ctx.fill();`, 224, 3));
  writeFileSync(`${out}fill.png`, await png(`
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#7fd0ff"); g.addColorStop(0.5, "#7d9dff"); g.addColorStop(1, "#9b7bff");
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(0, 0, w, h, h / 2); ctx.fill();`, 224, 3));
  for (const [name, text] of [["image", "Checking the system image"], ["desktop", "Getting your desktop ready"], ["shutdown", "Shutting down"], ["restart", "Restarting"], ["update", "Installing an update"]])
    writeFileSync(`${out}caption-${name}.png`, await png(`
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "400 13px Inst"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(${JSON.stringify(text)}, w / 2, h / 2);`, 320, 22));
  return `${FRAMES} orb frames and the rest written`;
}
