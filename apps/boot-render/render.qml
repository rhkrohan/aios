// The login splash's pieces, drawn one by one and saved for Plymouth:
// orb frames (the same Orb.qml, stepped in time), the SIOS wordmark, the bar,
// and the captions, with the splash's fonts, sizes and spacing.
import QtQuick
import QtQuick.Window

Window {
    id: win
    width: 640; height: 360
    visible: true
    color: "transparent"

    readonly property int frames: 80
    // the splash steps t by 0.055 twenty times a second; Plymouth shows 25 frames a second
    readonly property real dt: 0.055 * 20 / 25
    property int n: 0
    property var jobs: []

    Loader { id: orbLoader; source: splashDir + "Orb.qml"; width: 170; height: 170
        // as in the splash: 24 strands, lively; the clock stopped so each frame is stepped exactly
        onLoaded: { item.strands = 24; item.still = true; item.lively = true; start.start(); }
    }
    // wait out the orb's 0.4 s fade into "lively" before the first frame
    Timer { id: start; interval: 700; onTriggered: { orbLoader.item.t = 0; orbLoader.item.painted.connect(win.grabOrb); orbLoader.item.requestPaint(); } }
    function grabOrb() {
        orbLoader.item.painted.disconnect(win.grabOrb);
        orbLoader.grabToImage(r => {
            r.saveToFile(outDir + "/orb-" + (n < 10 ? "0" : "") + n + ".png");
            n++;
            if (n < frames) { orbLoader.item.t = n * dt; orbLoader.item.painted.connect(win.grabOrb); orbLoader.item.requestPaint(); }
            else texts();
        });
    }

    Text { id: word; y: 200; text: "SIOS"; color: "white"; font.family: "Jost"; font.weight: Font.ExtraLight; font.pixelSize: 44; font.letterSpacing: 22; leftPadding: 22; topPadding: 32 }
    Rectangle { id: track; y: 300; width: 224; height: 3; radius: 1.5; color: Qt.rgba(1, 1, 1, 0.10) }
    Rectangle { id: fill; y: 310; width: 224; height: 3; radius: 1.5
        gradient: Gradient { orientation: Gradient.Horizontal
            GradientStop { position: 0; color: "#7fd0ff" } GradientStop { position: 0.5; color: "#7d9dff" } GradientStop { position: 1; color: "#9b7bff" } } }
    Text { id: cap; x: 300; y: 300; width: 320; horizontalAlignment: Text.AlignHCenter; topPadding: 16; color: Qt.rgba(1, 1, 1, 0.45); font.family: "Instrument Sans"; font.pixelSize: 13 }

    readonly property var captions: [["image", "Starting SIOS"], ["desktop", "Getting your desktop ready"], ["restart", "Restarting"], ["shutdown", "Shutting down"], ["update", "Installing an update"]]
    function texts() {
        word.grabToImage(r => { r.saveToFile(outDir + "/wordmark.png");
            track.grabToImage(r2 => { r2.saveToFile(outDir + "/track.png");
                fill.grabToImage(r3 => { r3.saveToFile(outDir + "/fill.png"); caption(0); }); }); });
    }
    function caption(i) {
        if (i >= captions.length) { Qt.quit(); return; }
        cap.text = captions[i][1];
        Qt.callLater(() => cap.grabToImage(r => { r.saveToFile(outDir + "/caption-" + captions[i][0] + ".png"); caption(i + 1); }));
    }
}
