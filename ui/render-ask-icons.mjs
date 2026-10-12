// Line icons for the SIOS Ask bar (apps/sios-ask), Lucide like the preview's
// CommandBar. Run: node ui/render-ask-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-ask/src/icons/", import.meta.url).pathname;
for (const name of ["folder", "shopping-bag", "settings", "activity", "lock", "moon", "sun", "power", "rotate-ccw", "log-out",
  "trash-2", "cpu", "arrow-up", "arrow-down", "corner-down-left", "layout-grid", "search", "wifi", "palette", "monitor", "volume-2",
  "bluetooth", "refresh-cw", "info", "file", "app-window", "sparkles", "bell", "users", "keyboard"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
console.log("ask icons written");
