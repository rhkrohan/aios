// The preview's design tokens (build_concept_html/src/app/globals.css), light
// and dark, following the system colour scheme.
pragma Singleton
import QtQuick

QtObject {
    // follows the system colours (KDE's light or dark scheme)
    readonly property SystemPalette system: SystemPalette { colorGroup: SystemPalette.Active }
    readonly property bool dark: system.window.hslLightness < 0.5

    readonly property color surface: dark ? "#1e2023" : "#ffffff"
    readonly property color surface2: dark ? "#24272b" : "#f7f7f5"
    readonly property color surface3: dark ? "#2c3034" : "#efefeb"
    readonly property color line: dark ? "#33373c" : "#e4e4df"
    readonly property color lineStrong: dark ? "#43484e" : "#cfcfc9"
    readonly property color fg: dark ? "#ececea" : "#1d1d1f"
    readonly property color fg2: dark ? "#a9a9a4" : "#5c5c59"
    readonly property color fg3: dark ? "#7c7c77" : "#8b8b86"
    readonly property color accent: dark ? "#8fb3d9" : "#2f5d8a"
    readonly property color accentSoft: dark ? "#233140" : "#e8eef5"
    readonly property color accentLine: dark ? "#34495f" : "#c9d6e4"
    readonly property color ai: dark ? "#7d9dff" : "#4f7bf7"
    readonly property color aiInk: dark ? "#a9bdff" : "#2f56d0"
    readonly property color aiSoft: dark ? "#1d2442" : "#eef2ff"
    readonly property color warn: dark ? "#e8957a" : "#b0532f"
    readonly property color danger: dark ? "#dc9696" : "#9a4b4b"
    readonly property color ok: dark ? "#94c29a" : "#4d7a52"

    readonly property string ui: "Instrument Sans"
    readonly property string display: "Jost"

    // file kinds, as in the preview's Icons.tsx FILE_COLOR
    readonly property var kindColor: ({
        pdf: "#d4524b", doc: "#3b74bf", sheet: "#2e8d5c", slides: "#dc7637", image: "#7b62c4",
        archive: "#8b7652", installer: "#56616e", code: "#2f5d8a", text: "#6b7480", audio: "#c1457d", video: "#c1457d",
        folder: "#8fb3ff"
    })
}
