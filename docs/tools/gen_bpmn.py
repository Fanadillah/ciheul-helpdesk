#!/usr/bin/env python3
"""Generate the Helpdesk swimlane BPMN diagram (SVG + editable draw.io)."""
from pathlib import Path
import html

OUT = Path(__file__).resolve().parents[1]
ASSETS = OUT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

W, H = 1587, 1122
TITLE = "BPMN Swimlane — Aplikasi Helpdesk"
SUBTITLE = ("Alur tiket & live chat: Customer · Live Chat System · "
            "CS Agent · Supervisor · Admin")
FONT = "Segoe UI, Arial, Helvetica, sans-serif"
INK = "#0F172A"
MUTED = "#475569"
LINE = "#334155"

COLS = [170 + 103 * i for i in range(14)]

LANES = [
    ("Customer", 130, 330, "#F8FAFC", "#2563EB"),
    ("Live Chat System\n(Widget / Web /\nMobile App)", 330, 535, "#F1F5F9", "#475569"),
    ("Customer Support\n(CS Agent)", 535, 745, "#F0FDF4", "#059669"),
    ("Supervisor", 745, 905, "#FFFBEB", "#D97706"),
    ("Admin\n(periodik)", 905, 1035, "#FAF5FF", "#7C3AED"),
]
ROW = {"cust": 210, "sys1": 395, "sys2": 475, "cs1": 610, "cs2": 690,
       "sup": 825, "adm": 975}
TASK_W, TASK_H = 90, 62
GW = 44
GW_LABEL_DX = {"S2": -30, "A3": -32, "A6": -36}
EV_R = 18
FS = 8.4          # task font size
LH = 10.2         # task line height

NODES = {}


class Shape:
    def __init__(self, cx, cy, w, h):
        self.cx, self.cy, self.w, self.h = cx, cy, w, h
        self.left, self.right = cx - w / 2, cx + w / 2
        self.top, self.bottom = cy - h / 2, cy + h / 2


def node(nid, kind, col, row, label, lane):
    w = {"task": TASK_W, "gw": GW, "start": EV_R * 2, "end": EV_R * 2}[kind]
    h = {"task": TASK_H, "gw": GW, "start": EV_R * 2, "end": EV_R * 2}[kind]
    NODES[nid] = dict(id=nid, kind=kind, label=label, lane=lane,
                      x=COLS[col], y=ROW[row], w=w, h=h,
                      g=Shape(COLS[col], ROW[row], w, h))
    return NODES[nid]


# ---- Customer -------------------------------------------------------------
node("C0", "start", 0, "cust", "Butuh\nbantuan", "Customer")
node("C1", "task", 1, "cust", "Buka Live Chat\nWidget / App", "Customer")
node("C2", "task", 2, "cust", "Isi pre-chat &\nkirim kendala", "Customer")
node("C3", "task", 7, "cust", "Terima balasan &\nkirim info", "Customer")
node("C4", "task", 12, "cust", "Konfirmasi selesai\n& isi CSAT", "Customer")
node("C5", "end", 13, "cust", "Selesai", "Customer")

# ---- Live chat system -----------------------------------------------------
node("S1", "task", 2, "sys1", "Buat sesi chat &\ntiket otomatis", "System")
node("S2", "gw", 3, "sys1", "AI aktif?", "System")
node("S3", "task", 4, "sys1", "AI jawab + artikel\nknowledge base", "System")
node("S4", "task", 5, "sys1", "Klasifikasi &\nprioritas, SLA,\nantrean", "System")
node("S5", "task", 6, "sys1", "Notifikasi realtime\nke agent", "System")
node("S6", "task", 7, "sys2", "Relay & sinkron\npesan realtime\nantar kanal", "System")
node("S7", "task", 9, "sys2", "Monitor SLA &\neskalasi otomatis", "System")
node("S8", "task", 12, "sys2", "Simpan CSAT &\nauto-close tiket", "System")

# ---- CS agent -------------------------------------------------------------
node("A1", "task", 6, "cs1", "Ambil tiket dari\nantrean", "CS")
node("A2", "task", 7, "cs1", "Verifikasi &\nanalisis kendala", "CS")
node("A3", "gw", 8, "cs1", "Eskalasi L2?", "CS")
node("A4", "task", 9, "cs1", "Beri solusi /\ntroubleshooting", "CS")
node("A5", "task", 10, "cs2", "Tangani eskalasi\n(L2)", "CS")
node("A6", "gw", 10, "cs1", "Teratasi?", "CS")
node("A7", "task", 11, "cs1", "Set Resolved +\nrangkuman solusi", "CS")

# ---- Supervisor -----------------------------------------------------------
node("P1", "task", 9, "sup", "Review eskalasi &\ntentukan level", "Supervisor")
node("P2", "task", 10, "sup", "Setujui & pantau\npenanganan", "Supervisor")
node("P3", "task", 12, "sup", "Tinjau CSAT rendah\n& kualitas layanan", "Supervisor")

# ---- Admin ----------------------------------------------------------------
node("D1", "task", 3, "adm", "Kelola user,\nrole & izin", "Admin")
node("D2", "task", 5, "adm", "Kelola kategori,\nSLA & jam kerja", "Admin")
node("D3", "task", 7, "adm", "Kelola knowledge\nbase & canned", "Admin")
node("D4", "task", 11, "adm", "Dashboard, audit\nlog & laporan", "Admin")

EDGES = []


def edge(src, dst, wps=(), label="", dashed=False, both=False, label_at=None,
         label_dy=-8):
    EDGES.append(dict(src=src, dst=dst, wps=list(wps), label=label,
                      dashed=dashed, both=both, label_at=label_at,
                      label_dy=label_dy))


def G(nid):
    return NODES[nid]["g"]


edge("C0", "C1")
edge("C1", "C2")
edge("C2", "S1", label="pesan masuk", label_at=(G("C2").cx, 300))
edge("S1", "S2")
edge("S2", "S3", label="Ya", label_at=(530, 395))
edge("S2", "S4", wps=[(G("S2").cx, 447), (G("S4").left - 11, 447),
                      (G("S4").left - 11, G("S4").cy)],
     label="Tidak", label_at=(560, 447))
edge("S3", "S4")
edge("S4", "S5")
edge("S5", "A1", label="push notif", label_at=(G("S5").cx, 500))
edge("A1", "A2")
edge("A2", "A3")
edge("A3", "A4", label="Tidak", label_at=(1024, 610))
edge("A3", "P1", wps=[(G("A3").cx, 782), (G("P1").cx, 782)],
     label="Ya", label_at=(G("A3").cx + 26, 782))
edge("P1", "P2")
edge("P2", "A5")
edge("A4", "A6")
edge("A5", "A6")
edge("A6", "A7", label="Ya", label_at=(1251, 610))
edge("A6", "A4", wps=[(G("A6").cx, 556), (G("A4").cx, 556)],
     label="Belum teratasi", label_at=(1148, 556))
edge("A7", "C4", wps=[(G("A7").cx, 350), (1355, 350), (1355, 210)])
edge("C4", "S8", label="konfirmasi", label_at=(G("C4").cx, 340))
edge("S8", "C5", wps=[(G("S8").right + 22, G("S8").cy),
                      (G("S8").right + 22, 210)])
edge("S7", "P1", wps=[(G("S7").cx, 545), (1034, 545), (1034, 762),
                      (G("P1").cx, 762)],
     label="SLA breach", dashed=True, label_at=(1064, 762))
edge("S8", "P3", dashed=True, label="feedback CSAT",
     label_at=(G("S8").cx, 655))
edge("D1", "D2")
edge("D2", "D3")
edge("D3", "D4")

# realtime chat channel (bidirectional message flows)
edge("C3", "S6", wps=[(G("C3").right + 24, G("C3").cy),
                     (G("C3").right + 24, G("S6").cy)],
     dashed=True, both=True, label="chat realtime",
     label_at=(G("C3").right + 24, 300))
edge("A2", "S6", dashed=True, both=True)
edge("S3", "C3", wps=[(G("S3").cx, 345), (877, 345), (877, G("C3").bottom)],
     dashed=True, label="jawaban AI", label_at=(760, 345))


def esc(t):
    return html.escape(t, quote=True)


def text_block(cx, cy, label, size, lh, weight="600", fill=INK, anchor="middle",
               maxw=None):
    lines = label.split("\n")
    if maxw:
        widest = max(len(l) for l in lines)
        est = widest * size * 0.54
        if est > maxw:
            size = size * maxw / est
            lh = size * 1.2
    y0 = cy - lh * len(lines) / 2 + lh * 0.78
    return "\n".join(
        f'<text x="{cx:.1f}" y="{y0 + i * lh:.1f}" font-size="{size}" '
        f'text-anchor="{anchor}" fill="{fill}" font-weight="{weight}">{esc(l)}</text>'
        for i, l in enumerate(lines))


def border_pt(nd, toward):
    g = nd["g"]
    dx, dy = toward[0] - g.cx, toward[1] - g.cy
    if dx == 0 and dy == 0:
        return g.cx, g.cy
    hw, hh = g.w / 2, g.h / 2
    if nd["kind"] in ("start", "end"):
        t = hw / ((dx * dx + dy * dy) ** 0.5)
    elif nd["kind"] == "gw":
        t = 1 / (abs(dx) / hw + abs(dy) / hh)
    else:
        t = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
    return g.cx + dx * t, g.cy + dy * t


def edge_points(e):
    pts = [(G(e["src"]).cx, G(e["src"]).cy)] + e["wps"] + \
          [(G(e["dst"]).cx, G(e["dst"]).cy)]
    forward = pts[1]
    backward = pts[-2]
    pts[0] = border_pt(NODES[e["src"]], forward)
    pts[-1] = border_pt(NODES[e["dst"]], backward)
    return pts


def path_d(pts, r=7):
    out = [f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"]
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        d1 = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 or 1
        d2 = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 or 1
        rr = min(r, d1 / 2, d2 / 2)
        ax, ay = (x1 - x0) / d1, (y1 - y0) / d1
        bx, by = (x2 - x1) / d2, (y2 - y1) / d2
        out.append(f"L{x1 - ax * rr:.1f},{y1 - ay * rr:.1f}")
        out.append(f"Q{x1:.1f},{y1:.1f} {x1 + bx * rr:.1f},{y1 + by * rr:.1f}")
    out.append(f"L{pts[-1][0]:.1f},{pts[-1][1]:.1f}")
    return " ".join(out)


svg = []
add = svg.append
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
    f'viewBox="0 0 {W} {H}" font-family="{FONT}">')
add("""<defs>
<marker id="ar" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="7"
        markerHeight="7" orient="auto-start-reverse">
  <path d="M0,0 L10,5 L0,10 z" fill="#334155"/>
</marker>
<marker id="ar-d" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="7"
        markerHeight="7" orient="auto-start-reverse">
  <path d="M0,0 L10,5 L0,10 z" fill="#64748B"/>
</marker>
<filter id="sh" x="-25%" y="-25%" width="150%" height="150%">
  <feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-opacity="0.16"/>
</filter>
</defs>""")
add(f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>')

# header
add(text_block(44, 40, TITLE, 19, 23, "700", INK, "start"))
add(text_block(44, 63, SUBTITLE, 10, 12.5, "400", MUTED, "start"))
add(text_block(W - 32, 36, "Take Home Programming Test — Software Engineer",
               9.8, 12, "600", MUTED, "end"))
add(text_block(W - 32, 53, "Ciheul Technologies · 22 Oktober 2026",
               9, 11, "400", "#64748B", "end"))
add(f'<line x1="44" y1="86" x2="{W - 32}" y2="86" stroke="#CBD5E1"/>')

pool_top, pool_bot = LANES[0][1] - 8, LANES[-1][2]
add(f'<rect x="10" y="{pool_top}" width="{W - 42}" height="{pool_bot - pool_top + 8}" '
    f'rx="8" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.6"/>')
add(f'<rect x="10" y="{pool_top}" width="30" height="{pool_bot - pool_top + 8}" '
    f'rx="8" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1.6"/>')
add(f'<text x="26" y="{(pool_top + pool_bot) / 2}" font-size="9.4" font-weight="700" '
    f'fill="#334155" text-anchor="middle" '
    f'transform="rotate(-90 26 {(pool_top + pool_bot) / 2})">'
    f'Helpdesk Ticketing Process</text>')

for name, top, bot, fill, accent in LANES:
    add(f'<rect x="40" y="{top}" width="98" height="{bot - top}" fill="{fill}" '
        f'stroke="#CBD5E1"/>')
    add(f'<rect x="138" y="{top}" width="{W - 170}" height="{bot - top}" '
        f'fill="#FFFFFF" stroke="#D7DEE8"/>')
    add(f'<rect x="40" y="{top}" width="4" height="{bot - top}" fill="{accent}" '
        f'opacity="0.85"/>')
    add(text_block(89, (top + bot) / 2, name, 9.2, 11, "700", "#1E293B"))

LN = {"Customer": ("#F8FAFC", "#2563EB"), "System": ("#F1F5F9", "#475569"),
      "CS": ("#F0FDF4", "#059669"), "Supervisor": ("#FFFBEB", "#D97706"),
      "Admin": ("#FAF5FF", "#7C3AED")}

for nd in NODES.values():
    x, y, w, h = nd["x"], nd["y"], nd["w"], nd["h"]
    accent = LN[nd["lane"]][1]
    if nd["kind"] == "task":
        add(f'<rect x="{x - w / 2}" y="{y - h / 2}" width="{w}" height="{h}" '
            f'rx="8" fill="#FFFFFF" stroke="{accent}" stroke-width="1.4" '
            f'filter="url(#sh)"/>')
        add(f'<rect x="{x - w / 2}" y="{y - h / 2 + 4}" width="4.5" '
            f'height="{h - 8}" rx="2" fill="{accent}" opacity="0.9"/>')
        add(text_block(x + 3, y - 0.5, nd["label"], FS, LH, maxw=80))
    elif nd["kind"] == "gw":
        add(f'<polygon points="{x},{y - h / 2} {x + w / 2},{y} {x},{y + h / 2} '
            f'{x - w / 2},{y}" fill="#FEF3C7" stroke="#B45309" stroke-width="1.4" '
            f'filter="url(#sh)"/>')
        add(f'<path d="M{x - 6.5},{y - 6.5} L{x + 6.5},{y + 6.5} M{x + 6.5},{y - 6.5} '
            f'L{x - 6.5},{y + 6.5}" stroke="#B45309" stroke-width="1.9"/>')
        gx = x + GW_LABEL_DX.get(nd["id"], 0)
        add(text_block(gx, y + h / 2 + 15, nd["label"], 7.9, 9.1, "700", "#92400E"))
    elif nd["kind"] == "start":
        add(f'<circle cx="{x}" cy="{y}" r="{EV_R}" fill="#DCFCE7" stroke="#15803D" '
            f'stroke-width="2"/>')
        add(text_block(x, y + EV_R + 13, nd["label"], 7.9, 9.1, "700", "#166534"))
    else:
        add(f'<circle cx="{x}" cy="{y}" r="{EV_R}" fill="#FEE2E2" stroke="#B91C1C" '
            f'stroke-width="2.4"/>')
        add(text_block(x, y + EV_R + 13, nd["label"], 7.9, 9.1, "700", "#991B1B"))

# timer boundary event on the SLA monitor task
s7 = G("S7")
tx, ty = s7.right - 6, s7.top + 6
add(f'<circle cx="{tx}" cy="{ty}" r="9.5" fill="#FFFFFF" stroke="#B45309" '
    f'stroke-width="1.5"/>')
add(f'<circle cx="{tx}" cy="{ty}" r="6.6" fill="none" stroke="#B45309" '
    f'stroke-width="1"/>')
add(f'<path d="M{tx},{ty - 4.4} L{tx},{ty} L{tx + 3.4},{ty + 1.7}" fill="none" '
    f'stroke="#B45309" stroke-width="1.2" stroke-linecap="round"/>')

for e in EDGES:
    pts = edge_points(e)
    dd = 1 if e["dashed"] else 0
    stroke = "#64748B" if dd else LINE
    dash = ' stroke-dasharray="5 4"' if dd else ""
    marker = "url(#ar-d)" if dd else "url(#ar)"
    start = ' marker-start="url(#ar-d)"' if e["both"] else ""
    add(f'<path d="{path_d(pts)}" fill="none" stroke="{stroke}" '
        f'stroke-width="{1.2 if dd else 1.45}"{dash} marker-end="{marker}"{start}/>')
    if e["label"]:
        lx, ly = e["label_at"]
        lw = len(e["label"]) * 4.7 + 9
        add(f'<rect x="{lx - lw / 2:.1f}" y="{ly + e["label_dy"] - 9:.1f}" '
            f'width="{lw:.1f}" height="12" rx="3" fill="#FFFFFF" fill-opacity="0.9"/>')
        add(f'<text x="{lx:.1f}" y="{ly + e["label_dy"]:.1f}" font-size="7.8" '
            f'font-weight="600" text-anchor="middle" fill="#475569">'
            f'{esc(e["label"])}</text>')

# notes
def note(cx, cy, w, lines, h=None):
    h = h or (len(lines) * 10.2 + 12)
    add(f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="{h}" rx="5" '
        f'fill="#FFFBEB" stroke="#D6B36A" stroke-dasharray="4 3" '
        f'stroke-width="1"/>')
    y0 = cy - h / 2 + 13
    for i, ln in enumerate(lines):
        add(f'<text x="{cx - w / 2 + 8}" y="{y0 + i * 10.2}" font-size="7.6" '
            f'fill="#78350F" font-weight="500">{esc(ln)}</text>')


note(1128, 210, 250, [
    "Catatan: outbox offline + reconnect otomatis.",
    "Pesan tersimpan lokal lalu dikirim ulang saat",
    "koneksi pulih, tanpa duplikasi (client_message_id)."], 44)
note(1148, 390, 250, [
    "Catatan: satu koneksi Socket.IO per klien, room per tiket,",
    "heartbeat, replay pesan terlewat (sync:since), delivery/read",
    "receipt, dan fallback polling saat websocket diblokir."], 44)

note(500, 825, 320, [
    "Supervisor memantau SLA & beban kerja agent, serta",
    "meninjau eskalasi otomatis dari timer SLA dan",
    "tiket dengan rating CSAT rendah."], 44)

note(420, 610, 340, [
    "Aturan SLA: first response 15 menit, resolusi 1x24 jam.",
    "Prioritas: Low / Medium / High / Urgent. Pelanggaran SLA",
    "memicu eskalasi otomatis + notifikasi ke Supervisor."], 44)

# legend
ly = 1063
add(f'<rect x="44" y="{ly - 19}" width="{W - 88}" height="56" rx="6" fill="#F8FAFC" '
    f'stroke="#E2E8F0"/>')
lx = 62
add(f'<circle cx="{lx}" cy="{ly}" r="8" fill="#DCFCE7" stroke="#15803D" stroke-width="2"/>')
add(f'<text x="{lx + 15}" y="{ly + 3.5}" font-size="8.2" fill="{MUTED}">Start / End event</text>')
lx = 177
add(f'<rect x="{lx - 15}" y="{ly - 9}" width="30" height="18" rx="4" fill="#FFF" '
    f'stroke="#059669" stroke-width="1.4"/>')
add(f'<text x="{lx + 22}" y="{ly + 3.5}" font-size="8.2" fill="{MUTED}">Task</text>')
lx = 255
add(f'<polygon points="{lx},{ly - 10} {lx + 10},{ly} {lx},{ly + 10} {lx - 10},{ly}" '
    f'fill="#FEF3C7" stroke="#B45309" stroke-width="1.4"/>')
add(f'<text x="{lx + 17}" y="{ly + 3.5}" font-size="8.2" fill="{MUTED}">Gateway</text>')
lx = 355
add(f'<circle cx="{lx}" cy="{ly}" r="8" fill="#FFF" stroke="#B45309" stroke-width="1.5"/>')
add(f'<path d="M{lx},{ly - 4} L{lx},{ly} L{lx + 3},{ly + 1.5}" fill="none" '
    f'stroke="#B45309" stroke-width="1.2"/>')
add(f'<text x="{lx + 15}" y="{ly + 3.5}" font-size="8.2" fill="{MUTED}">Timer boundary</text>')
lx = 475
add(f'<line x1="{lx - 16}" y1="{ly}" x2="{lx + 16}" y2="{ly}" stroke="{LINE}" '
    f'stroke-width="1.45" marker-end="url(#ar)"/>')
add(f'<text x="{lx + 23}" y="{ly + 3.5}" font-size="8.2" fill="{MUTED}">Sequence flow</text>')
lx = 593
add(f'<line x1="{lx - 16}" y1="{ly}" x2="{lx + 16}" y2="{ly}" stroke="#64748B" '
    f'stroke-width="1.25" stroke-dasharray="5 4" marker-end="url(#ar-d)"/>')
add(f'<text x="{lx + 23}" y="{ly + 3.5}" font-size="8.2" fill="{MUTED}">'
    f'Message flow (realtime)</text>')
add(f'<text x="782" y="{ly + 3.5}" font-size="8" fill="{MUTED}">'
    f'Status tiket: New → Assigned → On Progress ⇄ Pending → Resolved → Closed '
    f'(reopen ≤ 7 hari)</text>')
add(f'<text x="{W - 62}" y="{ly + 3.5}" font-size="8" text-anchor="end" '
    f'fill="#94A3B8">Confidential</text>')
add("</svg>")

svg_path = ASSETS / "bpmn-helpdesk.svg"
svg_path.write_text("\n".join(svg), encoding="utf-8")
print("wrote", svg_path)

# ---------------------------------------------------------------- draw.io ---
STYLE = {
    "task": "rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=%(a)s;fontSize=10;fontStyle=1;arcSize=12;",
    "gw": "rhombus;whiteSpace=wrap;html=1;fillColor=#FEF3C7;strokeColor=#B45309;fontSize=9;",
    "start": "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#DCFCE7;strokeColor=#15803D;fontSize=9;",
    "end": "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#FEE2E2;strokeColor=#B91C1C;fontSize=9;",
}
cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
for i, (name, top, bot, fill, accent) in enumerate(LANES):
    cells.append(
        f'<mxCell id="lane{i}" value="{esc(name)}" style="swimlane;horizontal=0;'
        f'startSize=70;fillColor={fill};strokeColor=#CBD5E1;fontSize=11;fontStyle=1;" '
        f'vertex="1" parent="1"><mxGeometry x="40" y="{top}" width="{W - 120}" '
        f'height="{bot - top}" as="geometry"/></mxCell>')
for nd in NODES.values():
    style = STYLE[nd["kind"]].replace("%(a)s", LN[nd["lane"]][1])
    cells.append(
        f'<mxCell id="{nd["id"]}" value="{esc(nd["label"])}" style="{style}" vertex="1" '
        f'parent="1"><mxGeometry x="{nd["x"] - nd["w"] / 2}" y="{nd["y"] - nd["h"] / 2}" '
        f'width="{nd["w"]}" height="{nd["h"]}" as="geometry"/></mxCell>')
for i, e in enumerate(EDGES):
    pts = edge_points(e)
    wp = "".join(f'<mxPoint x="{p[0]:.1f}" y="{p[1]:.1f}"/>' for p in pts[1:-1])
    style = ("edgeStyle=none;rounded=0;html=1;endArrow=block;endFill=1;"
             + ("dashed=1;strokeColor=#64748B;" if e["dashed"] else "strokeColor=#334155;")
             + ("startArrow=block;startFill=1;" if e["both"] else ""))
    cells.append(
        f'<mxCell id="e{i}" value="{esc(e["label"])}" style="{style}" edge="1" '
        f'parent="1" source="{e["src"]}" target="{e["dst"]}"><mxGeometry relative="1" '
        f'as="geometry">{wp}</mxGeometry></mxCell>')

drawio = ('<mxfile host="app.diagrams.net"><diagram id="helpdesk-bpmn" '
          'name="BPMN Helpdesk"><mxGraphModel dx="1587" dy="1122" grid="1" '
          'gridSize="10" page="1" pageWidth="1587" pageHeight="1122" math="0" '
          'shadow="0"><root>' + "".join(cells) +
          '</root></mxGraphModel></diagram></mxfile>')
(OUT / "BPMN-Helpdesk.drawio").write_text(drawio, encoding="utf-8")
print("wrote", OUT / "BPMN-Helpdesk.drawio")
