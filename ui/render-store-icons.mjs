// Line icons for the SIOS Store (apps/sios-store), the same Lucide icons the
// preview's StoreApp.tsx uses. Run: node ui/render-store-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-store/src/icons/", import.meta.url).pathname;
for (const name of ["sparkles", "package-check", "refresh-cw", "search", "arrow-left", "x", "globe", "folder", "hard-drive",
  "shield-check", "shield-alert", "camera", "mic", "bell", "monitor", "check", "external-link", "trash-2", "plug", "briefcase",
  "message-circle", "code-xml", "image", "gamepad-2", "music", "graduation-cap", "wrench", "link", "download", "lock"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
console.log("store icons written");
