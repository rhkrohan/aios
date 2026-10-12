"""The SIOS app style (Kvantum theme), made from Kvantum's KvGnome theme
(GPL-3.0, github.com/tsujan/Kvantum) with the preview's colours
(build_concept_html/src/app/globals.css).

  python3 ui/make-kvantum.py <path to Kvantum/themes/kvthemes/KvGnome>

Writes system_files/usr/share/Kvantum/SIOS/.
"""
import os, re, sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "system_files/usr/share/Kvantum/SIOS")
os.makedirs(out, exist_ok=True)

AI, AI_INK, AI_SOFT = "#4f7bf7", "#2f56d0", "#e6ecfe"

svg = open(os.path.join(src, "KvGnome.svg")).read()
# selected rows in lists and sidebars: the preview's soft blue tint, not a solid bar
def soften(m):
    return m.group(0).replace("#3584e4", AI_SOFT)
svg = re.sub(r'<(rect|path)[^>]*id="itemview-(toggled|pressed)(-[a-z]+)?"[^>]*>', soften, svg)
# everything else that was GNOME blue becomes the SIOS assistant blue
for a, b in {"#3584e4": AI, "#185fb4": AI_INK, "#4a90d9": "#7d9dff", "#f6f5f4": "#f7f7f5", "#f8f8f7": "#fafaf9"}.items():
    svg = re.sub(a, b, svg, flags=re.I)
open(os.path.join(out, "SIOS.svg"), "w").write(svg)

cfg = open(os.path.join(src, "KvGnome.kvconfig")).read()
cfg = re.sub(r"^author=.*$", "author=SIOS (from KvGnome by Tsu Jan)", cfg, count=1, flags=re.M)
cfg = re.sub(r"^comment=.*$", "comment=SIOS: light surfaces, soft blue selection, the assistant blue for focus", cfg, count=1, flags=re.M)
colors = {
    "window.color": "#f7f7f5", "inactive.window.color": "#f7f7f5",
    "base.color": "#ffffff", "inactive.base.color": "#ffffff",
    "alt.base.color": "#f7f7f5", "inactive.alt.base.color": "#f7f7f5",
    "button.color": "#ffffff", "mid.light.color": "#efefeb", "mid.color": "#e4e4df", "dark.color": "#cfcfc9",
    "highlight.color": AI, "inactive.highlight.color": AI,
    "text.color": "#1d1d1f", "window.text.color": "#1d1d1f", "button.text.color": "#1d1d1f",
    "inactive.text.color": "#1d1d1fc8", "inactive.window.text.color": "#5c5c59",
    "disabled.text.color": "#8b8b86", "tooltip.base.color": "#1b2027", "tooltip.text.color": "#ffffff",
    "link.color": AI_INK, "link.visited.color": "#7b4fe0",
}
for k, v in colors.items():
    if re.search(rf"^{re.escape(k)}=", cfg, flags=re.M):
        cfg = re.sub(rf"^{re.escape(k)}=.*$", f"{k}={v}", cfg, flags=re.M)
    else:
        cfg = cfg.replace("[GeneralColors]\n", f"[GeneralColors]\n{k}={v}\n", 1)
# selected rows: blue text on the soft tint
def itemview(m):
    block = m.group(0)
    for k, v in {"text.press.color": AI_INK, "text.toggle.color": AI_INK, "text.toggle.inactive.color": AI_INK,
                 "text.normal.color": "#1d1d1f", "text.focus.color": "#1d1d1f"}.items():
        block = re.sub(rf"^{re.escape(k)}=.*$", f"{k}={v}", block, flags=re.M)
    return block
cfg = re.sub(r"^\[ItemView\][\s\S]*?(?=^\[)", itemview, cfg, flags=re.M)
# other black text in the theme follows our ink colour
cfg = re.sub(r"=black$", "=#1d1d1f", cfg, flags=re.M)
open(os.path.join(out, "SIOS.kvconfig"), "w").write(cfg)
print("wrote", out)
