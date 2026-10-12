// The desktop: the SIOS tunnel wallpaper (light and dark images in one package).
applet.wallpaperPlugin = "org.kde.image";
applet.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
applet.writeConfig("Image", "file:///usr/share/wallpapers/SIOS-Tunnel/");
applet.reloadConfig();
