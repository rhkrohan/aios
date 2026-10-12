// Turns a Lucide icon (the same icons the preview uses, ISC licence) into a
// standalone SVG for the SIOS icon theme. Usage: lucideSvg("folder", "#1d1d1f", 1.7)
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const ICONS = new URL("../build_concept_html/node_modules/lucide-react/dist/esm/icons/", import.meta.url);

export async function lucideSvg(name, color = "#1d1d1f", stroke = 1.7) {
  let mod = await import(pathToFileURL(new URL(`${name}.mjs`, ICONS).pathname).href);
  // some names are aliases that re-export another icon (trash-2 -> trash)
  if (!mod.__iconData) {
    const src = readFileSync(new URL(`${name}.mjs`, ICONS), "utf8");
    const target = src.match(/from '\.\/([^']+)\.mjs'/)?.[1];
    mod = await import(pathToFileURL(new URL(`${target}.mjs`, ICONS).pathname).href);
  }
  const { __iconData } = mod;
  const body = __iconData.node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
}
