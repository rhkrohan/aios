// The SIOS icon theme: thin line icons (Lucide) for the apps in the dock, so it
// looks like the preview's dock (build_concept_html/src/components/shell/Dock.tsx).
// Everything else falls back to Breeze. Run: node ui/render-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";

const ROOT = new URL("../system_files/usr/share/icons/", import.meta.url).pathname;

// lucide name -> the icon names apps ask for (KDE, Fedora and Flatpak ids)
const APPS = {
  folder: ["system-file-manager", "org.kde.dolphin", "folder-files"],
  globe: ["firefox", "org.mozilla.firefox", "web-browser", "internet-web-browser", "org.chromium.Chromium", "chromium-browser", "google-chrome"],
  mail: ["internet-mail", "mail-client", "org.mozilla.Thunderbird", "thunderbird", "org.kde.kmail2", "kmail"],
  "shopping-bag": ["plasmadiscover", "org.kde.discover", "io.github.kolunmi.Bazaar", "system-software-install"],
  activity: ["utilities-system-monitor", "org.kde.plasma-systemmonitor", "ksysguard"],
  settings: ["systemsettings", "preferences-system", "org.kde.systemsettings"],
  "square-terminal": ["utilities-terminal", "org.kde.konsole", "konsole"],
};

for (const [theme, color] of [["SIOS", "#1d1d1f"], ["SIOS-Dark", "#ececea"]]) {
  const dir = `${ROOT}${theme}/scalable/apps`;
  mkdirSync(dir, { recursive: true });
  for (const [icon, names] of Object.entries(APPS)) {
    const svg = await lucideSvg(icon, color, 1.7);
    for (const n of names) writeFileSync(`${dir}/${n}.svg`, svg);
  }
  writeFileSync(
    `${ROOT}${theme}/index.theme`,
    `[Icon Theme]
Name=${theme.replace("-", " ")}
Comment=SIOS line icons for the dock apps; everything else is Breeze
Inherits=${theme === "SIOS" ? "breeze" : "breeze-dark"},hicolor
Directories=scalable/apps

[scalable/apps]
Size=48
MinSize=16
MaxSize=512
Type=Scalable
Context=Applications
`,
  );
}
console.log("icons written");
