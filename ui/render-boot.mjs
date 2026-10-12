// The SIOS boot logo for Plymouth (the screen while the computer starts):
// the arches mark and the wordmark in white, on transparent, like the
// preview's black boot screen. Run with the browser skill's runner:
//   node <browser-automation>/browser.mjs about:blank --script ui/render-boot.mjs
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url).pathname;
const jost = readFileSync(`${root}system_files/usr/share/fonts/sios/Jost[wght].ttf`).toString("base64");
const out = `${root}system_files/usr/share/plymouth/themes/sios/watermark.png`;

export default async function run(page) {
  await page.setViewportSize({ width: 360, height: 200 });
  await page.setContent(`<html><head><style>
    @font-face { font-family: Jost; src: url(data:font/ttf;base64,${jost}); font-weight: 100 900; }
    html, body { margin: 0; background: transparent; }
    .wrap { width: 360px; height: 200px; display: grid; place-items: center; align-content: center; gap: 22px; }
    .name { font: 200 44px Jost; letter-spacing: .5em; padding-left: .5em; color: #fff; }
  </style></head><body><div class="wrap">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
      <path d="M2.5 21V10.5a9.5 9.5 0 0 1 19 0V21" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M6.5 21v-9.5a5.5 5.5 0 0 1 11 0V21" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
      <path d="M10.2 21v-8.2a1.8 1.8 0 0 1 3.6 0V21" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
      <circle cx="12" cy="17.6" r="1.5" fill="#7d9dff"/>
    </svg>
    <div class="name">SIOS</div>
  </div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, omitBackground: true });
  return out;
}
