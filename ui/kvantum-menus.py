"""Menus in the SIOS app style, like the preview's popovers: rounded 12px
corners, a hairline border, items inset with their own rounded hover tint.
Runs on the themes ui/make-kvantum.py wrote (safe to run again):

  python3 ui/kvantum-menus.py

Kvantum draws a frame from nine pieces found by id in the theme SVG; this
replaces the menu and menu-item pieces with our own, drawn in a strip added
below the sheet (Qt skips pieces that sit outside the sheet's size).
"""
import os
import re

HERE = os.path.dirname(__file__)
THEMES = {
    "SIOS": {"bg": "#ffffff", "line": "#e2e2dd", "hover": "#eceffd", "shadow": 0.13},
    "SIOSDark": {"bg": "#2a2d32", "line": "#3d4248", "hover": "#2f3a5e", "shadow": 0.4},
}
SHADOW = 10  # px of soft shadow around a menu


def shadowed(x0, y0, r, sh, bg, line, alpha, prefix="menu-shadow", hints=True):
    """With compositing, Kvantum draws a menu's edge from its "menu-shadow"
    pieces (not the frame), so each piece holds the soft shadow and the card's
    rounded edge: the outer sh px fade out, the inner r px are the card."""
    m = sh + r  # piece size; Kvantum stretches the edges, corners stay 1:1
    out, h = [], 0.5
    k = prefix  # keeps gradient ids unique per set
    defs = (f'<linearGradient id="{k}-grad-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="{alpha}"/></linearGradient>'
            f'<linearGradient id="{k}-grad-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="{alpha}"/></linearGradient>')
    out.append(f"<defs>{defs}</defs>")

    def piece(name, x, y, w, hgt, body):
        out.append(f'<g id="{prefix}-{name}"><rect x="{x}" y="{y}" width="{w}" height="{hgt}" fill="#000" fill-opacity="0"/>{body}</g>')

    # corners: a radial fade around the card's rounded corner
    for name, (cx, cy, sx, sy) in {"topleft": (1, 1, -1, -1), "topright": (0, 1, 1, -1),
                                   "bottomleft": (1, 0, -1, 1), "bottomright": (0, 0, 1, 1)}.items():
        x = x0 + (0 if name.endswith("left") else 2 * m)
        y = y0 + (0 if name.startswith("top") else 2 * m)
        ox, oy = x + (m if cx else 0), y + (m if cy else 0)  # the card corner's circle centre
        gid = f"{k}-grad-{name}"
        grad = (f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{ox}" cy="{oy}" r="{m}">'
                f'<stop offset="0" stop-color="#000" stop-opacity="{alpha}"/><stop offset="{r/m:.3f}" stop-color="#000" stop-opacity="{alpha}"/>'
                f'<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>')
        ex, ey = ox + sx * r, oy + sy * r  # where the card's arc meets the piece edges
        sweep = 1 if sx * sy > 0 else 0  # which way round the arc goes
        disc = f'M{ex},{oy} A{r},{r} 0 0 {sweep} {ox},{ey} L{ox},{oy} Z'
        arc = f'M{ox + sx * (r - h)},{oy} A{r - h},{r - h} 0 0 {sweep} {ox},{oy + sy * (r - h)}'
        piece(name, x, y, m, m, f'<defs>{grad}</defs><rect x="{x}" y="{y}" width="{m}" height="{m}" fill="url(#{gid})"/>'
                                 f'<path d="{disc}" fill="{bg}"/><path d="{arc}" fill="none" stroke="{line}" stroke-width="1"/>')
    # edges: a straight fade, then the card with its hairline
    piece("top", x0 + m, y0, m, m, f'<rect x="{x0+m}" y="{y0}" width="{m}" height="{sh}" fill="url(#{k}-grad-v)"/>'
          f'<rect x="{x0+m}" y="{y0+sh}" width="{m}" height="{r}" fill="{bg}"/><path d="M{x0+m},{y0+sh+h} h{m}" stroke="{line}"/>')
    piece("bottom", x0 + m, y0 + 2 * m, m, m, f'<rect x="{x0+m}" y="{y0+2*m+r}" width="{m}" height="{sh}" fill="url(#{k}-grad-v)" transform="rotate(180 {x0+1.5*m} {y0+2*m+r+sh/2})"/>'
          f'<rect x="{x0+m}" y="{y0+2*m}" width="{m}" height="{r}" fill="{bg}"/><path d="M{x0+m},{y0+2*m+r-h} h{m}" stroke="{line}"/>')
    piece("left", x0, y0 + m, m, m, f'<rect x="{x0}" y="{y0+m}" width="{sh}" height="{m}" fill="url(#{k}-grad-h)"/>'
          f'<rect x="{x0+sh}" y="{y0+m}" width="{r}" height="{m}" fill="{bg}"/><path d="M{x0+sh+h},{y0+m} v{m}" stroke="{line}"/>')
    piece("right", x0 + 2 * m, y0 + m, m, m, f'<rect x="{x0+2*m+r}" y="{y0+m}" width="{sh}" height="{m}" fill="url(#{k}-grad-h)" transform="rotate(180 {x0+2*m+r+sh/2} {y0+1.5*m})"/>'
          f'<rect x="{x0+2*m}" y="{y0+m}" width="{r}" height="{m}" fill="{bg}"/><path d="M{x0+2*m+r-h},{y0+m} v{m}" stroke="{line}"/>')
    # hints: how much of each piece is shadow (Kvantum offsets the menu by it)
    for i, d in enumerate(("left", "top", "right", "bottom") if hints else ()):
        w, hgt = (sh, 1) if d in ("left", "right") else (1, sh)
        out.append(f'<rect id="menu-shadow-hint-{d}" x="{x0 + 3 * m + 4 + i * 12}" y="{y0}" width="{w}" height="{hgt}" fill="#000" fill-opacity="0"/>')
    return "".join(out)
R, ITEM_R = 12, 7  # menu corner, item corner (px; the pieces are 1:1)


def nine(prefix, x0, y0, r, bg, line=None):
    """The nine pieces of a rounded rectangle with corner r, each one single
    SVG shape (Kvantum mis-places edges built from groups). The hairline is a
    hard stop in the fill: a linear gradient on the edges, a radial one on the
    corners, so no strokes spill past the piece."""
    s, out, defs = r, [], []
    edge = line or bg
    k = 1 / r  # the hairline's share of a piece

    def grad_lin(gid, x1, y1, x2, y2):
        defs.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
                    f'<stop offset="0" stop-color="{edge}"/><stop offset="{k:.4f}" stop-color="{edge}"/>'
                    f'<stop offset="{k:.4f}" stop-color="{bg}"/><stop offset="1" stop-color="{bg}"/></linearGradient>')

    # corners: a quarter disc filled from its circle's centre outwards (bg, then the hairline)
    for name, (cx, cy, px, py, sweep) in {
        "-topleft": (x0 + s, y0 + s, x0, y0, 1), "-topright": (x0 + 2 * s, y0 + s, x0 + 2 * s, y0, 0),
        "-bottomleft": (x0 + s, y0 + 2 * s, x0, y0 + 2 * s, 0), "-bottomright": (x0 + 2 * s, y0 + 2 * s, x0 + 2 * s, y0 + 2 * s, 1),
    }.items():
        gid = f"{prefix}{name}-fill"
        defs.append(f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{r}">'
                    f'<stop offset="0" stop-color="{bg}"/><stop offset="{1-k:.4f}" stop-color="{bg}"/>'
                    f'<stop offset="{1-k:.4f}" stop-color="{edge}"/><stop offset="1" stop-color="{edge}"/></radialGradient>')
        ax, ay = (px, cy) if px != cx else (cx, py)  # where the arc starts
        bx, by = (cx, py if py != cy else cy) if px != cx else (px, cy)
        # quarter disc: from the point on the outer x edge, around to the outer y edge, back to the centre
        sx = x0 if "left" in name else x0 + 3 * s
        sy = y0 if "top" in name else y0 + 3 * s
        d = f"M{sx},{cy} A{r},{r} 0 0 {sweep} {cx},{sy} L{cx},{cy} Z"
        out.append(f'<path id="{prefix}{name}" d="{d}" fill="url(#{gid})"/>')
    # edges: the hairline on the outer side
    for name, (x, y, g) in {"-top": (x0 + s, y0, (0, 0, 0, 1)), "-bottom": (x0 + s, y0 + 2 * s, (0, 1, 0, 0)),
                            "-left": (x0, y0 + s, (0, 0, 1, 0)), "-right": (x0 + 2 * s, y0 + s, (1, 0, 0, 0))}.items():
        gid = f"{prefix}{name}-fill"
        grad_lin(gid, *g)
        out.append(f'<rect id="{prefix}{name}" x="{x}" y="{y}" width="{s}" height="{s}" fill="url(#{gid})"/>')
    out.append(f'<rect id="{prefix}" x="{x0+s}" y="{y0+s}" width="{s}" height="{s}" fill="{bg}"/>')
    return f'<defs>{"".join(defs)}</defs>' + "".join(out)


for name, c in THEMES.items():
    d = os.path.join(HERE, "..", "system_files/usr/share/Kvantum", name)
    svg_path, cfg_path = os.path.join(d, name + ".svg"), os.path.join(d, name + ".kvconfig")
    svg = open(svg_path).read()
    svg = re.sub(r'<g id="sios-menus">.*?</g><!-- /sios-menus -->', "", svg, flags=re.S)
    ids = r"(menu-normal|menu-shadow|menu-shadow-hint|menuitem-pressed|menuitem-toggled)(-(top|bottom|left|right|topleft|topright|bottomleft|bottomright))?"
    # drop the old pieces (single elements with those ids)
    svg = re.sub(rf'<(path|rect)\b[^>]*\bid="{ids}"[^>]*/>', "", svg)
    # grow the sheet by a strip at the bottom for our pieces
    m = re.search(r'<svg\b[^>]*>', svg)
    tag = m.group(0)
    height = int(float(re.search(r'\bheight="([\d.]+)"', tag).group(1)))
    top = int(re.search(r'data-sios-top="(\d+)"', tag).group(1)) if "data-sios-top" in tag else height
    new = re.sub(r'\bheight="[\d.]+"', f'height="{top + 120}"', tag)
    if "data-sios-top" not in new:
        new = new.replace("<svg", f'<svg data-sios-top="{top}"', 1)
    svg = svg.replace(tag, new, 1)
    y = top + 10
    group = ('<g id="sios-menus">'
             # no soft shadow: plasmashell squeezes the shadow pieces onto the card,
             # leaving dark squares at the corners; a plain rounded card works everywhere
             + nine("menu-normal", 250, y, R, c["bg"], c["line"])
             + nine("menuitem-pressed", 60, y, ITEM_R, c["hover"])
             + nine("menuitem-toggled", 100, y, ITEM_R, c["hover"])
             + shadowed(150, y, R, SHADOW, c["bg"], c["line"], c["shadow"])  # unused while shadowless
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

    section("Menu", {**{f"frame.{e}": R for e in ("top", "bottom", "left", "right")}, "frame.expansion": 0})
    section("MenuItem", {**{f"frame.{e}": ITEM_R for e in ("top", "bottom", "left", "right")},
                         "text.margin.top": 0, "text.margin.bottom": 0, "text.margin.left": 6, "text.margin.right": 10})
    section("%General", {"menu_shadow_depth": 0, "shadowless_popup": "true", "composite": "true", "spread_menuitems": "false", "menu_separator_height": 9})
    open(cfg_path, "w").write(cfg)
    print("menus:", name)
