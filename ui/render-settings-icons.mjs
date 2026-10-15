// Line icons for SIOS Settings (apps/sios-settings), Lucide like the preview.
// Run: node ui/render-settings-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-settings/src/icons/", import.meta.url).pathname;
for (const name of ["brain", "shield-check", "plug", "palette", "wifi", "wifi-off", "bluetooth", "monitor", "volume-2", "bell",
  "users", "clock", "keyboard", "mouse", "refresh-cw", "info", "chevron-right", "lock", "cpu", "cloud", "check", "sun", "moon",
  "image", "external-link", "hard-drive", "memory-stick", "download", "rotate-ccw", "sparkles", "battery", "printer", "accessibility", "search",
  "brain-circuit", "book-open", "bot", "x", "triangle-alert", "circle-check", "circle-alert"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
console.log("settings icons written");
