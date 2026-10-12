// Line icons for SIOS Files (apps/sios-files), the same Lucide icons the
// preview's FilesApp.tsx uses. Drawn in the ink colour; the app tints them.
// Run: node ui/render-files-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-files/src/icons/", import.meta.url).pathname;
for (const name of ["arrow-left", "arrow-right", "chevron-right", "search", "arrow-up-down", "layout-grid", "list", "folder-plus",
  "panel-right", "x", "house", "file-text", "download", "code-xml", "image", "clock", "globe", "trash-2", "git-branch", "sparkles", "lock", "folder"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
console.log("files icons written");
