// White line icons for the SIOS login screen (SDDM theme). Run: node ui/render-login-icons.mjs
import { writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../system_files/usr/share/sddm/themes/sios/icons/", import.meta.url).pathname;
for (const [file, icon] of [["arrow", "arrow-right"], ["sleep", "moon"], ["restart", "rotate-ccw"], ["shutdown", "power"], ["left", "chevron-left"], ["right", "chevron-right"]])
  writeFileSync(`${dir}${file}.svg`, await lucideSvg(icon, "#ffffff", 2));
console.log("login icons written");
