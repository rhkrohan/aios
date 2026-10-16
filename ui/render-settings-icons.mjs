// Line icons for SIOS Settings (apps/sios-settings), Lucide like the preview.
// Run: node ui/render-settings-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-settings/src/icons/", import.meta.url).pathname;
for (const name of ["brain", "shield-check", "plug", "palette", "wifi", "wifi-off", "bluetooth", "monitor", "volume-2", "bell",
  "users", "clock", "keyboard", "mouse", "refresh-cw", "info", "chevron-right", "lock", "cpu", "cloud", "check", "sun", "moon",
  "image", "external-link", "hard-drive", "memory-stick", "download", "rotate-ccw", "sparkles", "battery", "printer", "accessibility", "search",
  "brain-circuit", "book-open", "bot", "x", "triangle-alert", "circle-check", "circle-alert",
  // the native pages for display, sound, Bluetooth and the rest (owner, 2026-10-16)
  "volume", "volume-1", "volume-x", "mic", "mic-off", "headphones", "speaker", "rotate-cw", "rotate-ccw", "sun-moon", "sunset",
  "contrast", "type", "eye", "move", "hand", "bluetooth-connected", "bluetooth-off", "smartphone", "laptop", "watch", "gamepad-2",
  "battery-charging", "battery-low", "zap", "power", "timer", "gauge", "globe", "user", "user-round", "lock", "key-round", "camera",
  "trash-2", "plus", "minus", "loader-circle", "languages", "mouse-pointer-click", "pointer", "printer-check", "file-text",
  "bell-off", "bell-ring", "calendar", "clock-3", "scan-search", "maximize", "monitor-cog"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
console.log("settings icons written");
