// Logos of the AIs and services on the Connectors page (apps/sios-settings),
// from Simple Icons (CC0, public domain), pinned. Written as one-colour SVGs
// in #000000 so the app's icon service paints them in the brand colour.
// Run: node ui/render-settings-logos.mjs
import { writeFileSync } from "node:fs";
const dir = new URL("../apps/sios-settings/src/icons/", import.meta.url).pathname;
const base = "https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/";
for (const name of ["claude", "openai", "googlegemini", "github", "gmail", "googlecalendar", "linear", "notion", "slack"]) {
  const svg = await (await fetch(base + name + ".svg")).text();
  const d = svg.match(/<path d="([^"]+)"/)[1];
  writeFileSync(`${dir}logo-${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#000000"><path d="${d}"/></svg>\n`);
}
console.log("settings logos written");
