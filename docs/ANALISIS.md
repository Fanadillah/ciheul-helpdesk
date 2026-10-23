# Analisis & Desain — Aplikasi Helpdesk

Dokumen ini melengkapi dua deliverable wajib Soal 1:
[`BPMN-Helpdesk.pdf`](BPMN-Helpdesk.pdf) dan [`WBS-Helpdesk.xlsx`](WBS-Helpdesk.xlsx).
Isinya menjadi acuan implementasi Soal 2 (widget, web app, mobile app).

## 1. Scope

Aplikasi helpdesk untuk melacak kendala pelanggan dari masuk sampai selesai, dengan tiga kanal:

| Kanal | Pengguna | Teknologi |
|---|---|---|
| Live Chat Widget (kanan bawah) | Customer | JavaScript, Socket.IO client |
| Web App | CS Agent, Supervisor, Admin | JavaScript, Socket.IO client |
| Mobile App | Customer & Agent | Flutter, `socket_io_client` |

Di luar scope: billing/pembayaran, gudang, dan integrasi tiket pihak ketiga (Jira/Zendesk).

## 2. Aktor & hak akses

| Aktor | Tanggung jawab | Hak utama |
|---|---|---|
| Customer | Melaporkan kendala, berdiskusi, konfirmasi selesai | Buat tiket, kirim pesan, unggah lampiran (web), isi CSAT, reopen |
| CS Agent | Menangani tiket, menjawab chat | Ambil/assign tiket, ubah status & prioritas, canned response, catatan internal |
| Supervisor | Mengawasi kualitas & SLA | Pantau beban kerja, lihat laporan, tinjau CSAT rendah |
| Admin | Mengelola konfigurasi | Kelola user & role, kategori, kebijakan SLA, knowledge base |

RBAC diterapkan pada REST endpoint **dan** Socket.IO event, bukan hanya di UI.

## 3. Proses bisnis

### 3.1 Alur utama (happy path)

1. Customer membuka widget atau mobile app, mengisi pre-chat (nama, email, kategori).
2. Sistem membuat sesi chat + tiket, menerapkan kategori, prioritas, dan SLA.
3. Jika AI auto-reply aktif, sistem mengirim jawaban awal dari knowledge base. AI **tidak** menutup tiket.
4. Tiket masuk antrean; agent online menerima notifikasi realtime, lalu mengambil tiket.
5. Agent memverifikasi, berdiskusi dengan customer (widget/web/mobile berada di thread yang sama).
6. Agent memberi solusi, lalu menandai **Resolved**.
7. Customer mengonfirmasi dan mengisi CSAT.
8. Tiket ditutup otomatis 7 hari setelah Resolved, atau dapat ditutup manual oleh agent.

### 3.2 Cabang penting

- **Prioritas/assignment**: agent dapat mengubah prioritas dan mengambil tiket; supervisor memantau lewat laporan.
- **Pending**: menunggu informasi customer; timer SLA tetap berjalan.
- **Reopen**: customer dapat membuka kembali tiket resolved/closed ≤ 7 hari setelah resolved/closed.
- **SLA breach**: timer melewati target first response/resolusi → notifikasi ke agent/supervisor dan badge merah.
- **AI fallback**: API key tidak tersedia → jawaban rule-based dari artikel KB; semua jawaban AI dicatat.
- **Eskalasi L2** digambarkan di BPMN sebagai proses target; MVP memakai assign, prioritas, dan notifikasi SLA.

### 3.3 SLA default (dapat diubah Admin)

| Prioritas | First response | Resolusi |
|---|---|---|
| Urgent | 5 menit | 4 jam |
| High | 15 menit | 8 jam |
| Medium | 30 menit | 1×24 jam |
| Low | 2 jam | 3×24 jam |

## 4. Fitur per kanal

**Widget**: bubble & panel, pre-chat + sesi guest, chat realtime, status koneksi, offline queue + retry, CSAT, persistensi lintas tab.

**Web App**: login & guard, inbox + filter + pencarian, detail tiket + chat, aksi tiket (assign/status/prioritas/reopen), attachment, canned response, AI reply, internal note (tidak terlihat customer), SLA badge & timer, dashboard supervisor, admin panel, notifikasi in-app.

**Mobile App**: login customer/agent/supervisor/admin, daftar & detail tiket, chat realtime, offline queue + replay, local notification, CSAT, pengaturan server, APK release. Lampiran ditampilkan sebagai nama file; upload penuh ada di web.

**Lintas kanal**: tiket yang sama dapat dilanjutkan dari widget → mobile → web tanpa kehilangan riwayat.

## 5. Arsitektur realtime

```
Customer (widget JS) ─┐
Customer (Flutter)  ──┼── Socket.IO ── Node.js/Express ── SQLite (WAL)
Agent (web)         ──┤      │                 │
Agent (Flutter)     ──┘      │                 └── REST API (auth, CRUD, upload)
                             └── rooms: ticket:{id}, ticket:{id}:staff, user:{id}, role:{role}, staff
```

Prinsip yang menjamin **selalu terkoneksi**:

1. **Satu koneksi per klien** dengan heartbeat; reconnect otomatis dengan delay 800 ms sampai maksimum 5 detik.
2. **Room per tiket** — pesan disiarkan ke semua kanal yang terlibat; catatan internal memakai room staff.
3. **Idempotensi** — setiap pesan membawa `client_message_id` unik; retry pada tiket yang sama mengembalikan pesan lama.
4. **Sequence per tiket** — klien menyimpan `last_seq`, saat join/reconnect meminta `ticket:join` untuk replay pesan terlewat.
5. **Outbox lokal** — pesan saat offline disimpan di `localStorage` (widget) atau `shared_preferences` (mobile), lalu dikirim ulang.
6. **Delivery & read receipt** — status pesan terkirim/dibaca tersimpan di `message_receipts`.
7. **Fallback transport** — polling REST otomatis bila Socket.IO tidak tersedia.
8. **Presence & typing** — jumlah koneksi per user dihitung agar multi-tab tidak salah dianggap offline; indikator typing membantu koordinasi agent.

### Event Socket.IO

| Event | Arah | Payload inti |
|---|---|---|
| `ticket:join` | client → server | `{ticket_id, last_seq}` → ack `{ok, ticket, messages}` |
| `ticket:leave` | client → server | `{ticket_id}` |
| `message:send` | client → server | `{ticket_id, body, client_message_id, is_internal, attachment_ids?}` → ack `{ok, duplicate, message_id, seq}` |
| `message:new` | server → client | objek pesan |
| `message:read` | kedua arah | `{ticket_id, message_id, user_id}` |
| `typing` | kedua arah | `{ticket_id, user_id, name, is_typing}` |
| `presence:list` | client → server | ack `{ok, users}` (staff) |
| `presence:update` | server → client | `{user_id, name, role, status}` |
| `ticket:update` / `ticket:created` | server → client | objek tiket |
| `notification:new` | server → client | objek notifikasi |
| `sla:breach` | server → client | `{ticket, kind}` |

## 6. Rencana database (SQLite, kompatibel PostgreSQL)

| Tabel | Kolom kunci | Catatan |
|---|---|---|
| `users` | id, name, email (unik), password_hash, role, is_guest, is_active | customer, agent, supervisor, admin; guest widget juga disimpan di sini |
| `categories` | id, name, default_priority, first_response_min, resolution_min, is_active | SLA per kategori |
| `tickets` | id, code (unik), subject, description, category_id, priority, status, channel, customer_id, assignee_id, sla_first_due_at, sla_resolution_due_at, first_response_at, resolved_at, closed_at, csat_rating, csat_comment, reopen_count | status dan prioritas dibatasi CHECK |
| `ticket_messages` | id, ticket_id, sender_id, sender_type, body, is_internal, client_message_id (unik), seq | unik (ticket_id, seq); idempotensi dicek per tiket |
| `message_receipts` | message_id, user_id, delivered_at, read_at | PK gabungan |
| `ticket_events` | id, ticket_id, actor_id, type, from_value, to_value, created_at | audit trail |
| `attachments` | id, ticket_id, message_id?, uploader_id, stored_name, original_name, mime, size | validasi mime & ukuran |
| `canned_responses` | id, title, body, created_by | template agent |
| `kb_articles` | id, title, body, tags, is_published | sumber jawaban AI |
| `devices` | id, user_id, platform, push_token | disiapkan untuk push notification |
| `notifications` | id, user_id, type, title, payload, read_at | in-app |
| `ai_logs` | id, ticket_id, message_id, prompt, response, model, tokens, latency_ms, fallback_used | transparansi AI |

Indeks utama: `tickets(status, updated_at)`, `tickets(assignee_id, status)`, `tickets(customer_id, created_at)`,
`tickets(sla_first_due_at)`, `tickets(sla_resolution_due_at)`, `ticket_messages(ticket_id, seq)`,
`ticket_messages(client_message_id)`, `ticket_events(ticket_id, created_at)`, `notifications(user_id, created_at)`.

## 7. Keputusan desain & trade-off

1. **Socket.IO vs WebSocket murni** — Socket.IO memberi reconnect, room, ack, dan fallback polling siap pakai; penting untuk syarat "selalu terkoneksi".
2. **SQLite (WAL)** — mudah direview tanpa setup server DB; skema dan query tetap kompatibel PostgreSQL.
3. **Idempotensi di server** — mencegah duplikat saat retry, bukan hanya di klien.
4. **Replay berbasis sequence** — lebih murah dan deterministik dibanding menyimpan seluruh histori di klien.
5. **AI opsional & tidak memutus manusia** — AI dipakai untuk first response otomatis dan balasan manual; semua tiket tetap dapat ditangani agent.
6. **Push notification lokal dulu** — tidak memerlukan Firebase project; local notification dipicu event Socket.IO saat aplikasi aktif.
7. **Guest chat** — menurunkan friksi customer; keamanan dijaga lewat token sesi berumur terbatas.

## 8. Asumsi

- Satu tenant (satu perusahaan); multi-tenant di luar scope.
- Bahasa UI: Indonesia, dengan label teknis berbahasa Inggris.
- Zona waktu Asia/Jakarta; SLA dihitung 24/7 (bukan jam kerja) agar sederhana dan dapat diuji.
- Lampiran maksimum 5 MB, tipe gambar/PDF/dokumen kantor.
- AI memakai endpoint OpenAI-compatible melalui environment variable; tanpa key memakai fallback rule-based.

## 9. Traceability

| Dokumen | Isi | Rujukan |
|---|---|---|
| `BPMN-Helpdesk.pdf` | 5 lane, 30+ elemen, timer SLA, eskalasi, CSAT | Soal 1a |
| `WBS-Helpdesk.xlsx` | 7 modul, 64 fitur, 104,5 jam-orang, risiko, timeline | Soal 1b |
| Kolom **Ref BPMN** pada WBS | Menghubungkan fitur ke elemen BPMN (C0-C5, S1-S8, A1-A7, P1-P3, D1-D4) | Traceability |

## 10. Cara regenerasi dokumen

```bash
python docs/tools/gen_bpmn.py      # SVG + draw.io
python docs/tools/export_pdf.py    # BPMN PDF A3 landscape
python docs/tools/gen_wbs.py       # WBS XLSX
```

Generator ditulis dengan Python (PyMuPDF, openpyxl) agar isi dokumen dapat direview dan diubah
sebagai kode, bukan file biner manual.
