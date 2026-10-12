// Line icons for the Control Center (org.sios.control), the same Lucide icons
// the preview's ControlCenter.tsx uses. Run: node ui/render-control-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../system_files/usr/share/plasma/plasmoids/org.sios.control/contents/images/", import.meta.url).pathname;
const icons = { sliders: "sliders-horizontal", wifi: "wifi", "wifi-off": "wifi-off", bluetooth: "bluetooth", moon: "moon-star", contrast: "sun-moon", sun: "sun", volume: "volume-2", bell: "bell" };
for (const [file, icon] of Object.entries(icons)) {
  writeFileSync(`${dir}${file}.svg`, await lucideSvg(icon, "#1d1d1f", 1.8));
  writeFileSync(`${dir}${file}-white.svg`, await lucideSvg(icon, "#ffffff", 1.8));
  writeFileSync(`${dir}${file}-light.svg`, await lucideSvg(icon, "#ececea", 1.8));
}
console.log("control icons written");
