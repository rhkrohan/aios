// PNG copies of the SIOS logo (the Tron disc with SIOS in the core,
// ui/render-logo.mjs) for places that need a picture, not an icon:
//   the boot screen (Plymouth) and the About page (/usr/share/pixmaps).
// Run with the browser skill's runner:
//   node <browser-automation>/browser.mjs about:blank --script ui/render-boot.mjs
import { readFileSync } from "node:fs";
import { discColor } from "./render-logo.mjs";
const root = new URL("../", import.meta.url).pathname;
const jost = readFileSync(`${root}system_files/usr/share/fonts/sios/Jost[wght].ttf`).toString("base64");

export default async function run(page) {
  const shot = async (size, out) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><head><style>
      @font-face { font-family: Jost; src: url(data:font/ttf;base64,${jost}); font-weight: 100 900; }
      html, body { margin: 0; background: transparent; }
    </style></head><body>${discColor().replace('width="100" height="100"', `width="${size}" height="${size}"`)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: out, omitBackground: true });
  };
  // boot screen: the disc on black, centred by the theme
  await shot(160, `${root}system_files/usr/share/plymouth/themes/sios/watermark.png`);
  // About this computer
  await shot(256, `${root}system_files/usr/share/pixmaps/sios-logo.png`);
  return "logo pngs written";
}
