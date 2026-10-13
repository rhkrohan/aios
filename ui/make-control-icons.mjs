// Icons for the Control Center (org.sios.control), from Lucide (ISC), in the
// three inks it uses: name.svg (light theme), name-light.svg (dark theme),
// name-white.svg (on a blue "on" circle).
//   node ui/make-control-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
const L = new URL("../build_concept_html/node_modules/lucide-react/dist/esm/icons/", import.meta.url).pathname;
const OUT = new URL("../system_files/usr/share/plasma/plasmoids/org.sios.control/contents/images/", import.meta.url).pathname;
const NAMES = ["ethernet-port", "network", "chevron-right", "chevron-left", "lock", "volume-x", "settings", "clipboard", "wifi", "wifi-off", "bluetooth", "moon", "contrast", "sun", "volume-2", "check", "bell"];
const INKS = { "": "#1d1d1f", "-light": "#ececea", "-white": "#ffffff" };
for (const n of NAMES) {
  const src = readFileSync(L + n + ".mjs", "utf8");
  const m = src.match(/const __iconData = (\{[\s\S]*?\n\});\n/);
  const nodes = Function(`return ${m[1]}`)().node;
  const body = nodes.map(([tag, a]) => `<${tag} ${Object.entries(a).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  for (const [suffix, ink] of Object.entries(INKS))
    writeFileSync(`${OUT}${n === "volume-2" ? "volume" : n}${suffix}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`);
}
console.log("control icons written");
