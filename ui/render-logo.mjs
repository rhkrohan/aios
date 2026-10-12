// The SIOS logo: the Tron disc (the same geometry as the preview's FolderDisc,
// build_concept_html/src/components/icons/FolderDisc.tsx). Writes every place
// the mark appears on the image:
//   hicolor apps: sios-logo, sios-logo-symbolic, sios-start (top bar),
//                 start-here, distributor-logo(-symbolic), sios-files (Files app)
// Run: node ui/render-logo.mjs   (PNG copies: ui/render-logo-png.mjs)
import { mkdirSync, writeFileSync } from "node:fs";

const root = new URL("../system_files/usr/share/icons/hicolor/", import.meta.url).pathname;
const TAU = Math.PI * 2;

function arc(r, a0, a1) {
  const p = (a) => [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

// the outer ring: four kinds of things, like a folder holding a life's work
const SEGMENTS = [
  { share: 0.38, color: "#4f7bf7" }, // the assistant blue
  { share: 0.24, color: "#7b62c4" },
  { share: 0.2, color: "#2e8d5c" },
  { share: 0.18, color: "#dc7637" },
];
function ring(colorOf, gap = 0.16) {
  let start = 0;
  return SEGMENTS.map((s, i) => {
    const span = s.share * TAU;
    const d = arc(41, start + gap / 2, start + span - gap / 2);
    start += span;
    return `<path d="${d}" fill="none" stroke="${colorOf(s, i)}" stroke-width="7" stroke-linecap="round"/>`;
  }).join("");
}

/** The colour disc, on a light glass body, with "SIOS" in the core (or a plain core). */
export function discColor({ word = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<defs>
<radialGradient id="body" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9edf3"/></radialGradient>
<radialGradient id="core" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef1f6"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4f7bf7" stop-opacity=".9"/><stop offset="1" stop-color="#4f7bf7" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="50" cy="51.5" r="48" fill="#14181e" opacity=".12"/>
<circle cx="50" cy="50" r="48" fill="url(#body)" stroke="#d9dee5" stroke-width="1"/>
<circle cx="50" cy="50" r="41" fill="none" stroke="#e4e8ee" stroke-width="7"/>
${ring((s) => s.color)}
<circle cx="50" cy="50" r="33.5" fill="none" stroke="#d9dee5" stroke-width=".8"/>
<circle cx="50" cy="50" r="29.5" fill="none" stroke="#e4e8ee" stroke-width="2.4"/>
<path d="${arc(29.5, -0.9, 0.9)}" fill="none" stroke="#e0a03a" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="50" cy="50" r="23" fill="url(#core)" stroke="#d9dee5" stroke-width="1"/>
${word
    ? `<text x="51" y="53.6" text-anchor="middle" font-family="Jost" font-weight="300" font-size="10.5" letter-spacing="2.2" fill="#1d1d1f">SIOS</text>`
    : `<circle cx="50" cy="50" r="11" fill="url(#glow)" opacity=".55"/><circle cx="50" cy="50" r="4.6" fill="#4f7bf7"/>`}
</svg>
`;
}

/** One colour, for small sizes, the top bar and anywhere KDE recolours icons. */
export function discSymbolic() {
  // wider gaps: at small sizes the rounded ends would close them up
  const segs = ring(() => "currentColor", 0.42).replaceAll('stroke-width="7"', 'stroke-width="11"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 100 100">
<style id="current-color-scheme">.ColorScheme-Text{color:#1d1d1f;}</style>
<g class="ColorScheme-Text">
${segs}
<circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" stroke-width="7"/>
<circle cx="50" cy="50" r="9" fill="currentColor"/>
</g>
</svg>
`;
}

/** The top-bar button: the disc in white on a dark round, like the preview's top bar logo. */
export function discStart() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="11" fill="#111318"/>
<g transform="translate(4.2 4.2) scale(0.156)">
${ring(() => "#ffffff", 0.42).replaceAll('stroke-width="7"', 'stroke-width="10"')}
<circle cx="50" cy="50" r="23" fill="none" stroke="#ffffff" stroke-width="6" opacity=".75"/>
<circle cx="50" cy="50" r="9" fill="#7d9dff"/>
</g>
</svg>
`;
}

function write(rel, svg) {
  const path = root + rel;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, svg);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  write("scalable/apps/sios-logo.svg", discColor());
  write("scalable/apps/distributor-logo.svg", discColor());
  write("scalable/places/start-here.svg", discColor());
  write("scalable/apps/sios-files.svg", discColor({ word: false }));
  write("scalable/apps/sios-start.svg", discStart());
  write("symbolic/apps/sios-logo-symbolic.svg", discSymbolic());
  write("symbolic/apps/distributor-logo-symbolic.svg", discSymbolic());
  console.log("logo written");
}
