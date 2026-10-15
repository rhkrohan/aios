// SIOS desktop layout, like the preview (build_concept_html/src/components/shell/
// Desktop.tsx, TopBar.tsx, Dock.tsx, Widgets.tsx). Runs once, when a user's
// desktop is first set up (or on "reset layout").

// ---- top bar: logo (app launcher), Workspaces Files Apps System | SIOS | tray, date and time
const top = new Panel;
top.location = "top";
top.height = 36;
top.floating = false;
top.hiding = "none";

top.addWidget("org.sios.logo");
top.addWidget("org.sios.menus");
top.addWidget("org.kde.plasma.panelspacer");
top.addWidget("org.sios.wordmark");
top.addWidget("org.kde.plasma.panelspacer");
// the buddy floats above windows in its own little window; it takes no room here
top.addWidget("org.sios.buddy");
top.addWidget("org.kde.plasma.systemtray");
// Control Center: Wi-Fi, Bluetooth, Do not disturb, Dark mode, brightness, volume, notifications
top.addWidget("org.sios.control");
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
dock.height = 92;
dock.floating = true;
dock.hiding = "none";
dock.lengthMode = "fit";
dock.alignment = "center";
dock.addWidget("org.sios.dock");

// ---- the desktop: folder discs on the left, SIOS in the middle, today on the right
// The folder desktop remembers widget positions per screen size, so save them
// for the common sizes too: otherwise a new size (a resolution change, a
// docked laptop, a VM window) keeps the old pixel positions.
const SIZES = [[1024, 768], [1280, 720], [1280, 768], [1280, 800], [1366, 768], [1440, 900], [1470, 956], [1512, 982], [1536, 864], [1600, 900],
    [1680, 1050], [1728, 1080], [1728, 1084], [1728, 1117], [1920, 1080], [1920, 1200], [2048, 1152], [2560, 1080], [2560, 1440],
    [2560, 1600], [3440, 1440], [3840, 2160]];
// the desktop snaps widgets to a 16px grid, so place them on it
const snap = (v) => Math.round(v / 16) * 16;
for (const desktop of desktops()) {
    const g = screenGeometry(desktop.screen);
    const hero = desktop.addWidget("org.sios.hero");
    const discs = desktop.addWidget("org.sios.discs");
    const today = desktop.addWidget("org.sios.today");
    const layout = (w, h) =>
        `Applet-${hero.id}:${snap(w / 2 - 448)},${snap(h * 0.16)},896,224,0;` +
        `Applet-${discs.id}:0,48,128,576,0;` +
        `Applet-${today.id}:${snap(w - 336)},48,320,608,0;`;
    desktop.currentConfigGroup = [];
    for (const [w, h] of SIZES.concat([[g.width, g.height]])) desktop.writeConfig(`ItemGeometries-${w}x${h}`, layout(w, h));
    desktop.writeConfig("ItemGeometriesHorizontal", layout(g.width, g.height));
    desktop.reloadConfig();
}

