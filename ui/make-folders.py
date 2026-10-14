#!/usr/bin/env python3
"""SIOS folders (owner's pick, 2026-10-14: "B, warm flat"): an amber folder with a
small blue badge carrying the folder's sign. One SVG per kind, written to:
  - the SIOS icon themes (places/scalable): KDE apps, file dialogs, the sidebar
  - the desktop folders widget (org.sios.discs/contents/images)
  - SIOS Files (apps/sios-files/src/folders)
Run from the repo root: python3 ui/make-folders.py"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Lucide-style signs, 24x24 stroke paths
SIGNS = {
    "download": '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
    "doc": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    "code": '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/>',
    "image": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    "home": '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    "music": '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    "video": '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    "desktop": '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    "share": '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
}


def folder(sign=None):
    """64x64. Back panel with the tab, front panel, a light lip; badge bottom right."""
    badge = ""
    if sign:
        badge = (
            '<circle cx="47" cy="45" r="11" fill="#2f5d8a"/>'
            '<circle cx="47" cy="45" r="11" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="1"/>'
            f'<g transform="translate(40.5 38.5) scale(.54)" fill="none" stroke="#ffffff" stroke-width="2.4" '
            f'stroke-linecap="round" stroke-linejoin="round">{SIGNS[sign]}</g>'
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
        '<path d="M5 13a4 4 0 0 1 4-4h14.5l5.5 5.5H55a4 4 0 0 1 4 4V24H5z" fill="#e8a33d"/>'
        '<rect x="5" y="19" width="54" height="37" rx="5" fill="#f6c25b"/>'
        '<rect x="5" y="19" width="54" height="4.5" rx="2.25" fill="#ffd77f"/>'
        '<rect x="5" y="52" width="54" height="4" rx="2" fill="#e8a33d" opacity=".35"/>'
        f"{badge}</svg>\n"
    )


# icon-theme name -> sign (None: plain folder)
THEME = {
    "folder": None,
    "inode-directory": None,
    "folder-open": None,
    "folder-download": "download",
    "folder-downloads": "download",
    "folder-documents": "doc",
    "folder-development": "code",
    "folder-pictures": "image",
    "folder-images": "image",
    "folder-music": "music",
    "folder-sound": "music",
    "folder-videos": "video",
    "folder-video": "video",
    "user-desktop": "desktop",
    "folder-desktop": "desktop",
    "user-home": "home",
    "folder-home": "home",
    "folder-publicshare": "share",
}

# the widget's and Files' own names -> sign
OWN = {"folder": None, "downloads": "download", "documents": "doc", "projects": "code", "pictures": "image",
       "music": "music", "videos": "video", "desktop": "desktop", "home": "home"}

INDEX = """[Icon Theme]
Name={name}
Comment=SIOS: warm folders with a sign for what's inside; everything else is Breeze (apps keep their own icons)
Inherits={inherits}
Directories=places/scalable

# SIOS folders at every size, drawn by ui/make-folders.py (owner's pick, 2026-10-14)
[places/scalable]
Size=64
MinSize=16
MaxSize=512
Type=Scalable
Context=Places
"""


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


for theme, inherits in [("SIOS", "breeze,hicolor"), ("SIOS-Dark", "breeze-dark,hicolor")]:
    base = ROOT / "system_files/usr/share/icons" / theme
    old = base / "places/22"
    if old.exists():
        for f in old.iterdir():
            f.unlink()
        old.rmdir()
    for name, sign in THEME.items():
        write(base / "places/scalable" / f"{name}.svg", folder(sign))
    write(base / "index.theme", INDEX.format(name=theme, inherits=inherits))

for name, sign in OWN.items():
    write(ROOT / "system_files/usr/share/plasma/plasmoids/org.sios.discs/contents/images" / f"{name}.svg", folder(sign))
    write(ROOT / "apps/sios-files/src/folders" / f"{name}.svg", folder(sign))

print(f"{len(THEME)} theme icons x2, {len(OWN)} widget and Files folders")
