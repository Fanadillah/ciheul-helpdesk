#!/usr/bin/env python3
"""Build the Helpdesk WBS workbook (docs/WBS-Helpdesk.xlsx)."""
from pathlib import Path
import math

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parents[1] / "WBS-Helpdesk.xlsx"

NAVY = "0F172A"
BLUE = "1D4ED8"
SLATE = "475569"
GRID = "CBD5E1"
BAND = "F1F5F9"
MOD_FILL = "DBEAFE"
TOTAL_FILL = "E2E8F0"
WHITE = "FFFFFF"
PRIO = {"Must": ("FEE2E2", "991B1B"), "Should": ("FEF3C7", "92400E"),
        "Could": ("E2E8F0", "334155")}
STATUS = {"Done": ("DCFCE7", "166534"), "In Progress": ("DBEAFE", "1E40AF"),
          "Planned": ("F8FAFC", "475569")}

thin = Side(style="thin", color=GRID)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

wb = Workbook()

# ------------------------------------------------------------------ data ----
# code, name, desc, ref, prio, hours, dep, acceptance, day
ROWS = [
    ("1", 1, "Aplikasi Helpdesk (end-to-end)",
     "Live Chat Widget + Web App (agent) + Mobile App realtime, seluruh fitur wajib "
     "dan fitur opsional pada instruksi take home test.",
     "Pool", "Must", 92.5, "—",
     "Semua deliverable terkumpul: BPMN PDF, WBS XLSX, source code 1 repo, APK.",
     "Hari 1-4", "In Progress"),

    ("1.1", 2, "Analisis & Desain",
     "Pemodelan proses bisnis, arsitektur, skema data, dan kontrak integrasi.",
     "BPMN", "Must", 10, "—",
     "Dokumen analisis disetujui dan menjadi acuan implementasi.", "Hari 1", "In Progress"),
    ("1.1.1", 3, "BPMN swimlane end-to-end",
     "5 lane (Customer, Live Chat System, CS Agent, Supervisor, Admin); alur tiket, "
     "eskalasi L2, timer SLA, CSAT, auto-close.",
     "Semua", "Must", 3, "1.1", "PDF A3 berisi seluruh alur utama + cabang eskalasi.",
     "Hari 1", "Done"),
    ("1.1.2", 3, "WBS modul & fitur",
     "Dekomposisi modul, fitur, estimasi, dependency, acceptance criteria, dan target harian.",
     "Semua", "Must", 2, "1.1", "WBS dapat ditelusuri ke elemen BPMN (kolom Ref BPMN).",
     "Hari 1", "Done"),
    ("1.1.3", 3, "ERD & database schema",
     "13+ tabel: users, customers, tickets, ticket_messages, ticket_events, attachments, "
     "categories, canned_responses, kb_articles, devices, notifications, ai_logs.",
     "S1, S4, S6", "Must", 2, "1.1", "ERD final + file migrasi SQL berjalan tanpa error.",
     "Hari 1", "Planned"),
    ("1.1.4", 3, "Kontrak REST API & event Socket.IO",
     "Daftar endpoint, payload, event realtime (message:new, ack, typing, presence, "
     "ticket:update), aturan error & idempotensi.",
     "S6, A2", "Must", 1.5, "1.1", "Dokumentasi API konsisten dipakai web, widget, dan mobile.",
     "Hari 1", "Planned"),
    ("1.1.5", 3, "Wireframe 3 kanal",
     "Wireframe widget chat, dashboard agent, dan mobile app (customer & agent mode).",
     "C1, A1, A2", "Should", 1, "1.1", "Alur utama tiap kanal dapat didemokan tanpa dead-end.",
     "Hari 1", "Planned"),
    ("1.1.6", 3, "Arsitektur realtime & model keamanan",
     "Topologi Socket.IO, reconnect/replay, JWT + refresh token, RBAC 4 role, "
     "validasi upload, rate limit.",
     "S6", "Must", 1, "1.1", "Threat model singkat + diagram arsitektur di README.",
     "Hari 1", "Planned"),

    ("1.2", 2, "Backend Core (Node.js + Express + Socket.IO + SQLite)",
     "API, autentikasi, lifecycle tiket, chat realtime, SLA, notifikasi, AI, laporan.",
     "S1-S8, A1-A7", "Must", 26, "1.1", "Seluruh API teruji dan lolos integration test.",
     "Hari 1-2", "Planned"),
    ("1.2.1", 3, "Scaffold, config, migrasi DB",
     "Struktur folder, env, logger, error handler, migrasi + seed runner, SQLite WAL.",
     "S1", "Must", 1.5, "1.1.3", "`npm run migrate && npm run seed` sukses dari repo bersih.",
     "Hari 1", "Planned"),
    ("1.2.2", 3, "Auth JWT + RBAC 4 role",
     "Login customer/agent/supervisor/admin, refresh token, guard per endpoint & event.",
     "S1, A1, P1, D1", "Must", 3, "1.2.1", "Akses lintas role ditolak (403) dan diuji.",
     "Hari 2", "Planned"),
    ("1.2.3", 3, "Manajemen user & agent",
     "CRUD user, status aktif, penugasan tim, profil agent.",
     "D1", "Must", 1.5, "1.2.2", "Admin dapat menonaktifkan agent; sesi aktif ikut dicabut.",
     "Hari 2", "Planned"),
    ("1.2.4", 3, "Tiket: CRUD & status lifecycle",
     "Validasi transisi New → Assigned → On Progress ⇄ Pending → Resolved → Closed, "
     "reopen ≤ 7 hari, auto-close.",
     "C2, A7, S8", "Must", 3, "1.2.1", "Transisi ilegal ditolak; riwayat status tersimpan.",
     "Hari 2", "Planned"),
    ("1.2.5", 3, "Kategori, prioritas & auto-assign",
     "Kategori dengan SLA default, prioritas Low/Medium/High/Urgent, round-robin agent online.",
     "S4, S5", "Must", 2, "1.2.4", "Tiket baru otomatis mendapat agent & SLA deadline.",
     "Hari 2", "Planned"),
    ("1.2.6", 3, "SLA policy, timer & eskalasi otomatis",
     "First response & resolution target, cron timer, breach → notifikasi supervisor.",
     "S7, P1", "Must", 2.5, "1.2.5", "Uji SLA breach memicu event eskalasi < 1 menit.",
     "Hari 2", "Planned"),
    ("1.2.7", 3, "Chat realtime: room, ack, read, typing, presence",
     "Room per tiket, ack pesan, read receipt, indikator typing, presence agent online.",
     "S6, A2", "Must", 4, "1.2.2", "Dua klien berbeda kanal saling menerima pesan < 300 ms.",
     "Hari 2", "Planned"),
    ("1.2.8", 3, "Idempotensi & replay pesan",
     "client_message_id unik, sequence per tiket, sync:since saat reconnect, outbox offline.",
     "S6", "Must", 3, "1.2.7", "Kirim ulang pesan yang sama tidak menghasilkan duplikat.",
     "Hari 2", "Planned"),
    ("1.2.9", 3, "Lampiran file",
     "Upload gambar/dokumen, validasi mime & ukuran, penyimpanan lokal, URL aman.",
     "S6, C3", "Must", 1.5, "1.2.7", "File > 5 MB dan mime berbahaya ditolak.",
     "Hari 2", "Planned"),
    ("1.2.10", 3, "Notifikasi in-app & device token",
     "Notifikasi tiket/pesan, registrasi token device mobile, penanda sudah dibaca.",
     "S5, S8", "Must", 1.5, "1.2.2", "Agent menerima notifikasi saat tiket baru masuk.",
     "Hari 2", "Planned"),
    ("1.2.11", 3, "CSAT survey & rekap",
     "Survey 1-5 + komentar setelah resolved, rekap rata-rata per agent/kategori.",
     "C4, S8", "Must", 1, "1.2.4", "Rating tersimpan dan tampil di laporan.",
     "Hari 2", "Planned"),
    ("1.2.12", 3, "Audit log & ticket events",
     "Catat perubahan status, assign, eskalasi, dan aksi admin beserta aktor & waktu.",
     "D4, A7", "Must", 1.5, "1.2.4", "Setiap perubahan tiket punya entri audit.",
     "Hari 2", "Planned"),
    ("1.2.13", 3, "Canned response & knowledge base",
     "Template jawaban agent, artikel KB untuk saran AI & self-service.",
     "D3, S3", "Must", 1.5, "1.2.1", "Agent dapat menyisipkan template ke chat.",
     "Hari 2", "Planned"),
    ("1.2.14", 3, "AI auto-reply (adapter + fallback)",
     "Adapter OpenAI-compatible via env, guardrail (hanya info dari KB), fallback "
     "rule-based bila API key tidak ada, logging token & biaya.",
     "S2, S3", "Must", 3, "1.2.13", "Tanpa API key tetap menjawab dari KB; jawaban tercatat.",
     "Hari 2", "Planned"),
    ("1.2.15", 3, "API dashboard & laporan",
     "Volume tiket, first response, resolusi, SLA compliance, CSAT, beban per agent.",
     "D4, P3", "Must", 2, "1.2.11", "Angka laporan konsisten dengan data tiket.",
     "Hari 2", "Planned"),
    ("1.2.16", 3, "Seed data & akun demo",
     "4 role, 3 kategori, 12 tiket contoh, 3 agent, artikel KB, canned response.",
     "D1", "Must", 1, "1.2.1", "Reviewer dapat login & mencoba alur tanpa setup manual.",
     "Hari 2", "Planned"),
    ("1.2.17", 3, "Unit + integration test",
     "Vitest untuk service tiket & SLA; integration test 2 klien Socket.IO + replay.",
     "S6", "Must", 2.5, "1.2.8", "`npm test` hijau dengan coverage service > 70%.",
     "Hari 2", "Planned"),
    ("1.2.18", 3, "Rate limit & hardening",
     "Rate limit auth/chat, sanitasi input, helmet, validasi skema request.",
     "S6", "Should", 1.5, "1.2.2", "Uji brute force login terblokir sementara.",
     "Hari 2", "Planned"),
    ("1.2.19", 3, "Export laporan CSV",
     "Ekspor tiket & CSAT untuk kebutuhan evaluasi supervisor.",
     "D4", "Could", 1.5, "1.2.15", "File CSV terbuka benar di Excel.",
     "Hari 3", "Planned"),

    ("1.3", 2, "Web App — Agent Dashboard",
     "Dashboard realtime untuk CS agent, supervisor, dan admin.",
     "A1-A7, P1-P3, D1-D4", "Must", 14, "1.2", "Agent dapat menangani tiket penuh dari web.",
     "Hari 2-3", "Planned"),
    ("1.3.1", 3, "Setup SPA, routing & state",
     "Vite + React/Vanilla JS terstruktur, layout, tema, state management ringan.",
     "—", "Must", 1.5, "1.1.5", "Build produksi < 1 MB gzip, tanpa error console.",
     "Hari 2", "Planned"),
    ("1.3.2", 3, "Login & route guard",
     "Form login, penyimpanan token aman, redirect sesuai role.",
     "S1", "Must", 1, "1.2.2", "Role tidak berhak tidak bisa membuka halaman admin.",
     "Hari 2", "Planned"),
    ("1.3.3", 3, "Inbox tiket: filter & pencarian",
     "Daftar tiket dengan status, prioritas, assignee, SLA; pencarian kode/subjek.",
     "A1, D4", "Must", 2.5, "1.2.4", "Filter kombinasi menghasilkan daftar yang benar.",
     "Hari 3", "Planned"),
    ("1.3.4", 3, "Detail tiket & chat realtime",
     "Thread pesan, status koneksi, retry, lampiran, riwayat status & audit.",
     "S6, A2", "Must", 3, "1.2.7", "Pesan muncul realtime dari widget & mobile.",
     "Hari 3", "Planned"),
    ("1.3.5", 3, "Aksi tiket",
     "Assign/transfer, ubah status & prioritas, eskalasi L2, reopen, tutup tiket.",
     "A3, A5, A7", "Must", 1.5, "1.3.4", "Setiap aksi tercatat di ticket events.",
     "Hari 3", "Planned"),
    ("1.3.6", 3, "Canned response & internal note",
     "Sisipkan template, catatan internal yang tidak terlihat customer.",
     "D3", "Must", 1.5, "1.2.13", "Internal note tidak pernah terkirim ke kanal customer.",
     "Hari 3", "Planned"),
    ("1.3.7", 3, "SLA badge, timer & CSAT",
     "Countdown SLA, badge breach, tampilan rating CSAT per tiket.",
     "S7, C4", "Must", 1, "1.2.6", "Warna badge berubah sebelum & sesudah breach.",
     "Hari 3", "Planned"),
    ("1.3.8", 3, "Dashboard supervisor & laporan",
     "Grafik volume, SLA compliance, CSAT, beban agent; filter rentang tanggal.",
     "P2, P3, D4", "Must", 1.5, "1.2.15", "Angka dashboard sama dengan API laporan.",
     "Hari 3", "Planned"),
    ("1.3.9", 3, "Admin panel",
     "Kelola user, kategori, kebijakan SLA, knowledge base, canned response.",
     "D1-D3", "Must", 2, "1.2.3", "Perubahan konfigurasi langsung dipakai tiket baru.",
     "Hari 3", "Planned"),
    ("1.3.10", 3, "Notifikasi browser & responsif",
     "Web notification saat tab tidak aktif, layout responsif 1280-1920 px.",
     "S5", "Should", 1, "1.3.4", "Notifikasi muncul saat tab background (izin diberikan).",
     "Hari 3", "Planned"),

    ("1.4", 2, "Live Chat Widget (JavaScript)",
     "Widget embed di kanan bawah, terhubung realtime ke web & mobile.",
     "C1-C3, S6", "Must", 8, "1.2", "Widget dapat dipasang di halaman uji & chat lancar.",
     "Hari 2", "Planned"),
    ("1.4.1", 3, "Embed script & konfigurasi",
     "Satu file JS + snippet, konfigurasi server URL, tema, dan teks sambutan.",
     "C1", "Must", 1.5, "1.2.2", "Snippet satu baris berhasil memuat widget.",
     "Hari 2", "Planned"),
    ("1.4.2", 3, "Bubble & panel chat kanan bawah",
     "Tombol mengambang, panel chat, minimize, badge unread, mobile-friendly.",
     "C1", "Must", 1.5, "1.4.1", "Tampil benar di desktop & mobile viewport.",
     "Hari 2", "Planned"),
    ("1.4.3", 3, "Pre-chat form & sesi guest",
     "Nama, email, kategori; sesi guest persisten tanpa login.",
     "C2, S1", "Must", 1, "1.4.1", "Refresh halaman mempertahankan riwayat sesi.",
     "Hari 2", "Planned"),
    ("1.4.4", 3, "Chat realtime & indikator koneksi",
     "Kirim/terima pesan, status online agent, typing, read receipt.",
     "S6", "Must", 1.5, "1.2.7", "Pesan widget tampil < 1 detik di dashboard agent.",
     "Hari 2", "Planned"),
    ("1.4.5", 3, "Offline queue, retry & dedupe",
     "Simpan pesan saat offline, kirim ulang dengan backoff, cegah duplikat.",
     "S6", "Must", 1.5, "1.2.8", "Matikan jaringan → pesan terkirim sekali setelah pulih.",
     "Hari 2", "Planned"),
    ("1.4.6", 3, "Lampiran & validasi",
     "Upload gambar/dokumen dari widget, batas ukuran & tipe.",
     "S6", "Must", 0.5, "1.2.9", "File valid terkirim, file invalid ditolak dengan pesan.",
     "Hari 2", "Planned"),
    ("1.4.7", 3, "CSAT, end session & persistensi",
     "Form rating setelah resolved, akhiri sesi, sinkron antar tab.",
     "C4", "Must", 0.5, "1.3.7", "Rating masuk ke tiket; dua tab tetap sinkron.",
     "Hari 2", "Planned"),
    ("1.4.8", 3, "Branding & animasi widget",
     "Kustom logo/warna, animasi buka-tutup halus.",
     "—", "Could", 0.5, "1.4.2", "Konfigurasi branding berubah tanpa rebuild.",
     "Hari 3", "Planned"),

    ("1.5", 2, "Mobile App (Flutter)",
     "Aplikasi customer & agent mode, realtime, offline queue, local notification.",
     "C1-C5, A2", "Must", 16, "1.2", "APK release terpasang dan terhubung ke server.",
     "Hari 3", "Planned"),
    ("1.5.1", 3, "Setup proyek, tema & routing",
     "Struktur fitur, tema, go_router, konstanta endpoint.",
     "—", "Must", 1.5, "1.1.4", "`flutter analyze` bersih, build debug sukses.",
     "Hari 3", "Planned"),
    ("1.5.2", 3, "Auth & secure storage",
     "Login customer/agent, simpan token di secure storage, auto-login.",
     "S1", "Must", 1.5, "1.2.2", "Token tidak tersimpan plaintext; logout menghapus sesi.",
     "Hari 3", "Planned"),
    ("1.5.3", 3, "Daftar & detail tiket",
     "List tiket, status, prioritas, detail + riwayat.",
     "A1", "Must", 2.5, "1.5.2", "Data sama dengan web untuk tiket yang sama.",
     "Hari 3", "Planned"),
    ("1.5.4", 3, "Chat realtime customer & agent",
     "Buat tiket, kirim pesan, terima balasan realtime, indikator koneksi.",
     "C3, A2, S6", "Must", 3, "1.2.7", "Chat mobile ↔ widget ↔ web tersambung dua arah.",
     "Hari 3", "Planned"),
    ("1.5.5", 3, "Offline queue, replay & sinkronisasi",
     "Antrean pesan lokal (Hive), reconnect otomatis, sync:since, dedupe.",
     "S6", "Must", 3, "1.2.8", "Uji airplane mode: pesan terkirim tepat sekali.",
     "Hari 3", "Planned"),
    ("1.5.6", 3, "Notifikasi lokal (FCM-ready)",
     "Local notification saat pesan/tiket baru; struktur siap FCM bila config tersedia.",
     "S5", "Must", 1.5, "1.2.10", "Notifikasi muncul saat app di background.",
     "Hari 3", "Planned"),
    ("1.5.7", 3, "Lampiran kamera & file",
     "Ambil foto/langganan file, kompresi, upload, pratinjau.",
     "S6", "Must", 1.5, "1.2.9", "Foto > 5 MB dikompres sebelum upload.",
     "Hari 3", "Planned"),
    ("1.5.8", 3, "Profil, CSAT & riwayat",
     "Profil customer/agent, rating CSAT, daftar tiket selesai.",
     "C4", "Must", 1, "1.5.3", "Rating tersimpan dan tampil di web.",
     "Hari 3", "Planned"),
    ("1.5.9", 3, "Build & signing APK",
     "Keystore release, build APK, uji install di perangkat/emulator.",
     "—", "Must", 0.5, "1.5.4", "APK release terpasang tanpa crash saat login & chat.",
     "Hari 3", "Planned"),
    ("1.5.10", 3, "Deep link dari notifikasi",
     "Tap notifikasi membuka tiket terkait.",
     "S5", "Should", 1, "1.5.6", "Notifikasi tiket membuka detail yang benar.",
     "Hari 3", "Planned"),

    ("1.6", 2, "QA, DevOps & Dokumentasi",
     "Pengujian end-to-end, perbaikan, dokumentasi, dan paket deliverable.",
     "Semua", "Must", 8, "1.2-1.5", "Semua skenario wajib lulus dan didokumentasikan.",
     "Hari 3-4", "Planned"),
    ("1.6.1", 3, "E2E widget ↔ web ↔ mobile",
     "Skenario: customer chat dari widget, agent balas di web, customer lanjut di mobile.",
     "S6", "Must", 2, "1.4, 1.5", "Satu thread percakapan konsisten di tiga kanal.",
     "Hari 4", "Planned"),
    ("1.6.2", 3, "Uji putus-sambung & latency",
     "Simulasi offline, latency, refresh, server restart; ukur waktu pemulihan.",
     "S6, S7", "Must", 1.5, "1.6.1", "Reconnect < 5 detik, tanpa pesan hilang/duplikat.",
     "Hari 4", "Planned"),
    ("1.6.3", 3, "Bug fixing & performance",
     "Perbaiki temuan QA, index query, optimasi payload & render list.",
     "—", "Must", 1.5, "1.6.1", "Tidak ada bug kritis/tinggi tersisa di daftar isu.",
     "Hari 4", "Planned"),
    ("1.6.4", 3, "README, screenshot & demo",
     "Cara menjalankan, akun demo, arsitektur, skema DB, keputusan desain, screenshot.",
     "—", "Must", 1.5, "1.6.1", "Reviewer dapat menjalankan proyek hanya dari README.",
     "Hari 4", "Planned"),
    ("1.6.5", 3, "Docker & konfigurasi produksi",
     "Dockerfile, env contoh, perintah build, catatan deployment.",
     "—", "Should", 1, "1.6.4", "`docker compose up` menjalankan server + DB.",
     "Hari 4", "Planned"),
    ("1.6.6", 3, "Packaging deliverable",
     "Export BPMN PDF, WBS XLSX, APK, publish repo publik, cek akses reviewer.",
     "—", "Must", 0.5, "1.6.4", "Semua link dapat diakses tanpa login khusus.",
     "Hari 4", "Planned"),
    ("1.6.7", 3, "Video demo 2 menit",
     "Rekaman alur realtime lintas kanal sebagai bukti tambahan.",
     "—", "Could", 1, "1.6.1", "Video terunggah dan ditautkan di README.",
     "Hari 4", "Planned"),

    ("1.7", 2, "Manajemen Proyek",
     "Perencanaan, review harian, dan pengelolaan risiko pengerjaan solo 4 hari.",
     "—", "Must", 4, "—", "Progres harian tercatat dan submission tepat waktu.",
     "Hari 1-4", "In Progress"),
    ("1.7.1", 3, "Kickoff & penetapan scope",
     "Pilih Helpdesk, kunci ruang lingkup Must/Should/Could, siapkan environment.",
     "—", "Must", 0.5, "—", "Scope & jadwal disepakati sebelum coding.",
     "Hari 1", "Done"),
    ("1.7.2", 3, "Daily review & risk log",
     "Review progres, update status WBS, catat risiko & mitigasi.",
     "—", "Must", 1.5, "1.7.1", "Risk log diperbarui setiap hari.",
     "Hari 1-4", "In Progress"),
    ("1.7.3", 3, "Final QA & submission",
     "Cek ulang deliverable, kirim email berisi PDF, XLSX, dan URL repo.",
     "—", "Must", 1.5, "1.6.6", "Email terkirim sebelum 25 Okt 2026 23:59 WIB.",
     "Hari 4", "Planned"),
    ("1.7.4", 3, "Buffer",
     "Cadangan waktu untuk perbaikan tak terduga.",
     "—", "Must", 0.5, "—", "Dipakai hanya bila ada blocker.",
     "Hari 4", "Planned"),
]


# derive module/project estimates from the task rows so the workbook always adds up
from collections import defaultdict
_rows = [list(r) for r in ROWS]
_sums = defaultdict(float)
for _r in _rows:
    if _r[1] == 3:
        _sums[_r[0].rsplit(".", 1)[0]] += _r[6]
_total = round(sum(_sums.values()), 1)
for _r in _rows:
    if _r[1] == 2:
        _r[6] = round(_sums[_r[0]], 1)
    elif _r[1] == 1:
        _r[6] = _total
ROWS = [tuple(r) for r in _rows]

HEADERS = ["Kode", "Level", "Nama Item / Modul / Fitur", "Deskripsi",
           "Ref BPMN", "Prioritas", "Estimasi (jam)", "Dependency",
           "Acceptance Criteria", "Target Hari", "Status"]
WIDTHS = [9, 7, 40, 62, 15, 11, 11, 12, 46, 13, 13]
ALIGN = ["center", "center", "left", "left", "center", "center", "center",
         "center", "left", "center", "center"]

ws = wb.active
ws.title = "WBS"
ws.sheet_view.showGridLines = False

# title block
ws.merge_cells("A1:K1")
ws["A1"] = "WORK BREAKDOWN STRUCTURE — APLIKASI HELPDESK"
ws["A1"].font = Font(name="Calibri", size=18, bold=True, color=WHITE)
ws["A1"].fill = PatternFill("solid", fgColor=NAVY)
ws["A1"].alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[1].height = 34

ws.merge_cells("A2:K2")
ws["A2"] = ("Take Home Programming Test — Software Engineer · Ciheul Technologies · "
            "Kandidat: Fanadillah · Disusun 22 Oktober 2026 · Batas pengumpulan 25 Oktober 2026")
ws["A2"].font = Font(name="Calibri", size=10, color=SLATE)
ws["A2"].alignment = Alignment(vertical="center", indent=1)
ws.row_dimensions[2].height = 20

ws.merge_cells("A3:K3")
ws["A3"] = ("Ruang lingkup: Live Chat Widget (JavaScript) + Web App agent + Mobile App (Flutter), "
            "realtime lintas kanal, SQLite. Estimasi dalam jam-orang; eksekusi solo 4 hari "
            "memprioritaskan Must, didukung AI sesuai aturan soal.")
ws["A3"].font = Font(name="Calibri", size=9, italic=True, color=SLATE)
ws["A3"].alignment = Alignment(vertical="center", indent=1, wrap_text=True)
ws.row_dimensions[3].height = 26

HEAD_ROW = 4
ws.row_dimensions[HEAD_ROW].height = 32
for i, (h, w) in enumerate(zip(HEADERS, WIDTHS), start=1):
    c = ws.cell(row=HEAD_ROW, column=i, value=h)
    c.font = Font(name="Calibri", size=10, bold=True, color=WHITE)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BORDER
    ws.column_dimensions[get_column_letter(i)].width = w

first = HEAD_ROW + 1
for r, (code, level, name, desc, ref, prio, hours, dep, acc, day, status) in \
        enumerate(ROWS, start=first):
    vals = [code, level, name, desc, ref, prio, hours, dep, acc, day, status]
    for ci, v in enumerate(vals, start=1):
        c = ws.cell(row=r, column=ci, value=v)
        c.border = BORDER
        c.alignment = Alignment(horizontal=ALIGN[ci - 1], vertical="top",
                                wrap_text=True,
                                indent=(level - 1) if ci == 3 else 0)
        c.font = Font(name="Calibri", size=9.5 if level == 3 else 10,
                      bold=(level <= 2),
                      color=NAVY if level <= 2 else "1F2937")
        if level == 1:
            c.fill = PatternFill("solid", fgColor="0F172A")
            c.font = Font(name="Calibri", size=10.5, bold=True, color=WHITE)
        elif level == 2:
            c.fill = PatternFill("solid", fgColor=MOD_FILL)
    if level == 3:
        pfill, pcolor = PRIO[prio]
        pc = ws.cell(row=r, column=6)
        pc.fill = PatternFill("solid", fgColor=pfill)
        pc.font = Font(name="Calibri", size=9, bold=True, color=pcolor)
        sfill, scolor = STATUS[status]
        sc = ws.cell(row=r, column=11)
        sc.fill = PatternFill("solid", fgColor=sfill)
        sc.font = Font(name="Calibri", size=9, bold=True, color=scolor)
        ws.row_dimensions[r].height = max(
            20, 13 * max(math.ceil(len(desc) / 62), math.ceil(len(acc) / 46),
                         math.ceil(len(name) / 40)) + 4)
    elif level == 2:
        ws.row_dimensions[r].height = max(
            22, 13 * max(math.ceil(len(desc) / 70), math.ceil(len(acc) / 52)) + 5)
    else:
        ws.row_dimensions[r].height = 26

last = first + len(ROWS) - 1

# total row
tr = last + 1
ws.cell(row=tr, column=1, value="TOTAL").font = Font(bold=True, size=10, color=WHITE)
ws.merge_cells(start_row=tr, start_column=1, end_row=tr, end_column=6)
ws.cell(row=tr, column=1).alignment = Alignment(horizontal="right", vertical="center")
ws.cell(row=tr, column=7, value=f'=SUMIF(B{first}:B{last},3,G{first}:G{last})')
ws.cell(row=tr, column=7).font = Font(bold=True, size=10, color=WHITE)
ws.cell(row=tr, column=7).alignment = Alignment(horizontal="center", vertical="center")
ws.cell(row=tr, column=8, value="jam-orang")
ws.cell(row=tr, column=8).font = Font(bold=True, size=9, color=WHITE)
ws.cell(row=tr, column=9,
        value=(f"Must-first: estimasi penuh {_total:g} jam; kapasitas efektif 4 hari "
               "± 46 jam, selisih ditutup dengan bantuan AI & pemangkasan Should/Could."))
ws.cell(row=tr, column=9).font = Font(size=9, color=WHITE)
ws.merge_cells(start_row=tr, start_column=9, end_row=tr, end_column=11)
for ci in range(1, 12):
    c = ws.cell(row=tr, column=ci)
    c.fill = PatternFill("solid", fgColor="1E293B")
    c.border = BORDER
    if ci in (7, 8, 9):
        c.alignment = Alignment(horizontal="center" if ci != 9 else "left",
                                vertical="center", wrap_text=True)
ws.row_dimensions[tr].height = 30

ws.freeze_panes = "C5"
ws.auto_filter.ref = f"A{HEAD_ROW}:K{last}"
ws.sheet_properties.outlinePr.summaryBelow = False
for r in range(first, last + 1):
    if ROWS[r - first][1] == 3:
        ws.row_dimensions[r].outlineLevel = 1

ws.print_title_rows = f"{HEAD_ROW}:{HEAD_ROW}"
ws.page_setup.orientation = "landscape"
ws.page_setup.paperSize = ws.PAPERSIZE_A3
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.sheet_properties.pageSetUpPr.fitToPage = True

# data validation
dv_prio = DataValidation(type="list", formula1='"Must,Should,Could"', allow_blank=True,
                         showDropDown=False)
dv_stat = DataValidation(type="list", formula1='"Planned,In Progress,Done,Blocked"',
                         allow_blank=True, showDropDown=False)
dv_day = DataValidation(type="list",
                        formula1='"Hari 1,Hari 2,Hari 3,Hari 4,Hari 1-2,Hari 2-3,Hari 3-4,Hari 1-4"',
                        allow_blank=True, showDropDown=False)
for dv, col in ((dv_prio, "F"), (dv_stat, "K"), (dv_day, "J")):
    ws.add_data_validation(dv)
    dv.add(f"{col}{first}:{col}{last}")

# --------------------------------------------------------------- summary ----
sm = wb.create_sheet("Ringkasan")
sm.sheet_view.showGridLines = False
sm.merge_cells("A1:G1")
sm["A1"] = "RINGKASAN WBS"
sm["A1"].font = Font(size=16, bold=True, color=WHITE)
sm["A1"].fill = PatternFill("solid", fgColor=NAVY)
sm["A1"].alignment = Alignment(vertical="center", indent=1)
sm.row_dimensions[1].height = 30

sm.merge_cells("A2:G2")
sm["A2"] = "Rekap estimasi per modul, prioritas, dan kesiapan waktu pengerjaan."
sm["A2"].font = Font(size=9.5, color=SLATE)
sm["A2"].alignment = Alignment(vertical="center", indent=1)
sm.row_dimensions[2].height = 18

mods = [(r[0], r[2]) for r in ROWS if r[1] == 2]
head2 = 4
for i, h in enumerate(["Kode", "Modul", "Jumlah Fitur", "Estimasi (jam)",
                       "Must", "Should", "Could"], start=1):
    c = sm.cell(row=head2, column=i, value=h)
    c.font = Font(bold=True, size=10, color=WHITE)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BORDER
for i, w in enumerate([8, 46, 14, 15, 9, 9, 9], start=1):
    sm.column_dimensions[get_column_letter(i)].width = w
sm.row_dimensions[head2].height = 26

r = head2 + 1
for code, name in mods:
    sm.cell(row=r, column=1, value=code).alignment = Alignment(horizontal="center")
    sm.cell(row=r, column=2, value=name)
    sm.cell(row=r, column=3, value=f'=COUNTIFS(WBS!$A${first}:$A${last},"{code}.*")')
    sm.cell(row=r, column=4, value=f'=SUMIFS(WBS!$G${first}:$G${last},'
                                   f'WBS!$A${first}:$A${last},"{code}.*")')
    for j, p in enumerate(["Must", "Should", "Could"], start=5):
        sm.cell(row=r, column=j,
                value=f'=COUNTIFS(WBS!$A${first}:$A${last},"{code}.*",'
                      f'WBS!$F${first}:$F${last},"{p}")')
    for ci in range(1, 8):
        c = sm.cell(row=r, column=ci)
        c.border = BORDER
        c.font = Font(size=9.5, bold=(ci == 2))
        if ci >= 3:
            c.alignment = Alignment(horizontal="center")
        if r % 2 == 0:
            c.fill = PatternFill("solid", fgColor="F8FAFC")
    sm.row_dimensions[r].height = 20
    r += 1

tot = r
sm.cell(row=tot, column=1, value="TOTAL")
sm.cell(row=tot, column=2, value="Seluruh modul")
sm.cell(row=tot, column=3, value=f"=SUM(C{head2 + 1}:C{tot - 1})")
sm.cell(row=tot, column=4, value=f"=SUM(D{head2 + 1}:D{tot - 1})")
for j in range(5, 8):
    col = get_column_letter(j)
    sm.cell(row=tot, column=j, value=f"=SUM({col}{head2 + 1}:{col}{tot - 1})")
for ci in range(1, 8):
    c = sm.cell(row=tot, column=ci)
    c.font = Font(bold=True, size=10, color=WHITE)
    c.fill = PatternFill("solid", fgColor="1E293B")
    c.border = BORDER
    c.alignment = Alignment(horizontal="center" if ci != 2 else "left")
sm.row_dimensions[tot].height = 22

# data bar for effort distribution (renders reliably in Excel & PDF)
from openpyxl.formatting.rule import DataBarRule
sm.conditional_formatting.add(
    f"D{head2 + 1}:D{tot - 1}",
    DataBarRule(start_type="num", start_value=0, end_type="max",
                color="BFDBFE", showValue=True))

notes_row = tot + 2
sm.cell(row=notes_row, column=1, value="Catatan kapasitas").font = Font(bold=True, size=10)
notes = [
    f"Estimasi total {_total:g} jam-orang untuk kualitas produksi (bukan durasi kalender).",
    "Eksekusi solo: Hari 1 (10 jam), Hari 2 (14 jam), Hari 3 (14 jam), Hari 4 (8 jam) = ± 46 jam efektif.",
    "Selisih ditutup dengan bantuan AI (diizinkan soal), prioritas Must, dan penundaan Should/Could.",
    "Fitur opsional (AI auto-reply + push notification) tetap dikerjakan karena bernilai plus.",
]
for i, t in enumerate(notes):
    c = sm.cell(row=notes_row + 1 + i, column=1, value="• " + t)
    c.font = Font(size=9, color=SLATE)
    sm.merge_cells(start_row=notes_row + 1 + i, start_column=1,
                   end_row=notes_row + 1 + i, end_column=7)

# --------------------------------------------------------------- timeline ---
tl = wb.create_sheet("Timeline")
tl.sheet_view.showGridLines = False
tl.merge_cells("A1:F1")
tl["A1"] = "RENCANA EKSEKUSI 4 HARI"
tl["A1"].font = Font(size=16, bold=True, color=WHITE)
tl["A1"].fill = PatternFill("solid", fgColor=NAVY)
tl["A1"].alignment = Alignment(vertical="center", indent=1)
tl.row_dimensions[1].height = 30

for i, h in enumerate(["Hari / Tanggal", "Fokus", "Aktivitas utama",
                       "Deliverable", "Jam", "Definition of Done"], start=1):
    c = tl.cell(row=3, column=i, value=h)
    c.font = Font(bold=True, size=10, color=WHITE)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BORDER
for i, w in enumerate([22, 30, 56, 30, 8, 52], start=1):
    tl.column_dimensions[get_column_letter(i)].width = w
tl.row_dimensions[3].height = 28

TIMELINE = [
    ("Hari 1 — Kamis, 22 Okt 2026", "Analisis & desain",
     "Finalisasi scope, BPMN swimlane, WBS, ERD, kontrak API/event, wireframe, "
     "scaffold repo & migrasi database.",
     "BPMN PDF, WBS XLSX, ERD, API contract", 10,
     "Semua dokumen desain selesai dan repo dapat dijalankan (server + DB kosong)."),
    ("Hari 2 — Jumat, 23 Okt 2026", "Backend & widget",
     "Auth/RBAC, tiket, SLA, chat realtime, idempotensi & replay, AI adapter, "
     "seed, unit/integration test, widget chat.",
     "API berjalan, widget demo, test hijau", 14,
     "Chat widget ↔ dashboard agent realtime; reconnect tanpa duplikat."),
    ("Hari 3 — Sabtu, 24 Okt 2026", "Web dashboard & mobile app",
     "Inbox & detail tiket, aksi tiket, laporan, admin panel, Flutter customer/agent, "
     "offline queue, local notification, build APK.",
     "Web app lengkap, APK release", 14,
     "Tiga kanal (widget, web, mobile) saling terhubung; APK terpasang."),
    ("Hari 4 — Minggu, 25 Okt 2026", "QA, dokumentasi & submission",
     "E2E lintas kanal, uji putus-sambung, bug fixing, README & screenshot, "
     "export PDF/XLSX, publish repo publik, kirim email.",
     "Repo publik + PDF + XLSX + APK", 8,
     "Email terkirim sebelum 23:59 WIB (target 12.00 WIB)."),
]
for r, row in enumerate(TIMELINE, start=4):
    for ci, v in enumerate(row, start=1):
        c = tl.cell(row=r, column=ci, value=v)
        c.border = BORDER
        c.alignment = Alignment(vertical="top", wrap_text=True,
                                horizontal="center" if ci == 5 else "left")
        c.font = Font(size=9.5, bold=(ci == 1))
        if r % 2 == 0:
            c.fill = PatternFill("solid", fgColor="F8FAFC")
    tl.row_dimensions[r].height = 58

# --------------------------------------------------------------- risks ------
rk = wb.create_sheet("Risiko")
rk.sheet_view.showGridLines = False
rk.merge_cells("A1:F1")
rk["A1"] = "RISIKO & MITIGASI"
rk["A1"].font = Font(size=16, bold=True, color=WHITE)
rk["A1"].fill = PatternFill("solid", fgColor=NAVY)
rk["A1"].alignment = Alignment(vertical="center", indent=1)
rk.row_dimensions[1].height = 30

for i, h in enumerate(["No", "Risiko", "Dampak", "Probabilitas", "Mitigasi", "Pemicu"], start=1):
    c = rk.cell(row=3, column=i, value=h)
    c.font = Font(bold=True, size=10, color=WHITE)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    c.border = BORDER
for i, w in enumerate([6, 44, 12, 13, 66, 30], start=1):
    rk.column_dimensions[get_column_letter(i)].width = w
rk.row_dimensions[3].height = 26

RISKS = [
    ("Build APK gagal (lisensi/SDK/Gradle)", "Tinggi", "Sedang",
     "Terima lisensi Android lebih awal, build debug di Hari 2, siapkan fallback APK debug "
     "atau tautan Drive.", "flutter doctor / build error"),
    ("Realtime tidak stabil saat jaringan putus", "Tinggi", "Tinggi",
     "Outbox + retry backoff, replay sync:since, idempotensi client_message_id, uji "
     "airplane mode & server restart.", "Pesan hilang/duplikat saat uji"),
    ("Waktu 3,5 hari tidak cukup", "Tinggi", "Tinggi",
     "Must-first, bangun vertical slice lebih dulu, hentikan Should/Could bila waktu habis.",
     "Progres harian < 70% target"),
    ("API key AI tidak tersedia", "Sedang", "Sedang",
     "Fallback rule-based dari knowledge base, adapter dapat dikonfigurasi via env.",
     "AI tidak merespons / 401"),
    ("Konkurensi SQLite (database locked)", "Sedang", "Rendah",
     "Aktifkan WAL, satu writer, transaksi pendek, index pada kolom filter.",
     "Error SQLITE_BUSY"),
    ("Reviewer tidak dapat mengakses repo/APK", "Sedang", "Rendah",
     "Repo publik, README langkah setup, akun demo, tautan APK di README & email.",
     "404 / izin ditolak"),
    ("Push notification butuh konfigurasi FCM", "Rendah", "Sedang",
     "Default local notification dari event socket; struktur siap FCM bila config tersedia.",
     "google-services.json tidak ada"),
]
for r, row in enumerate(RISKS, start=4):
    rk.cell(row=r, column=1, value=r - 3)
    for ci, v in enumerate(row, start=2):
        c = rk.cell(row=r, column=ci, value=v)
        c.border = BORDER
        c.font = Font(size=9.5)
        c.alignment = Alignment(vertical="top", wrap_text=True,
                                horizontal="center" if ci in (3, 4) else "left")
    rk.cell(row=r, column=1).alignment = Alignment(horizontal="center", vertical="top")
    rk.cell(row=r, column=1).border = BORDER
    for col, val in ((3, row[1]), (4, row[2])):
        color = {"Tinggi": "FEE2E2", "Sedang": "FEF3C7", "Rendah": "DCFCE7"}[val]
        rk.cell(row=r, column=col).fill = PatternFill("solid", fgColor=color)
        rk.cell(row=r, column=col).font = Font(size=9, bold=True)
    rk.row_dimensions[r].height = max(38, 13 * math.ceil(len(row[3]) / 66) + 8)

# --------------------------------------------------------------- legend -----
lg = wb.create_sheet("Legenda")
lg.sheet_view.showGridLines = False
lg.merge_cells("A1:D1")
lg["A1"] = "LEGENDA, ASUMSI & TRACEABILITY"
lg["A1"].font = Font(size=16, bold=True, color=WHITE)
lg["A1"].fill = PatternFill("solid", fgColor=NAVY)
lg["A1"].alignment = Alignment(vertical="center", indent=1)
lg.row_dimensions[1].height = 30
lg.column_dimensions["A"].width = 22
lg.column_dimensions["B"].width = 26
lg.column_dimensions["C"].width = 70
lg.column_dimensions["D"].width = 24

def section(row, title):
    lg.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
    c = lg.cell(row=row, column=1, value=title)
    c.font = Font(bold=True, size=10.5, color=WHITE)
    c.fill = PatternFill("solid", fgColor=BLUE)
    c.alignment = Alignment(vertical="center", indent=1)
    lg.row_dimensions[row].height = 22

def kv(row, key, val, extra=""):
    lg.cell(row=row, column=1, value=key).font = Font(bold=True, size=9.5)
    lg.cell(row=row, column=2, value=val)
    lg.merge_cells(start_row=row, start_column=2, end_row=row, end_column=4)
    for col in range(1, 5):
        lg.cell(row=row, column=col).border = BORDER
        lg.cell(row=row, column=col).alignment = Alignment(vertical="top", wrap_text=True)
    lg.row_dimensions[row].height = 30

r = 3
section(r, "A. PRIORITAS"); r += 1
for p, desc in [("Must", "Wajib, menjadi syarat deliverable dan fitur inti pada instruksi PDF."),
                ("Should", "Penting untuk kualitas & kelengkapan, dikerjakan setelah Must stabil."),
                ("Could", "Nilai tambah, dikerjakan bila waktu tersisa.")]:
    kv(r, p, desc); r += 1

r += 1
section(r, "B. STATUS"); r += 1
for s, desc in [("Planned", "Belum dikerjakan."), ("In Progress", "Sedang dikerjakan."),
                ("Done", "Selesai & terverifikasi."), ("Blocked", "Terhambat, butuh keputusan.")]:
    kv(r, s, desc); r += 1

r += 1
section(r, "C. AKTOR & HAK AKSES (RBAC)"); r += 1
for a, desc in [("Customer", "Membuat tiket & chat dari widget atau mobile app."),
                ("CS Agent", "Menangani tiket, membalas chat, eskalasi, resolve."),
                ("Supervisor", "Menerima eskalasi, memantau SLA/beban kerja, meninjau CSAT."),
                ("Admin", "Mengelola user, role, kategori, SLA, knowledge base, audit log.")]:
    kv(r, a, desc); r += 1

r += 1
section(r, "D. ASUMSI PROSES & TEKNIS"); r += 1
for k, v in [
    ("Kanal", "Live Chat Widget (web), Web App untuk agent/supervisor/admin, Mobile App "
              "(customer & agent mode)."),
    ("Realtime", "Socket.IO; satu koneksi per klien, room per tiket, heartbeat, reconnect, "
                 "replay pesan (sync:since), fallback polling."),
    ("SLA default", "First response 15 menit, resolusi 1x24 jam (dapat diubah admin per kategori)."),
    ("Prioritas", "Low, Medium, High, Urgent; memengaruhi urutan antrean & target SLA."),
    ("Status tiket", "New → Assigned → On Progress ⇄ Pending → Resolved → Closed; reopen ≤ 7 hari; "
                     "auto-close 7 hari setelah Resolved."),
    ("Guest chat", "Widget dapat dipakai tanpa login (nama + email), sesi disimpan di browser."),
    ("AI auto-reply", "Menjawab dari knowledge base; jika API key tidak tersedia memakai "
                      "fallback rule-based; tidak menutup tiket otomatis."),
    ("Push notification", "Local notification dari event realtime; struktur siap FCM."),
    ("Database", "SQLite (mode WAL) untuk kemudahan review; skema kompatibel PostgreSQL."),
    ("Keamanan", "JWT + refresh token, RBAC per endpoint/event, validasi upload, rate limit."),
]:
    kv(r, k, v); r += 1

r += 1
section(r, "E. TRACEABILITY BPMN → WBS"); r += 1
for k, v in [
    ("C0-C5", "Lane Customer: start, buka widget/app, pre-chat, diskusi, konfirmasi & CSAT, selesai."),
    ("S1-S8", "Lane Live Chat System: buat tiket, AI, klasifikasi/SLA, notifikasi, relay pesan, "
              "timer SLA, simpan CSAT/auto-close."),
    ("A1-A7", "Lane CS Agent: ambil tiket, analisis, eskalasi, solusi, tangani L2, resolve."),
    ("P1-P3", "Lane Supervisor: review eskalasi, setujui & pantau, tinjau CSAT rendah."),
    ("D1-D4", "Lane Admin (periodik): user & role, kategori/SLA, KB & canned response, audit & laporan."),
]:
    kv(r, k, v); r += 1



# ------------------------------------------------------- print setup --------
from openpyxl.worksheet.properties import PageSetupProperties

for _ws, _area in ((ws, f"A1:K{tr}"), (sm, f"A1:G{notes_row + 5}"),
                   (tl, f"A1:F{3 + len(TIMELINE)}"), (rk, f"A1:F{3 + len(RISKS)}"),
                   (lg, f"A1:D{r}")):
    _ws.print_area = _area
    _ws.page_setup.orientation = "landscape"
    _ws.page_setup.paperSize = _ws.PAPERSIZE_A3
    _ws.page_setup.fitToWidth = 1
    _ws.page_setup.fitToHeight = 0 if _ws is ws else 1
    _ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    _ws.page_margins.left = _ws.page_margins.right = 0.3
    _ws.page_margins.top = _ws.page_margins.bottom = 0.4

wb.save(OUT)
print("wrote", OUT, OUT.stat().st_size, "bytes")
