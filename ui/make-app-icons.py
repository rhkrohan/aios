#!/usr/bin/env python3
"""SIOS app icons (owner's pick, 2026-10-14: "P1, Objects"): each app is the thing
itself, with soft depth and no tile. Written to the hicolor theme as
org.sios.<app>.svg; each app's desktop file names its icon.
Run from the repo root: python3 ui/make-app-icons.py"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

uid=[0]
def nid(p="p"):
    uid[0]+=1; return f"{p}{uid[0]}"
C={"files":("#ffcf6b","#e8a33d","#b86f12"),"store":("#5ed39b","#23a26b","#14704a"),"monitor":("#ff9d66","#ef6a2e","#b3461a"),
   "settings":("#b3bcc7","#7b8794","#4c5662"),"ask":("#b7a8ff","#6c7cff","#4453d6"),"approvals":("#6fd6e6","#2aa3b8","#1a7180")}
NAMES=[("Files","files","Fi"),("Store","store","St"),("Monitor","monitor","Mo"),("Settings","settings","Se"),("Ask SIOS","ask","As"),("Approvals","approvals","Ap")]

# filled symbols, drawn in a 48 box; f(light, mid, dark) -> svg fragment
def sym(key,a,b,d,white=False):
    W="#ffffff"
    if key=="files":
        g=nid()
        if white: return f'<path d="M7 13a3 3 0 0 1 3-3h9l4 4h15a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill="{W}"/><path d="M7 20h34" stroke="{b}" stroke-width="2.5" opacity=".35"/>'
        return (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>'
                f'<path d="M6 12a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v4H6z" fill="{d}"/>'
                f'<rect x="11" y="13" width="26" height="14" rx="2" fill="#ffffff"/><rect x="14" y="16" width="20" height="13" rx="2" fill="#eef2f7"/>'
                f'<path d="M6 19a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="url(#{g})"/>'
                f'<path d="M6 19a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v1.5H6z" fill="#ffffff" opacity=".35"/>')
    if key=="store":
        g=nid()
        body=f'<path d="M10 16h28l-2 22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="{W if white else "url(#"+g+")"}"/>'
        handle=f'<path d="M18 19v-4a6 6 0 0 1 12 0v4" fill="none" stroke="{(b if white else d)}" stroke-width="2.6" stroke-linecap="round"/>'
        if white: return body+f'<path d="M18 19v-4a6 6 0 0 1 12 0v4" fill="none" stroke="{b}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/><circle cx="24" cy="29" r="3.2" fill="{b}" opacity=".55"/>'
        return (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>'
                +body+f'<path d="M10 16h28l-.3 3.5H10.3z" fill="#ffffff" opacity=".3"/>'+handle+f'<circle cx="24" cy="29" r="3.2" fill="#ffffff" opacity=".9"/>')
    if key=="monitor":
        g=nid()
        if white: return f'<path d="M8 32a16 16 0 0 1 32 0" fill="none" stroke="{W}" stroke-width="5" stroke-linecap="round"/><path d="M24 32l7-9" stroke="{W}" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="32" r="3.5" fill="{W}"/>'
        return (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{d}"/></linearGradient></defs>'
                f'<path d="M8 33a16 16 0 0 1 32 0" fill="none" stroke="#e6e9ee" stroke-width="5" stroke-linecap="round"/>'
                f'<path d="M8 33a16 16 0 0 1 26.6-12" fill="none" stroke="url(#{g})" stroke-width="5" stroke-linecap="round"/>'
                f'<path d="M24 33l7-9" stroke="#2b333d" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="33" r="3.6" fill="#2b333d"/><circle cx="24" cy="33" r="1.4" fill="#ffffff"/>')
    if key=="settings":
        rows=((14,30),(24,16),(34,26))
        if white: return "".join(f'<rect x="8" y="{y-3}" width="32" height="6" rx="3" fill="{W}" opacity=".45"/><circle cx="{x}" cy="{y}" r="5" fill="{W}"/>' for y,x in rows)
        return "".join(f'<rect x="8" y="{y-2.5}" width="32" height="5" rx="2.5" fill="#dfe3e8"/><rect x="8" y="{y-2.5}" width="{x-8}" height="5" rx="2.5" fill="{b}"/><circle cx="{x}" cy="{y}" r="5" fill="#ffffff" stroke="{d}" stroke-opacity=".35"/>' for y,x in rows)
    if key=="ask":
        g=nid("r")
        if white: return f'<circle cx="24" cy="24" r="14" fill="{W}"/><path d="M24 14.5c1.4 4.8 4.7 8.1 9.5 9.5-4.8 1.4-8.1 4.7-9.5 9.5-1.4-4.8-4.7-8.1-9.5-9.5 4.8-1.4 8.1-4.7 9.5-9.5z" fill="{b}"/>'
        return (f'<defs><radialGradient id="{g}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="{a}"/><stop offset="1" stop-color="{d}"/></radialGradient></defs>'
                f'<circle cx="24" cy="24" r="16" fill="url(#{g})"/>'
                f'<ellipse cx="24" cy="24" rx="16" ry="6" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2" transform="rotate(-25 24 24)"/>'
                f'<ellipse cx="24" cy="24" rx="16" ry="6" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.2" transform="rotate(35 24 24)"/>')
    if key=="approvals":
        g=nid()
        shield="M24 6l14 5v11c0 9-6 15.5-14 19-8-3.5-14-10-14-19V11z"
        if white: return f'<path d="{shield}" fill="{W}"/><path d="M18 24l4.5 4.5L31 20" fill="none" stroke="{b}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'
        return (f'<defs><linearGradient id="{g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{d}"/></linearGradient></defs>'
                f'<path d="{shield}" fill="url(#{g})"/><path d="M24 6l14 5v3L24 9 10 14v-3z" fill="#ffffff" opacity=".35"/>'
                f'<path d="M18 24l4.5 4.5L31 20" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>')

def svg(inner, size=80): return f'<svg viewBox="0 0 80 80" width="{size}" height="{size}">{inner}</svg>'
def shadow(cx=40,cy=70,rx=24): return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="4" fill="#0a1428" opacity=".18"/>'

def P1(key,mono):  # objects: no tile, the thing itself, soft ground shadow
    a,b,d=C[key]; return svg(shadow()+f'<g transform="translate(6 4) scale(1.42)">{sym(key,a,b,d)}</g>')

APPS = {"files": "files", "store": "store", "monitor": "monitor", "settings": "settings", "ask": "ask", "approve": "approvals"}
out = ROOT / "system_files/usr/share/icons/hicolor/scalable/apps"
out.mkdir(parents=True, exist_ok=True)
for app, key in APPS.items():
    # fill the square: the dock and app grid show icons at a fixed size, so margin reads as small
    icon = (P1(key, "").replace('<ellipse cx="40" cy="70" rx="24" ry="4"', '<ellipse cx="40" cy="66.5" rx="22" ry="2.6"')
            .replace('translate(6 4) scale(1.42)', 'translate(1 1) scale(1.62)').replace('viewBox="0 0 80 80"', 'viewBox="11 9 58 58"')).replace('width="80" height="80"', 'width="128" height="128"').replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    (out / f"org.sios.{app}.svg").write_text(icon + "\n")
print(f"{len(APPS)} app icons in {out.relative_to(ROOT)}")
