// SIOS desktop layout, like the preview (build_concept_html/src/components/shell/
// Desktop.tsx, TopBar.tsx, Dock.tsx, Widgets.tsx). Runs once, when a user's
// desktop is first set up (or on "reset layout").

// ---- top bar: logo (app launcher), Workspaces Files Apps System | SIOS | tray, date and time
const top = new Panel;
top.location = "top";
top.height = 36;
top.floating = false;
top.hiding = "none";

const kickoff = top.addWidget("org.kde.plasma.kickoff");
kickoff.currentConfigGroup = ["General"];
kickoff.writeConfig("icon", "sios-start");
kickoff.reloadConfig();
top.addWidget("org.sios.menus");
top.addWidget("org.kde.plasma.panelspacer");
top.addWidget("org.sios.wordmark");
top.addWidget("org.kde.plasma.panelspacer");
top.addWidget("org.kde.plasma.systemtray");
const clock = top.addWidget("org.kde.plasma.digitalclock");
clock.currentConfigGroup = ["Appearance"];
clock.writeConfig("showDate", true);
clock.writeConfig("dateDisplayFormat", "BesideTime");
clock.writeConfig("dateFormat", "custom");
clock.writeConfig("customDateFormat", "ddd, MMM d");
// 13px like the preview, instead of filling the bar's height
clock.writeConfig("autoFontAndSize", false);
clock.writeConfig("fontFamily", "Instrument Sans");
clock.writeConfig("fontWeight", 500);
clock.writeConfig("fontSize", 10);
clock.reloadConfig();

// ---- dock: floating, only as wide as its apps, with the orb in the middle
const dock = new Panel;
dock.location = "bottom";
dock.height = 58;
dock.floating = true;
dock.hiding = "none";
dock.lengthMode = "fit";
dock.alignment = "center";
dock.addWidget("org.sios.dock");

// ---- the desktop: folder discs on the left, SIOS in the middle, today on the right
for (const desktop of desktops()) {
    const g = screenGeometry(desktop.screen);
    // the desktop snaps widgets to a 16px grid, so place them on it
    const snap = (v) => Math.round(v / 16) * 16;
    const place = [
        [desktop.addWidget("org.sios.hero"), snap(g.width / 2 - 448), snap(g.height * 0.16), 896, 224],
        [desktop.addWidget("org.sios.discs"), 0, 48, 128, 576],
        [desktop.addWidget("org.sios.today"), snap(g.width - 336), 48, 320, 608],
    ];
    const geometry = place.map(([w, x, y, width, height]) => `Applet-${w.id}:${x},${y},${width},${height},0;`).join("");
    // the folder desktop keeps positions per screen size, plus one for any other size
    desktop.currentConfigGroup = [];
    desktop.writeConfig(`ItemGeometries-${g.width}x${g.height}`, geometry);
    desktop.writeConfig("ItemGeometriesHorizontal", geometry);
    desktop.reloadConfig();
}
