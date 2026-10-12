// Line icons for SIOS Monitor (apps/sios-monitor), Lucide like the preview.
// Run: node ui/render-monitor-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-monitor/src/icons/", import.meta.url).pathname;
for (const name of ["activity", "cpu", "memory-stick", "hard-drive", "arrow-down-up", "battery", "battery-charging", "gauge",
  "sparkles", "hourglass", "circle-check", "clock", "ban", "x", "layout-grid", "app-window", "thermometer"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
console.log("monitor icons written");
