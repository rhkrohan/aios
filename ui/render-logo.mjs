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

/** The disc as a glass puck, like the desktop's folder discs: blue glass,
 *  white rings, a white core, a darker edge for depth. core: "word" (SIOS),
 *  "files" (a folder mark) or "dot" (the assistant's blue light). small: fewer
 *  rings, for 16 to 24 px. */
// each app's glass, so they tell apart at a glance: [light, mid, deep, edge, ink]
const GLASS = {
  word: ["#cfdaf6", "#8fa5e0", "#5a70b8", "#3f5394", "#26314a"],
  files: ["#cfdaf6", "#8fa5e0", "#5a70b8", "#3f5394", "#26314a"],
};

export function discColor({ word = true, core = word ? "word" : "dot", small = false } = {}) {
  const ringW = small ? 12 : 8;
  const [light, mid, deep, edge, ink] = GLASS[core] || GLASS.word;
  const app = core !== "word" && core !== "dot";
  // three even segments, like a Tron identity disc
  const third = TAU / 3, gap = small ? 0.5 : 0.36;
  const segs = [0, 1, 2].map((i) => {
    const a0 = i * third - third / 2 + gap / 2, a1 = i * third + third / 2 - gap / 2;
    return `<path d="${arc(38, a0, a1)}" fill="none" stroke="#ffffff" stroke-width="${ringW}" stroke-linecap="round"/>`;
  }).join("");
  const coreR = small ? (app ? 17 : 14) : core === "word" ? 21.5 : app ? 21 : 17;
  const mark = core === "word"
    ? `<text x="51" y="53.8" text-anchor="middle" font-family="Jost" font-weight="400" font-size="10" letter-spacing="2.1" fill="#26314a">SIOS</text>`
    : core === "files"
      ? `<path d="M41 44.5a2.5 2.5 0 0 1 2.5-2.5h4.2l2.3 2.6h6.5a2.5 2.5 0 0 1 2.5 2.5v8.4a2.5 2.5 0 0 1-2.5 2.5H43.5a2.5 2.5 0 0 1-2.5-2.5z" fill="none" stroke="#26314a" stroke-width="${small ? 3.4 : 2.4}" stroke-linejoin="round"/>`
      : core === "monitor"
        ? `<path d="M40 50.5h4.5l3-7 5 14 3-7H60" fill="none" stroke="#26314a" stroke-width="${small ? 3.4 : 2.4}" stroke-linejoin="round" stroke-linecap="round"/>`
      : core === "settings"
        ? `<g fill="none" stroke="#26314a" stroke-width="${small ? 3.4 : 2.4}" stroke-linecap="round"><path d="M41 46h18M41 54h18"/><circle cx="46" cy="46" r="2.6" fill="#ffffff"/><circle cx="54" cy="54" r="2.6" fill="#ffffff"/></g>`
      : core === "store"
        ? `<g fill="none" stroke="#26314a" stroke-width="${small ? 3.4 : 2.4}" stroke-linejoin="round" stroke-linecap="round"><path d="M42 45h16l-1.4 12.2a2 2 0 0 1-2 1.8H45.4a2 2 0 0 1-2-1.8z"/><path d="M46 45v-1.5a4 4 0 0 1 8 0V45"/></g>`
        : `<circle cx="50" cy="50" r="${small ? 6 : 5}" fill="#4f7bf7"/>`;
  // app symbols drawn a quarter bigger than the logo's, in the app's own ink
  const glyph = app ? `<g transform="translate(50 50) scale(${small ? 1.45 : 1.3}) translate(-50 -50)">${mark.replaceAll("#26314a", ink)}</g>` : mark;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<defs>
<radialGradient id="glass" cx="50%" cy="28%" r="78%"><stop offset="0" stop-color="${light}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<radialGradient id="core" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8edf6"/></radialGradient>
</defs>
<ellipse cx="50" cy="${small ? 54 : 55}" rx="44" ry="42" fill="#1c2438" opacity=".22"/>
<circle cx="50" cy="${small ? 51.5 : 52.5}" r="46" fill="${edge}"/>
<circle cx="50" cy="49" r="46" fill="url(#glass)"/>
<ellipse cx="50" cy="28" rx="34" ry="19" fill="url(#sheen)"/>
<circle cx="50" cy="49" r="45.3" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="1.4"/>
<g transform="translate(0 -1)">
<circle cx="50" cy="50" r="38" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="${ringW}"/>
${segs}
${small ? "" : `<circle cx="50" cy="50" r="30.5" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".8"/>
<circle cx="50" cy="50" r="26.5" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="2.2"/>`}
<circle cx="50" cy="52" r="${coreR + 1}" fill="#1c2438" opacity=".25"/>
<circle cx="50" cy="50" r="${coreR}" fill="url(#core)"/>
${glyph}
</g>
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

/** The Files app icon: the preview's folder disc as a jewel. Deep indigo
 *  glass so the coloured "what's inside" ring reads at title-bar size, a
 *  fine rim and top sheen, and a white core with a blue folder. small: no
 *  inner ring and a thicker ring, for 16 to 24 px. */
export function filesIcon({ small = false } = {}) {
  const segsDef = [["#5b86ff", 0.36], ["#9a7bff", 0.24], ["#3fbf86", 0.2], ["#ff9a52", 0.2]];
  const ringR = small ? 36 : 37.5, ringW = small ? 12 : 9, gap = small ? 0.36 : 0.26;
  let start = 0;
  const segs = segsDef.map(([c, share]) => {
    const span = share * TAU;
    const d = arc(ringR, start + gap / 2, start + span - gap / 2);
    start += span;
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${ringW}" stroke-linecap="round"/>`;
  }).join("");
  const coreR = small ? 19 : 19.5;
  const folder = `<path d="M38.5 44a3 3 0 0 1 3-3h5.2l2.8 3.1h9a3 3 0 0 1 3 3V56a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="#3d6bf0"/><path d="M38.5 48.2h23V56a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="#5b86ff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<defs>
<radialGradient id="fb" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#3a4f92"/><stop offset=".6" stop-color="#22305f"/><stop offset="1" stop-color="#151d3c"/></radialGradient>
<linearGradient id="fs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<radialGradient id="fc" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6ecf8"/></radialGradient>
</defs>
<circle cx="50" cy="52" r="46" fill="#0b1026" opacity=".35"/>
<circle cx="50" cy="50" r="46" fill="url(#fb)"/>
<ellipse cx="50" cy="27" rx="33" ry="17" fill="url(#fs)"/>
<circle cx="50" cy="50" r="45.4" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2"/>
<circle cx="50" cy="50" r="${ringR}" fill="none" stroke="#ffffff" stroke-opacity=".1" stroke-width="${ringW}"/>
${segs}
${small ? "" : `<circle cx="50" cy="50" r="29" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="1.6"/>`}
<circle cx="50" cy="51.5" r="${coreR + 1}" fill="#0b1026" opacity=".35"/>
<circle cx="50" cy="50" r="${coreR}" fill="url(#fc)"/>
${folder}
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
  write("scalable/apps/sios-files.svg", filesIcon());
  // small sizes: fewer rings so they stay crisp in a title bar or menu
  for (const px of [16, 22, 24, 32]) {
    write(`${px}x${px}/apps/sios-files.svg`, filesIcon({ small: true }).replace('width="100" height="100"', `width="${px}" height="${px}"`));
    write(`${px}x${px}/apps/sios-logo.svg`, discColor({ core: "dot", small: true }).replace('width="100" height="100"', `width="${px}" height="${px}"`));
  }
  write("scalable/apps/sios-start.svg", discStart());
  write("symbolic/apps/sios-logo-symbolic.svg", discSymbolic());
  write("symbolic/apps/distributor-logo-symbolic.svg", discSymbolic());
  console.log("logo written");
}
