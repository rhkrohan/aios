// SIOS desktop layout: a slim top bar and a floating dock, like the preview
// (build_concept_html/src/components/shell/TopBar.tsx and Dock.tsx).
// Runs once, when a user's desktop is first set up (or on "reset layout").

// ---- top bar: logo menu, app menu | wordmark | tray, clock
const top = new Panel;
top.location = "top";
top.height = 36;
top.floating = false;
top.hiding = "none";

const kickoff = top.addWidget("org.kde.plasma.kickoff");
kickoff.currentConfigGroup = ["General"];
kickoff.writeConfig("icon", "sios-logo-symbolic");
kickoff.reloadConfig();
top.addWidget("org.kde.plasma.appmenu");
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
clock.reloadConfig();

// ---- dock: floating, only as wide as its apps
const dock = new Panel;
dock.location = "bottom";
dock.height = 58;
dock.floating = true;
dock.hiding = "none";
dock.lengthMode = "fit";
dock.alignment = "center";

const tasks = dock.addWidget("org.kde.plasma.icontasks");
tasks.currentConfigGroup = ["General"];
// Files, Browser | (the Ask orb joins here in Stage B) | Store, Activity, Settings
tasks.writeConfig("launchers", [
    "preferred://filemanager",
    "preferred://browser",
    "applications:io.github.kolunmi.Bazaar.desktop",
    "applications:org.kde.plasma-systemmonitor.desktop",
    "applications:systemsettings.desktop"
]);
tasks.writeConfig("iconSpacing", 2);
tasks.writeConfig("maxStripes", 1);
tasks.reloadConfig();
