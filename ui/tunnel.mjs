// The SIOS "tunnel" wallpaper as a standalone SVG: nested arches receding to a
// vanishing point, with the lantern at the end. Same geometry and palette as
// the preview (build_concept_html/src/components/shell/Wallpaper.tsx), so the
// desktop on the Fedora image matches the design exactly.

const VP = { x: 1060, y: 610 };
const N = 14;

export const PALETTE = {
  light: { outer: "#eceeeb", inner: "#a9bfd6", edge: "#ffffff", edgeOpacity: 0.55, glow: 0.55, bg: "#e9ece9", haze: 0.35, grain: 0.07 },
  dark: { outer: "#101419", inner: "#233a54", edge: "#9fc0e0", edgeOpacity: 0.07, glow: 0.7, bg: "#0e1216", haze: 0.5, grain: 0.05 },
};

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export function tunnelSvg(theme = "light") {
  const p = PALETTE[theme];
  const arches = Array.from({ length: N }, (_, i) => {
    const s = Math.pow(0.79, i);
    const half = 1150 * s;
    const base = VP.y + 560 * s;
    const shoulder = base - 430 * s;
    const t = i / (N - 1);
    const d = `M${VP.x - half} ${base + 400}V${shoulder}A${half} ${half} 0 0 1 ${VP.x + half} ${shoulder}V${base + 400}Z`;
    return `<path d="${d}" fill="${mix(p.outer.slice(1), p.inner.slice(1), Math.pow(t, 1.15))}" stroke="${p.edge}" stroke-opacity="${(p.edgeOpacity * (1 - t * 0.5)).toFixed(3)}" stroke-width="1.6"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="background:${p.bg}">
<defs>
<radialGradient id="lantern" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffe2ad"/><stop offset="0.25" stop-color="#f5b551" stop-opacity="0.85"/><stop offset="1" stop-color="#f0a33a" stop-opacity="0"/></radialGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg}" stop-opacity="0"/><stop offset="1" stop-color="${p.bg}" stop-opacity="${p.haze}"/></linearGradient>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.6 0"/></filter>
</defs>
<rect width="1600" height="1000" fill="${p.bg}"/>
${arches}
<circle cx="${VP.x}" cy="${VP.y + 4}" r="300" fill="url(#lantern)" opacity="${p.glow * 0.55}"/>
<circle cx="${VP.x}" cy="${VP.y + 4}" r="90" fill="url(#lantern)" opacity="${p.glow}"/>
<circle cx="${VP.x}" cy="${VP.y + 8}" r="7" fill="#ffe7bd"/>
<rect width="1600" height="1000" fill="url(#haze)"/>
<rect width="1600" height="1000" filter="url(#grain)" opacity="${p.grain}" style="mix-blend-mode:overlay"/>
</svg>`;
}

/** A page that shows the wallpaper edge to edge, for the renderer. */
export function tunnelPage(theme) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:${PALETTE[theme].bg}}svg{display:block;width:100vw;height:100vh}</style></head><body>${tunnelSvg(theme)}</body></html>`;
}
