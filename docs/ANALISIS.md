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
| Customer | Melaporkan kendala, berdiskusi, konfirmasi selesai | Buat tiket, kirim pesan, unggah lampiran, isi CSAT, reopen |
| CS Agent | Menangani tiket, menjawab chat, eskalasi | Ambil/assign tiket, ubah status & prioritas, canned response, catatan internal |
| Supervisor | Mengawasi kualitas & SLA | Terima eskalasi, pantau beban kerja, lihat laporan, tinjau CSAT rendah |
| Admin | Mengelola konfigurasi | CRUD user & role, kategori, kebijakan SLA, knowledge base, audit log |

RBAC diterapkan pada REST endpoint **dan** Socket.IO event, bukan hanya di UI.

## 3. Proses bisnis

### 3.1 Alur utama (happy path)

1. Customer membuka widget atau mobile app, mengisi pre-chat (nama, email, kategori, prioritas).
2. Sistem membuat sesi chat + tiket, menerapkan kategori, prioritas, dan SLA.
3. Jika AI auto-reply aktif, sistem mengirim jawaban awal dari knowledge base. AI **tidak** menutup tiket.
4. Tiket masuk antrean; agent online menerima notifikasi realtime, lalu mengambil tiket.
5. Agent memverifikasi, berdiskusi dengan customer (widget/web/mobile berada di thread yang sama).
6. Agent memberi solusi. Jika perlu, tiket dieskalasi ke L2 melalui Supervisor.
7. Agent menandai **Resolved**, customer mengonfirmasi dan mengisi CSAT.
8. Sistem menyimpan rating lalu menutup tiket (auto-close 7 hari setelah Resolved).

### 3.2 Cabang penting

- **Eskalasi L2**: agent tidak dapat menyelesaikan → Supervisor review → assign level/tim → agent L2 menangani.
- **Pending**: menunggu informasi customer, timer tetap berjalan, auto-close bila tidak ada respons.
- **Reopen**: customer dapat membuka kembali tiket ≤ 7 hari setelah Closed.
- **SLA breach**: timer melewati target first response/resolusi → notifikasi Supervisor dan badge merah.
- **AI fallback**: API key tidak tersedia → jawaban rule-based dari artikel KB; semua jawaban AI dicatat.

### 3.3 SLA default (dapat diubah Admin)

| Prioritas | First response | Resolusi |
|---|---|---|
| Urgent | 5 menit | 4 jam |
| High | 15 menit | 8 jam |
| Medium | 30 menit | 1×24 jam |
| Low | 2 jam | 3×24 jam |

## 4. Fitur per kanal

**Widget**: bubble & panel, pre-chat + sesi guest, chat realtime, status koneksi, offline queue + retry, lampiran, CSAT, persistensi lintas tab.

**Web App**: login & guard, inbox + filter + pencarian, detail tiket + chat, aksi tiket (assign/status/prioritas/eskalasi/reopen), canned response, internal note (tidak terlihat customer), SLA badge & timer, dashboard supervisor, admin panel, notifikasi browser.

**Mobile App**: login customer/agent, daftar & detail tiket, chat realtime, offline queue + replay, local notification (FCM-ready), lampiran kamera/file, profil & CSAT, APK release.

**Lintas kanal**: tiket yang sama dapat dilanjutkan dari widget → mobile → web tanpa kehilangan riwayat.

## 5. Arsitektur realtime

```
Customer (widget JS) ─┐
Customer (Flutter)  ──┼── Socket.IO ── Node.js/Express ── SQLite (WAL)
Agent (web)         ──┤      │                 │
Agent (Flutter)     ──┘      │                 └── REST API (auth, CRUD, upload)
                             └── rooms: ticket:{id}, user:{id}, role:agent
```

Prinsip yang menjamin **selalu terkoneksi**:

1. **Satu koneksi per klien** dengan heartbeat; reconnect otomatis + exponential backoff dan jitter.
2. **Room per tiket** — pesan disiarkan ke semua kanal yang terlibat.
3. **Idempotensi** — setiap pesan membawa `client_message_id` unik; server menolak duplikat.
4. **Sequence per tiket** — klien menyimpan `last_seq`, saat reconnect meminta `sync:since` untuk replay pesan terlewat.
5. **Outbox lokal** — pesan saat offline disimpan (localStorage/Hive), dikirim ulang berurutan setelah pulih.
6. **Delivery & read receipt** — status pesan terkirim/dibaca tersimpan di `message_receipts`.
7. **Fallback transport** — polling otomatis bila websocket diblokir jaringan kantor/proxy.
8. **Presence & typing** — agent online, lawan bicara sedang mengetik; mencegah dua agent membalas bersamaan.

### Event Socket.IO

| Event | Arah | Payload inti |
|---|---|---|
| `session:join` | client → server | `ticket_id`, `last_seq` |
| `message:send` | client → server | `ticket_id`, `body`, `client_message_id`, `attachment_id?` |
| `message:new` | server → client | `message`, `seq`, `sender` |
| `message:ack` | server → client | `client_message_id`, `message_id`, `seq` |
| `message:read` | kedua arah | `ticket_id`, `message_id` |
| `typing:start` / `typing:stop` | kedua arah | `ticket_id` |
| `presence:update` | server → client | `user_id`, `status` |
| `ticket:update` | server → client | `ticket_id`, `status`, `assignee`, `sla_due_at` |
| `notification:new` | server → client | `type`, `payload` |
| `sync:since` | client → server | `ticket_id`, `last_seq` |

## 6. Rencana database (SQLite, kompatibel PostgreSQL)

| Tabel | Kolom kunci | Catatan |
|---|---|---|
| `users` | id, name, email (unik), password_hash, role, is_active | role: customer/agent/supervisor/admin |
| `customers` | id, user_id?, name, email, phone | guest chat tanpa user |
| `categories` | id, name, default_priority, first_response_min, resolution_min | SLA per kategori |
| `tickets` | id, code (unik), subject, description, category_id, priority, status, channel, customer_id, assignee_id, sla_due_at, first_response_at, resolved_at, closed_at, csat_rating, version | index: status, assignee_id, sla_due_at |
| `ticket_messages` | id, ticket_id, sender_id, sender_type, body, is_internal, client_message_id (unik), seq, created_at | unik (ticket_id, seq) |
| `message_receipts` | message_id, user_id, delivered_at, read_at | PK gabungan |
| `ticket_events` | id, ticket_id, actor_id, type, from_value, to_value, created_at | audit trail |
| `attachments` | id, ticket_id, message_id?, filename, mime, size, path | validasi mime & ukuran |
| `canned_responses` | id, title, body, created_by | template agent |
| `kb_articles` | id, title, body, tags, is_published | sumber jawaban AI |
| `devices` | id, user_id, platform, push_token | mobile |
| `notifications` | id, user_id, type, payload, read_at | in-app |
| `ai_logs` | id, ticket_id, prompt, response, model, tokens, latency_ms, fallback_used | transparansi AI |

Indeks utama: `tickets(status, assignee_id)`, `tickets(sla_due_at)`, `ticket_messages(ticket_id, seq)`,
`ticket_messages(client_message_id)` unik, `ticket_events(ticket_id, created_at)`.

## 7. Keputusan desain & trade-off

1. **Socket.IO vs WebSocket murni** — Socket.IO memberi reconnect, room, ack, dan fallback polling siap pakai; penting untuk syarat "selalu terkoneksi".
2. **SQLite (WAL)** — mudah direview tanpa setup server DB; skema dan query tetap kompatibel PostgreSQL.
3. **Idempotensi di server** — mencegah duplikat saat retry, bukan hanya di klien.
4. **Replay berbasis sequence** — lebih murah dan deterministik dibanding menyimpan seluruh histori di klien.
5. **AI opsional & tidak memutus manusia** — AI hanya first response; semua tiket tetap dapat ditangani agent.
6. **Push notification lokal dulu** — tidak memerlukan Firebase project; struktur FCM disiapkan bila config tersedia.
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
