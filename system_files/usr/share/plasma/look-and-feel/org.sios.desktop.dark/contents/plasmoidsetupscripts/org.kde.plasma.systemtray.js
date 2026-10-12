// The tray, condensed like the preview: Wi-Fi always; Bluetooth and battery
// only when the machine has them (KDE shows them when they're active). Volume, brightness and display settings live in the SIOS Control
// Center (org.sios.control); volume keys still work (KDE's audio shortcuts
// service), brightness keys too (power management). Notifications and the
// clipboard keep running behind the arrow: the first shows the popups, the
// second keeps copied text after an app closes. Drives still pop up when
// plugged in.
const SHOWN = ["org.kde.plasma.networkmanagement"];
const AUTO = ["org.kde.plasma.bluetooth", "org.kde.plasma.battery", "org.kde.plasma.devicenotifier"];
const HIDDEN = ["org.kde.plasma.notifications", "org.kde.plasma.clipboard", "org.kde.plasma.mediacontroller",
    "org.kde.plasma.printmanager", "org.kde.kdeconnect", "org.kde.plasma.vault", "org.kde.plasma.keyboardlayout",
    "org.kde.plasma.manage-inputmethod", "org.kde.plasma.keyboardindicator", "org.kde.plasma.cameraindicator"];
const LOADED = SHOWN.concat(AUTO, HIDDEN);

// In Plasma 6 the tray is its own container: its settings are on the tray itself.
applet.currentConfigGroup = ["General"];
applet.writeConfig("scaleIconsToFit", true);
applet.writeConfig("extraItems", LOADED);
applet.writeConfig("knownItems", LOADED.concat(["org.kde.plasma.volume", "org.kde.plasma.brightness", "org.kde.kscreen", "org.kde.plasma.weather"]));
applet.writeConfig("shownItems", SHOWN);
applet.writeConfig("hiddenItems", HIDDEN);
applet.reloadConfig();
