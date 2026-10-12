// Emblems for the desktop folder discs (org.sios.discs), the same Lucide icons
// the preview's FolderDisc uses. Run: node ui/render-emblems.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../system_files/usr/share/plasma/plasmoids/org.sios.discs/contents/images/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
for (const [file, icon] of [["projects", "code-xml"], ["documents", "file-text"], ["downloads", "download"], ["pictures", "image"], ["folder", "folder"]]) {
  writeFileSync(`${dir}${file}.svg`, await lucideSvg(icon, "#4a5568", 2));
}
console.log("emblems written");
