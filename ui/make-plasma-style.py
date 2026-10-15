"""The SIOS Plasma style: popups, notifications, tooltips and panels drawn like
the preview's glass cards (build_concept_html/src/app/globals.css: .glass,
--glass-strong, --glass-line, --shadow-pop). Plasma takes every file it
doesn't find here from Breeze, so only the frames are ours.

  python3 ui/make-plasma-style.py

Each frame is a "9-slice" SVG: corners, edges and a centre that Plasma
stretches, plus a mask (where blur goes) and shadow pieces. Colours use
Plasma's ColorScheme classes, so light and dark follow the colour scheme.
"""
import gzip
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "system_files/usr/share/plasma/desktoptheme/sios")

STYLE = """<style id="current-color-scheme" type="text/css">
.ColorScheme-Background { color:#fdfdff; }
.ColorScheme-Text { color:#1d1d1f; }
</style>"""


def frame(radius, margin, shadow, opacity, edge_opacity=0.7, outline=0.08, shadow_alpha=0.30, shadow_dy=6):
    """One 9-slice frame. Pieces are laid out on a grid; Plasma reads each by id."""
    R, S, E = radius, shadow, 10  # corner size, shadow size, edge length
    parts = []

    def piece(id_, x, y, w, h, body):
        parts.append(f'<g id="{id_}" transform="translate({x},{y})"><rect width="{w}" height="{h}" fill="none"/>{body}</g>')

    fill = f'class="ColorScheme-Background" fill="currentColor" fill-opacity="{opacity}"'
    line = f'fill="#ffffff" fill-opacity="{edge_opacity}"'
    dark = f'fill="#14181e" fill-opacity="{outline}"'

    def corner(rot):
        # rings that don't overlap (overlapping see-through layers show as seams):
        # outer hairline (dark), light rim, then the fill
        def ring(r0, r1):
            return (f"M{R},{R - r0} A{r0},{r0} 0 0 0 {R - r0},{R} L{R - r1},{R} "
                    f"A{r1},{r1} 0 0 1 {R},{R - r1} Z")
        disc = f"M{R},{R} L{R},{R - (R - 2)} A{R - 2},{R - 2} 0 0 0 2,{R} Z"
        g = f'<path d="{ring(R, R - 1)}" {dark}/><path d="{ring(R - 1, R - 2)}" {line}/><path d="{disc}" {fill}/>'
        return f'<g transform="rotate({rot} {R / 2} {R / 2})">{g}</g>'

    def edge(w, h, side):
        # a band: 1px dark outline, 1px light rim, then fill
        if side in ("top", "bottom"):
            y0 = 0 if side == "top" else h - 1
            y1 = 1 if side == "top" else h - 2
            yf = 2 if side == "top" else 0
            return f'<rect y="{y0}" width="{w}" height="1" {dark}/><rect y="{y1}" width="{w}" height="1" {line}/><rect y="{yf}" width="{w}" height="{h - 2}" {fill}/>'
        x0 = 0 if side == "left" else w - 1
        x1 = 1 if side == "left" else w - 2
        xf = 2 if side == "left" else 0
        return f'<rect x="{x0}" width="1" height="{h}" {dark}/><rect x="{x1}" width="1" height="{h}" {line}/><rect x="{xf}" width="{w - 2}" height="{h}" {fill}/>'

    # the frame
    piece("topleft", 0, 0, R, R, corner(0))
    piece("top", R, 0, E, R, edge(E, R, "top"))
    piece("topright", R + E, 0, R, R, corner(90))
    piece("left", 0, R, R, E, edge(R, E, "left"))
    piece("center", R, R, E, E, f'<rect width="{E}" height="{E}" {fill}/>')
    piece("right", R + E, R, R, E, edge(R, E, "right"))
    piece("bottomleft", 0, R + E, R, R, corner(270))
    piece("bottom", R, R + E, E, R, edge(E, R, "bottom"))
    piece("bottomright", R + E, R + E, R, R, corner(180))
    # where the content starts (inside the rounding)
    for side in ("top", "bottom", "left", "right"):
        parts.append(f'<rect id="hint-{side}-margin" x="{100}" y="0" width="{margin}" height="{margin}" fill="none"/>')

    # mask: same shape, solid (Plasma blurs behind it)
    ox = 3 * R + E + 20
    solid = 'fill="#000000"'
    def mcorner(rot):
        return f'<g transform="rotate({rot} {R / 2} {R / 2})"><path d="M{R},{R} L{R},0 A{R},{R} 0 0 0 0,{R} Z" {solid}/></g>'
    for id_, x, y, w, h, body in [
        ("mask-topleft", 0, 0, R, R, mcorner(0)), ("mask-top", R, 0, E, R, f'<rect width="{E}" height="{R}" {solid}/>'),
        ("mask-topright", R + E, 0, R, R, mcorner(90)), ("mask-left", 0, R, R, E, f'<rect width="{R}" height="{E}" {solid}/>'),
        ("mask-center", R, R, E, E, f'<rect width="{E}" height="{E}" {solid}/>'), ("mask-right", R + E, R, R, E, f'<rect width="{R}" height="{E}" {solid}/>'),
        ("mask-bottomleft", 0, R + E, R, R, mcorner(270)), ("mask-bottom", R, R + E, E, R, f'<rect width="{E}" height="{R}" {solid}/>'),
        ("mask-bottomright", R + E, R + E, R, R, mcorner(180)),
    ]:
        parts.append(f'<g id="{id_}" transform="translate({x + ox},{y})"><rect width="{w}" height="{h}" fill="none"/>{body}</g>')

    # shadow: soft, a little lower than the card, like --shadow-pop
    sy = 2 * (3 * R + E) + 40
    T = S + R  # shadow corner size (reaches under the card's rounding)
    grad = f"""<radialGradient id="sc" cx="{T}" cy="{T}" r="{T}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#0a1428" stop-opacity="{shadow_alpha}"/><stop offset="{R / T:.3f}" stop-color="#0a1428" stop-opacity="{shadow_alpha * 0.8:.3f}"/><stop offset="1" stop-color="#0a1428" stop-opacity="0"/></radialGradient>
<linearGradient id="sv" x1="0" y1="{T}" x2="0" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#0a1428" stop-opacity="{shadow_alpha}"/><stop offset="{R / T:.3f}" stop-color="#0a1428" stop-opacity="{shadow_alpha * 0.8:.3f}"/><stop offset="1" stop-color="#0a1428" stop-opacity="0"/></linearGradient>"""
    parts.insert(0, f"<defs>{grad}</defs>")
    def scorner(rot):
        return f'<g transform="rotate({rot} {T / 2} {T / 2})"><rect width="{T}" height="{T}" fill="url(#sc)"/></g>'
    def sedge(rot, w, h):
        # a vertical fade drawn for the top edge, rotated for the others
        body = f'<rect width="{E}" height="{T}" fill="url(#sv)"/>'
        if rot == 0:
            return body
        if rot == 180:
            return f'<g transform="rotate(180 {E / 2} {T / 2})">{body}</g>'
        # left/right: a T-wide, E-tall band
        g = f'<g transform="translate(0,{E}) rotate(-90)">{body}</g>' if rot == 270 else f'<g transform="translate({T},0) rotate(90)">{body}</g>'
        return g
    for id_, x, y, w, h, body in [
        ("shadow-topleft", 0, 0, T, T, scorner(0)), ("shadow-top", T, 0, E, T, sedge(0, E, T)),
        ("shadow-topright", T + E, 0, T, T, scorner(90)), ("shadow-left", 0, T, T, E, sedge(270, T, E)),
        ("shadow-center", T, T, E, E, f'<rect width="{E}" height="{E}" fill="#0a1428" fill-opacity="{shadow_alpha}"/>'),
        ("shadow-right", T + E, T, T, E, sedge(90, T, E)),
        ("shadow-bottomleft", 0, T + E, T, T, scorner(270)), ("shadow-bottom", T, T + E, E, T, sedge(180, E, T)),
        ("shadow-bottomright", T + E, T + E, T, T, scorner(180)),
    ]:
        parts.append(f'<g id="{id_}" transform="translate({x},{y + sy})"><rect width="{w}" height="{h}" fill="none"/>{body}</g>')
    # how far the shadow reaches past the card on each side, and how far it sits inside
    for side, m in (("top", S - shadow_dy), ("bottom", S + shadow_dy), ("left", S), ("right", S)):
        parts.append(f'<rect id="shadow-hint-{side}-margin" x="200" y="{sy}" width="{max(1, m)}" height="{max(1, m)}" fill="none"/>')
        parts.append(f'<rect id="shadow-hint-{side}-inset" x="220" y="{sy}" width="{R}" height="{R}" fill="none"/>')

    size = sy + 2 * T + E + 10
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}">{STYLE}{"".join(parts)}</svg>\n'


def write(path, svg):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    # fixed timestamp so rebuilding gives identical files
    with open(full, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as f:
        f.write(svg.encode())


# popups, menus from widgets, notifications: --glass-strong, 16px corners
popup = dict(radius=16, margin=12, shadow=24)
write("dialogs/background.svgz", frame(opacity=1.0, **popup))
write("translucent/dialogs/background.svgz", frame(opacity=1.0, **popup))
write("solid/dialogs/background.svgz", frame(opacity=1.0, **popup))
# tooltips: smaller, tighter
tip = dict(radius=10, margin=8, shadow=14, shadow_alpha=0.22)
write("widgets/tooltip.svgz", frame(opacity=1.0, **tip))
write("translucent/widgets/tooltip.svgz", frame(opacity=1.0, **tip))
# panels: the floating dock gets the preview's 22px corners; the top bar is edge to edge
# the top islands have no rim or hairline (owner, 2026-10-14: "remove the white outline")
panel = dict(radius=20, margin=6, shadow=20, shadow_alpha=0.26, shadow_dy=8, edge_opacity=0.0, outline=0.0)
write("widgets/panel-background.svgz", frame(opacity=1.0, **panel))
# the translucent panel is the dock (owner's pick "D5, no bar"): nothing at all behind
# the icons. The top bar is set opaque in the layout, so it keeps the card above.
# No mask (KWin would blur and darken behind it) and no shadow pieces either.
import re as _re
empty = frame(radius=20, margin=6, shadow=20, opacity=0.0, edge_opacity=0.0, outline=0.0, shadow_alpha=0.0)
empty = _re.sub(r'<g id="(mask|shadow)-[a-z]+"[^>]*>.*?</g>(?=<g id=|<rect id=|</svg>)', "", empty, flags=_re.S)
write("translucent/widgets/panel-background.svgz", empty)
write("solid/widgets/panel-background.svgz", frame(opacity=1.0, **panel))

json.dump({
    "KPackageStructure": "Plasma/Theme",
    "KPlugin": {
        "Id": "sios",
        "Name": "SIOS",
        "Description": "SIOS glass: rounded popups, notifications and dock like the preview; the rest is Breeze",
        "Authors": [{"Name": "SIOS"}],
        "License": "GPL-2.0-or-later",
        "Version": "0.1",
        "EnabledByDefault": True,
    },
    "X-Plasma-API": "5.0",
}, open(os.path.join(OUT, "metadata.json"), "w"), indent=4)
# No blur or darkening behind SIOS surfaces: popups and the top bar are solid cards
# already, and the dock has no bar at all (KWin would otherwise darken a slab there).
open(os.path.join(OUT, "plasmarc"), "w").write("[AdaptiveTransparency]\nenabled=true\n\n[BlurBehindEffect]\nenabled=false\n\n[ContrastEffect]\nenabled=false\n")
print("wrote", OUT)
