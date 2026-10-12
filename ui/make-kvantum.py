"""The SIOS app style (Kvantum themes SIOS and SIOSDark), made from Kvantum's
KvGnome and KvGnomeDark themes (GPL-3.0, github.com/tsujan/Kvantum) with the
preview's colours (build_concept_html/src/app/globals.css).

  python3 ui/make-kvantum.py <path to Kvantum/themes/kvthemes>

Writes system_files/usr/share/Kvantum/SIOS and SIOSDark. The light theme is
the style "kvantum"; the dark one is picked by the style "kvantum-dark",
which Kvantum maps to <theme>Dark, so the SIOS Dark look only switches style.
"""
import os
import re
import sys

KV = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "system_files/usr/share/Kvantum")

VARIANTS = {
    "SIOS": {
        "src": "KvGnome",
        "ai": "#4f7bf7", "ink": "#2f56d0", "soft": "#e6ecfe",
        "svg": {"#3584e4": "#4f7bf7", "#185fb4": "#2f56d0", "#4a90d9": "#7d9dff", "#f6f5f4": "#f7f7f5", "#f8f8f7": "#fafaf9"},
        "blue": "#3584e4",
        "colors": {
            "window.color": "#f7f7f5", "inactive.window.color": "#f7f7f5",
            "base.color": "#ffffff", "inactive.base.color": "#ffffff",
            "alt.base.color": "#f7f7f5", "inactive.alt.base.color": "#f7f7f5",
            "button.color": "#ffffff", "mid.light.color": "#efefeb", "mid.color": "#e4e4df", "dark.color": "#cfcfc9",
            "text.color": "#1d1d1f", "window.text.color": "#1d1d1f", "button.text.color": "#1d1d1f",
            "inactive.text.color": "#1d1d1fc8", "inactive.window.text.color": "#5c5c59",
            "disabled.text.color": "#8b8b86", "tooltip.base.color": "#1b2027", "tooltip.text.color": "#ffffff",
            "link.visited.color": "#7b4fe0",
        },
        "text": "#1d1d1f",
    },
    "SIOSDark": {
        "src": "KvGnomeDark",
        "ai": "#7d9dff", "ink": "#a9bdff", "soft": "#26305a",
        "svg": {"#15539e": "#4f7bf7", "#353535": "#24272b", "#2d2d2d": "#1e2023", "#373737": "#2c3034", "#393939": "#33373c"},
        "blue": "#15539e",
        "colors": {
            "window.color": "#24272b", "inactive.window.color": "#24272b",
            "base.color": "#1e2023", "inactive.base.color": "#1e2023",
            "alt.base.color": "#24272b", "inactive.alt.base.color": "#24272b",
            "button.color": "#2c3034", "light.color": "#43484e", "mid.light.color": "#3a3f45", "mid.color": "#33373c", "dark.color": "#121416",
            "text.color": "#ececea", "window.text.color": "#ececea", "button.text.color": "#ececea",
            "inactive.text.color": "#ecececc8", "inactive.window.text.color": "#a9a9a4",
            "disabled.text.color": "#7c7c77", "tooltip.base.color": "#ececea", "tooltip.text.color": "#1d1d1f",
            "link.visited.color": "#c3a8ff",
        },
        "text": "#ececea",
    },
}

for name, v in VARIANTS.items():
    src = os.path.join(KV, v["src"])
    out = os.path.join(OUT, name)
    os.makedirs(out, exist_ok=True)

    svg = open(os.path.join(src, v["src"] + ".svg")).read()
    # selected rows in lists and sidebars: the preview's soft blue tint, not a solid bar
    svg = re.sub(r'<(rect|path)[^>]*id="itemview-(toggled|pressed)(-[a-z]+)?"[^>]*>',
                 lambda m: m.group(0).replace(v["blue"], v["soft"]), svg)
    # everything else that was GNOME blue becomes the SIOS assistant blue
    for a, b in v["svg"].items():
        svg = re.sub(a, b, svg, flags=re.I)
    open(os.path.join(out, name + ".svg"), "w").write(svg)

    cfg = open(os.path.join(src, v["src"] + ".kvconfig")).read()
    cfg = re.sub(r"^author=.*$", f"author=SIOS (from {v['src']} by Tsu Jan)", cfg, count=1, flags=re.M)
    cfg = re.sub(r"^comment=.*$", f"comment=SIOS{' dark' if 'Dark' in name else ''}: soft blue selection, the assistant blue for focus", cfg, count=1, flags=re.M)
    colors = dict(v["colors"], **{"highlight.color": v["ai"], "inactive.highlight.color": v["ai"], "link.color": v["ink"]})
    for k, val in colors.items():
        if re.search(rf"^{re.escape(k)}=", cfg, flags=re.M):
            cfg = re.sub(rf"^{re.escape(k)}=.*$", f"{k}={val}", cfg, flags=re.M)
        else:
            cfg = cfg.replace("[GeneralColors]\n", f"[GeneralColors]\n{k}={val}\n", 1)

    # selected rows: blue text on the soft tint
    def itemview(m):
        block = m.group(0)
        for k, val in {"text.press.color": v["ink"], "text.toggle.color": v["ink"], "text.toggle.inactive.color": v["ink"],
                       "text.normal.color": v["text"], "text.focus.color": v["text"]}.items():
            block = re.sub(rf"^{re.escape(k)}=.*$", f"{k}={val}", block, flags=re.M)
        return block
    cfg = re.sub(r"^\[ItemView\][\s\S]*?(?=^\[)", itemview, cfg, flags=re.M)
    # other plain black or white text in the theme follows our ink colour
    cfg = re.sub(r"=black$" if name == "SIOS" else r"=white$", "=" + v["text"], cfg, flags=re.M)
    open(os.path.join(out, name + ".kvconfig"), "w").write(cfg)
    print("wrote", out)
