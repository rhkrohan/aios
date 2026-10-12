// The tray, condensed into the SIOS Control Center (org.sios.control): only
// Wi-Fi and the notification bell stay here, and nothing is hidden behind
// an arrow. Notifications must stay: that item is what shows every
// notification popup. The clipboard manager runs in the Control Center;
// Bluetooth, volume, brightness and battery are there too. Volume keys work
// through KDE's audio shortcuts service, brightness keys through power
// management. The rest (vaults, KDE Connect, input method, media, drives) is
// switched off here.
const SHOWN = ["org.kde.plasma.networkmanagement", "org.kde.plasma.notifications"];

applet.currentConfigGroup = ["General"];
applet.writeConfig("scaleIconsToFit", true);
applet.writeConfig("extraItems", SHOWN);
applet.writeConfig("knownItems", SHOWN.concat(["org.kde.plasma.volume", "org.kde.plasma.brightness", "org.kde.kscreen", "org.kde.plasma.weather",
    "org.kde.plasma.clipboard", "org.kde.plasma.bluetooth", "org.kde.plasma.battery", "org.kde.plasma.devicenotifier", "org.kde.plasma.mediacontroller",
    "org.kde.plasma.printmanager", "org.kde.kdeconnect", "org.kde.plasma.vault", "org.kde.plasma.keyboardlayout", "org.kde.plasma.manage-inputmethod",
    "org.kde.plasma.keyboardindicator", "org.kde.plasma.cameraindicator"]));
applet.writeConfig("shownItems", SHOWN);
applet.writeConfig("hiddenItems", []);
applet.reloadConfig();
