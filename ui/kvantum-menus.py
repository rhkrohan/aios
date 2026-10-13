"""Menus in the SIOS app style, like the preview's popovers: rounded 12px
corners, a hairline border, items inset with their own rounded hover tint.
Runs on the themes ui/make-kvantum.py wrote (safe to run again):

  python3 ui/kvantum-menus.py

Kvantum draws a frame from nine pieces found by id in the theme SVG; this
replaces the menu and menu-item pieces with our own, drawn far off to the
side of the sheet so nothing else overlaps them.
"""
import os
import re

HERE = os.path.dirname(__file__)
THEMES = {
    "SIOS": {"bg": "#ffffff", "line": "#e2e2dd", "hover": "#eceffd"},
    "SIOSDark": {"bg": "#2a2d32", "line": "#3d4248", "hover": "#2f3a5e"},
}
R, ITEM_R = 12, 8  # menu corner, item corner (px; the pieces are 1:1)


def nine(prefix, x0, y0, r, bg, line=None):
    """The nine pieces of a rounded rectangle with corner r, as SVG groups."""
    s = r  # each corner piece is r x r; edges and middle are r x r too and get stretched
    out = []

    def piece(name, x, y, body):
        out.append(f'<g id="{prefix}{name}"><rect x="{x}" y="{y}" width="{s}" height="{s}" fill="#000" fill-opacity="0"/>{body}</g>')

    h = 0.5  # half the hairline
    corners = {  # name: (x, y, path of the quarter disc, path of its border arc)
        "-topleft": (x0, y0, f"M{x0+s},{y0} A{r},{r} 0 0 0 {x0},{y0+s} L{x0+s},{y0+s} Z", f"M{x0+s},{y0+h} A{r-h},{r-h} 0 0 0 {x0+h},{y0+s}"),
        "-topright": (x0 + 2 * s, y0, f"M{x0+2*s},{y0} A{r},{r} 0 0 1 {x0+3*s},{y0+s} L{x0+2*s},{y0+s} Z", f"M{x0+2*s},{y0+h} A{r-h},{r-h} 0 0 1 {x0+3*s-h},{y0+s}"),
        "-bottomleft": (x0, y0 + 2 * s, f"M{x0},{y0+2*s} A{r},{r} 0 0 0 {x0+s},{y0+3*s} L{x0+s},{y0+2*s} Z", f"M{x0+h},{y0+2*s} A{r-h},{r-h} 0 0 0 {x0+s},{y0+3*s-h}"),
        "-bottomright": (x0 + 2 * s, y0 + 2 * s, f"M{x0+3*s},{y0+2*s} A{r},{r} 0 0 1 {x0+2*s},{y0+3*s} L{x0+2*s},{y0+2*s} Z", f"M{x0+3*s-h},{y0+2*s} A{r-h},{r-h} 0 0 1 {x0+2*s},{y0+3*s-h}"),
    }
    for name, (x, y, fill, arc) in corners.items():
        border = f'<path d="{arc}" fill="none" stroke="{line}" stroke-width="1"/>' if line else ""
        piece(name, x, y, f'<path d="{fill}" fill="{bg}"/>{border}')
    edges = {  # name: (x, y, where the hairline runs)
        "-top": (x0 + s, y0, (0, h, s, h)), "-bottom": (x0 + s, y0 + 2 * s, (0, s - h, s, s - h)),
        "-left": (x0, y0 + s, (h, 0, h, s)), "-right": (x0 + 2 * s, y0 + s, (s - h, 0, s - h, s)),
    }
    for name, (x, y, (ax, ay, bx, by)) in edges.items():
        border = f'<path d="M{x+ax},{y+ay} L{x+bx},{y+by}" stroke="{line}" stroke-width="1"/>' if line else ""
        piece(name, x, y, f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{bg}"/>{border}')
    piece("", x0 + s, y0 + s, f'<rect x="{x0+s}" y="{y0+s}" width="{s}" height="{s}" fill="{bg}"/>')
    return "".join(out)


for name, c in THEMES.items():
    d = os.path.join(HERE, "..", "system_files/usr/share/Kvantum", name)
    svg_path, cfg_path = os.path.join(d, name + ".svg"), os.path.join(d, name + ".kvconfig")
    svg = open(svg_path).read()
    svg = re.sub(r'<g id="sios-menus">.*?</g><!-- /sios-menus -->', "", svg, flags=re.S)
    ids = r"(menu-normal|menuitem-pressed|menuitem-toggled)(-(top|bottom|left|right|topleft|topright|bottomleft|bottomright))?"
    # drop the old pieces (single elements with those ids)
    svg = re.sub(rf'<(path|rect)\b[^>]*\bid="{ids}"[^>]*/>', "", svg)
    group = ('<g id="sios-menus">'
             + nine("menu-normal", 4000, 4000, R, c["bg"], c["line"])
             + nine("menuitem-pressed", 4100, 4000, ITEM_R, c["hover"])
             + nine("menuitem-toggled", 4200, 4000, ITEM_R, c["hover"])
             + "</g><!-- /sios-menus -->")
    svg = svg.replace("</svg>", group + "\n</svg>")
    open(svg_path, "w").write(svg)

    cfg = open(cfg_path).read()

    def section(title, values):
        global cfg
        m = re.search(rf"^\[{re.escape(title)}\]\n[\s\S]*?(?=^\[|\Z)", cfg, flags=re.M)
        block = m.group(0)
        for k, v in values.items():
            if re.search(rf"^{re.escape(k)}=", block, flags=re.M):
                block = re.sub(rf"^{re.escape(k)}=.*$", f"{k}={v}", block, flags=re.M)
            else:
                block = block.replace(f"[{title}]\n", f"[{title}]\n{k}={v}\n", 1)
        cfg = cfg[:m.start()] + block + cfg[m.end():]

    section("Menu", {f"frame.{e}": R for e in ("top", "bottom", "left", "right")})
    section("MenuItem", {**{f"frame.{e}": ITEM_R for e in ("top", "bottom", "left", "right")},
                         "text.margin.top": 1, "text.margin.bottom": 1, "text.margin.left": 6, "text.margin.right": 10})
    section("%General", {"menu_shadow_depth": 10, "composite": "true", "spread_menuitems": "true", "menu_separator_height": 9})
    open(cfg_path, "w").write(cfg)
    print("menus:", name)
