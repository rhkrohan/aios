// Render the SIOS tunnel wallpaper to PNGs for the KDE wallpaper package:
//   node ui/render-wallpaper.mjs
// Writes system_files/usr/share/wallpapers/SIOS-Tunnel/contents/images{,_dark}/WxH.png
// using the headless browser (the browser-automation skill's browser.mjs).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tunnelPage } from "./tunnel.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "system_files/usr/share/wallpapers/SIOS-Tunnel/contents");
const browser = process.env.BROWSER_MJS || join(homedir(), ".claude/skills/browser-automation/browser.mjs");
const SIZES = [[3840, 2160], [2560, 1600], [2560, 1440], [1920, 1200], [1920, 1080], [1366, 768]];

for (const theme of ["light", "dark"]) {
  const page = join(tmpdir(), `sios-tunnel-${theme}.html`);
  writeFileSync(page, tunnelPage(theme));
  const dir = join(out, theme === "light" ? "images" : "images_dark");
  mkdirSync(dir, { recursive: true });
  const script = join(tmpdir(), `sios-tunnel-${theme}.mjs`);
  writeFileSync(
    script,
    `export default async function run(page) {
  for (const [w, h] of ${JSON.stringify(SIZES)}) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    await page.screenshot({ path: ${JSON.stringify(dir)} + "/" + w + "x" + h + ".png" });
  }
  return "ok";
}`,
  );
  execFileSync("node", [browser, "file://" + page, "--script", script, "--timeout", "60000"], { stdio: "inherit" });
}
console.log("wallpapers written to", out);
