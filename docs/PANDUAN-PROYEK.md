# Panduan Proyek Ciheul Helpdesk

Dokumen ini menjelaskan aplikasi helpdesk yang dibangun untuk take-home test Software Engineer
Ciheul Technologies: apa yang dibuat, bagaimana alurnya, mengapa teknologi tertentu dipilih, dan
bagian mana yang perlu dijelaskan saat interview.

Isinya sengaja dibuat menyeluruh agar dapat dibaca sebagai catatan teknis, bukan sekadar daftar
fitur. Setiap keputusan penting disertai alasan dan trade-off-nya.

---

## 1. Ringkasan

Ciheul Helpdesk adalah aplikasi layanan pelanggan dengan satu percakapan yang dapat dilanjutkan
dari tiga kanal:

1. **Live chat widget** yang ditempel di website customer.
2. **Web app** untuk agent, supervisor, admin, dan customer.
3. **Aplikasi mobile Flutter** untuk customer maupun agent.

Semua kanal memakai backend yang sama. Tiket, pesan, status, lampiran, dan riwayat percakapan
disimpan di satu tempat, sehingga customer dapat mulai dari widget lalu melanjutkan dari mobile
tanpa mengulang cerita.

Deliverable yang disertakan:

| Deliverable | Lokasi |
|---|---|
| BPMN proses bisnis | `docs/BPMN-Helpdesk.pdf` |
| WBS dan estimasi | `docs/WBS-Helpdesk.xlsx` |
| Analisis dan desain | `docs/ANALISIS.md` |
| Panduan ini | `docs/PANDUAN-PROYEK.md` |
| Widget | `widget/chat-widget.js` dan `widget/demo.html` |
| Web app | `web/` |
| Backend | `server/` |
| Mobile app | `mobile/` |
| APK release | `artifacts/helpdesk.apk` |

Repository publik: <https://github.com/Fanadillah/ciheul-helpdesk>

---

## 2. Masalah yang Diselesaikan

Tim support sering bekerja dari beberapa tempat: dashboard web, ponsel, dan live chat di website.
Tanpa satu sumber data, percakapan terpecah. Customer harus mengulang keluhan, agent tidak tahu
pesan mana yang sudah dibalas, dan supervisor tidak mendapat gambaran SLA yang utuh.

Aplikasi ini menyatukan semuanya dengan aturan sederhana:

- **Satu tiket adalah satu percakapan.** Semua pesan, catatan internal, lampiran, dan perubahan
  status berada di thread yang sama.
- **Realtime untuk kenyamanan, REST untuk ketahanan.** Jika Socket.IO bermasalah, aksi tetap
  berjalan lewat REST.
- **Pengiriman pesan aman diulang.** Setiap pesan membawa `client_message_id`, sehingga retry
  tidak membuat pesan ganda.
- **Hak akses diperiksa di server.** UI hanya membantu; keputusan akhir tetap di backend.

---

## 3. Fitur per Kanal

### 3.1 Widget customer

- Bubble mengambang dan panel chat.
- **Shadow DOM** agar CSS website pemasang tidak mengubah tampilan widget.
- Pre-chat berisi nama, email, dan kategori.
- Sesi guest memakai JWT tanpa password.
- Chat realtime, indikator typing, status koneksi, dan unread badge.
- Antrean offline: pesan disimpan di `localStorage` lalu dikirim ulang saat koneksi pulih.
- Status pesan: mengirim, menunggu koneksi, gagal, dan terkirim.
- Retry pesan yang gagal dengan klik.
- CSAT bintang setelah tiket resolved.
- Tombol mulai chat baru setelah tiket selesai.
- Fallback polling jika Socket.IO tidak tersedia.

Widget tidak memiliki fitur upload lampiran. Ini keputusan scope agar widget tetap ringan dan
mudah ditempel. Upload/download lampiran tersedia di web app.

### 3.2 Web app

- Login multi-role: customer, agent, supervisor, admin.
- Inbox split-view dengan filter status, prioritas, assignee, dan pencarian.
- Chat realtime dengan optimistic UI.
- Catatan internal yang tidak terlihat customer.
- Lampiran: upload, daftar file, dan download.
- Canned response.
- Tombol **Balasan AI**.
- Ubah status, prioritas, dan assignee sesuai role.
- CSAT dan reopen.
- Notifikasi in-app melalui lonceng.
- Fallback polling dan tombol resync.
- Halaman laporan untuk supervisor/admin.
- Halaman admin untuk user, kategori + SLA, dan knowledge base.
- Portal customer untuk membuat tiket dan melihat tiket sendiri.

### 3.3 Mobile app

- Login customer, agent, supervisor, dan admin.
- Daftar tiket dengan pencarian, filter, pull-to-refresh, dan badge unread.
- Detail chat realtime.
- Status kirim pesan: mengirim, menunggu koneksi, gagal.
- Antrean offline otomatis.
- Buat tiket baru.
- CSAT, reopen, ubah status/assignee untuk staff.
- Balasan AI untuk staff.
- Local notification untuk pesan dan notifikasi baru.
- Pengaturan alamat server untuk emulator atau perangkat fisik.
- Indikator koneksi realtime.

Lampiran di mobile ditampilkan sebagai nama file. Upload penuh dilakukan dari web.

### 3.4 Backend

- REST API dan Socket.IO.
- JWT 12 jam, password bcrypt.
- RBAC di route dan event socket.
- Siklus tiket dengan validasi transisi status.
- SLA first response dan resolution.
- Audit trail melalui `ticket_events`.
- Idempotensi pesan.
- AI auto-reply opsional dengan fallback knowledge base.
- Rate limit login dan pembuatan sesi guest.
- Validasi input, batas ukuran file, dan pembatasan tipe file.
- Auto-close tiket resolved setelah 7 hari.
- Seed data demo.

---

## 4. Arsitektur

### 4.1 Gambaran besar

```
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│ Widget (vanilla JS)  │      │ Web app (vanilla JS) │      │ Mobile (Flutter)     │
│ Shadow DOM, guest    │      │ agent/supervisor/    │      │ customer & agent     │
│ offline queue        │      │ admin/customer       │      │ local notification   │
└──────────┬───────────┘      └──────────┬───────────┘      └──────────┬───────────┘
           │ REST + Socket.IO            │ REST + Socket.IO            │ REST + Socket.IO
           └─────────────────────────────┼─────────────────────────────┘
                                         ▼
                         ┌────────────────────────────────┐
                         │ Node.js + Express + Socket.IO  │
                         │ JWT · RBAC · rate limit        │
                         │ AI reply + knowledge base      │
                         └───────────────┬────────────────┘
                                         ▼
                         ┌────────────────────────────────┐
                         │ SQLite (WAL) + file uploads    │
                         └────────────────────────────────┘
```

### 4.2 Alur request

1. Klien mengirim request REST dengan header `Authorization: Bearer <token>`.
2. Middleware memverifikasi JWT, memuat user aktif, dan menempelkan `req.user`.
3. Route memeriksa role dan kepemilikan tiket.
4. Service menjalankan query atau transaksi.
5. Jika ada perubahan tiket, server menyiarkan `ticket:update` ke room tiket dan staff.
6. Klien lain yang membuka tiket yang sama langsung memperbarui UI.

### 4.3 Alur realtime

- Setelah login, klien membuka koneksi Socket.IO dengan token yang sama.
- Server memasukkan koneksi ke room `user:{id}`, `role:{role}`, dan `staff` bila user adalah staff.
- Saat membuka tiket, klien mengirim `ticket:join`. Server memeriksa akses lalu memasukkan koneksi
  ke `ticket:{id}` dan, untuk staff, `ticket:{id}:staff`.
- Pesan customer disiarkan ke room tiket. Catatan internal hanya ke room staff.
- `ticket:join` juga mengembalikan pesan setelah `last_seq`, sehingga pesan yang terlewat dapat
  dipulihkan tanpa memuat ulang seluruh percakapan.
- Jika koneksi putus, klien beralih ke REST dan polling. Saat reconnect, antrean dikirim ulang.

### 4.4 Pembagian REST dan Socket.IO

REST dipakai untuk aksi yang harus jelas berhasil atau gagal: login, membuat tiket, mengirim pesan,
upload, ubah status, CSAT, laporan, dan admin. Socket.IO dipakai untuk menerima perubahan dengan
cepat: pesan baru, update tiket, notifikasi, typing, presence, dan breach SLA.

Pembagian ini membuat aplikasi tidak bergantung pada satu transport. Jika websocket diblokir
jaringan kantor, pesan tetap dapat dikirim lewat REST.

---

## 5. Struktur Repository

```
.
├── artifacts/
│   └── helpdesk.apk
├── docs/
│   ├── ANALISIS.md
│   ├── BPMN-Helpdesk.pdf
│   ├── BPMN-Helpdesk.drawio
│   ├── PANDUAN-PROYEK.md
│   ├── QA.md
│   ├── WBS-Helpdesk.xlsx
│   ├── screenshots/
│   └── tools/
├── mobile/
│   ├── lib/
│   │   ├── core/        # API client, socket, state, model, session, notifikasi
│   │   ├── screens/     # login, home, tiket, detail, buat tiket, notifikasi, setting
│   │   └── widgets/     # komponen UI bersama
│   └── test/
├── server/
│   ├── src/
│   │   ├── db/          # schema, seed, migrate
│   │   ├── middleware/  # JWT dan RBAC
│   │   ├── realtime/    # Socket.IO, event helper
│   │   ├── routes/      # auth, public, tickets, reports, notifications, admin
│   │   ├── services/    # tickets, messages, AI, access, reports, notifications
│   │   └── utils/       # error, validasi, id, rate limit
│   └── tests/
├── web/
│   ├── css/
│   ├── js/
│   └── index.html
└── widget/
    ├── chat-widget.js
    └── demo.html
```

Pemisahan `routes` dan `services` penting: route mengurus HTTP, validasi awal, dan status code;
service mengurus aturan bisnis dan query database. Dengan begitu aturan yang sama dapat dipakai
dari REST maupun Socket.IO.

---

## 6. Model Data

Database memakai SQLite dengan mode WAL. Nama tabel dan kolom dibuat ramah migrasi ke PostgreSQL.

| Tabel | Fungsi |
|---|---|
| `users` | Akun customer, agent, supervisor, admin, dan guest widget |
| `categories` | Kategori tiket beserta target SLA |
| `tickets` | Data utama tiket, status, assignee, SLA, CSAT, reopen |
| `ticket_messages` | Pesan publik, catatan internal, pesan AI, dan pesan sistem |
| `message_receipts` | Status delivered/read per user |
| `ticket_events` | Audit trail perubahan status, prioritas, assignee, CSAT, SLA |
| `attachments` | Metadata file; file fisik disimpan di folder upload |
| `canned_responses` | Template balasan agent |
| `kb_articles` | Artikel knowledge base untuk AI |
| `notifications` | Notifikasi in-app |
| `ai_logs` | Input, output, model, latency, dan fallback AI |
| `devices` | Disiapkan untuk push token bila FCM ditambahkan |

### 6.1 Mengapa guest memakai tabel `users`

Guest tidak punya password, tetapi tetap membutuhkan identitas untuk memiliki tiket. Daripada
membuat tabel `customers` terpisah yang menduplikasi nama/email, guest disimpan di `users` dengan
`is_guest = 1` dan `password_hash = NULL`. Tiket tetap memakai foreign key ke `users`, sehingga
query dan RBAC lebih sederhana.

Konsekuensinya, email guest harus unik. Jika email sudah dipakai akun terdaftar, widget meminta
customer login. Ini mencegah satu email memiliki dua identitas yang berbeda.

### 6.2 Urutan pesan

Setiap tiket memiliki `seq` yang naik. Kombinasi `(ticket_id, seq)` unik. Ini membuat replay
`after_seq` deterministik dan mencegah pesan terlewat saat reconnect.

### 6.3 Idempotensi

`client_message_id` dibuat klien untuk setiap pesan. Server mencari pesan dengan
`(ticket_id, client_message_id)`. Jika sudah ada, server mengembalikan pesan lama dengan
`duplicate: true`; jika belum, pesan baru dibuat.

Pengecekan dibatasi per tiket. Ini penting agar ID dari tiket lain tidak bisa mengembalikan pesan
yang bukan hak user. Kolom `client_message_id` sendiri tetap unik secara global; jika ada benturan
antar-tiket, server mengembalikan konflik yang jelas, bukan pesan tiket lain.

---

## 7. Siklus Tiket

Status yang dipakai:

| Status | Arti |
|---|---|
| `new` | Tiket masuk, belum ditangani |
| `assigned` | Sudah memiliki assignee |
| `in_progress` | Sedang dikerjakan |
| `pending` | Menunggu informasi dari customer atau pihak lain |
| `resolved` | Solusi diberikan, menunggu konfirmasi/CSAT |
| `closed` | Tiket selesai dan ditutup |

Transisi yang diizinkan:

```
new ─────────► assigned ─────► in_progress ─────► pending ─────► resolved ─────► closed
 │                │                 │                 │              │              │
 └──► in_progress └──► pending      └──► resolved     └──► closed    └──► in_progress
                  └──► resolved                       └──► in_progress
```

Aturan detail:

- Customer tidak boleh mengubah status, prioritas, atau assignee.
- Agent, supervisor, dan admin boleh mengubah status sesuai transisi.
- Assign tiket baru otomatis memindahkan status `new` ke `assigned`.
- Resolve mengisi `resolved_at`.
- Close mengisi `closed_at`.
- Reopen dari `resolved`/`closed` mengosongkan `resolved_at` dan `closed_at`, lalu menaikkan
  `reopen_count`.
- Reopen dibatasi 7 hari sejak `closed_at` atau `resolved_at`.
- Auto-close berjalan setiap interval maintenance untuk tiket `resolved` yang sudah melewati
  `AUTO_CLOSE_DAYS` (default 7 hari).

Audit trail mencatat perubahan penting di `ticket_events`: created, auto_assigned,
status_changed, priority_changed, assignee_changed, category_changed, first_response,
csat_submitted, dan sla_breach.

---

## 8. SLA dan CSAT

### 8.1 SLA

Setiap kategori memiliki `first_response_min` dan `resolution_min`. Saat tiket dibuat, server
menghitung:

- `sla_first_due_at = created_at + first_response_min`
- `sla_resolution_due_at = created_at + resolution_min`

SLA dihitung 24/7 agar sederhana dan mudah diuji. Timer tidak dijeda ketika status `pending`.
Ini keterbatasan yang disadari; pada produksi, jam kerja dan pause SLA biasanya diperlukan.

Setiap interval `SLA_TICK_MS` (default 30 detik), server mencari tiket terbuka yang melewati
deadline dan belum pernah ditandai breach. Jika ditemukan:

- `sla_first_breached_at` atau `sla_resolved_breached_at` diisi.
- Event `sla_breach` dicatat.
- Notifikasi dikirim ke agent dan supervisor.
- Event `sla:breach` dan `ticket:update` disiarkan ke staff.

First response dihitung saat staff mengirim pesan publik pertama. Balasan AI tidak dihitung sebagai
first response manusia, sehingga target tetap memberi sinyal apakah customer sudah dilayani agent.

### 8.2 CSAT

Customer dapat memberi rating 1–5 setelah tiket `resolved` atau `closed`. Komentar opsional.
Rating disimpan di `tickets.csat_rating` dan `csat_comment`, lalu muncul di laporan.

### 8.3 Auto-close

Fitur ini menutup tiket resolved yang tidak segera dikonfirmasi customer. Tujuannya menjaga inbox
tetap bersih tanpa menghilangkan riwayat. Customer masih dapat reopen selama batas 7 hari.

Konfigurasi:

```env
AUTO_CLOSE=true
AUTO_CLOSE_DAYS=7
```

Auto-close dapat dimatikan dengan `AUTO_CLOSE=false`.

---

## 9. AI Auto-Reply dan Knowledge Base

AI bersifat opsional. Tujuannya memberi jawaban awal yang cepat, bukan menggantikan agent.

### 9.1 Alur saat tiket dibuat

1. Tiket disimpan.
2. Jika `AI_AUTO_REPLY` aktif, server menunggu sekitar 1,2 detik untuk memberi kesempatan agent
   merespons lebih dulu.
3. Server memeriksa ulang tiket. Jika sudah resolved/closed atau sudah ada first response manusia,
   AI tidak membalas.
4. Server menyusun konteks dari subjek, deskripsi, beberapa pesan terakhir, dan artikel KB yang
   relevan.
5. Jika `AI_API_KEY` tersedia, server memanggil endpoint OpenAI-compatible.
6. Jika tidak ada key, timeout, atau error, server memakai fallback keyword matching terhadap
   `kb_articles`.
7. Pesan AI disimpan dengan `sender_type = 'ai'`.
8. Hasil, model, latency, dan status fallback dicatat di `ai_logs`.

### 9.2 Tombol Balasan AI

Staff juga dapat meminta balasan AI kapan saja dari web atau mobile. Endpoint
`POST /api/tickets/:id/ai-reply` memakai alur yang sama. Hasilnya tetap berupa pesan yang dapat
diedit atau ditindaklanjuti agent.

### 9.3 Batasan AI

- AI tidak menutup tiket dan tidak mengubah status.
- AI tidak dihitung sebagai first response manusia.
- Tanpa API key, kualitas jawaban terbatas pada kecocokan kata dengan KB.
- Prompt berisi data customer; pada produksi perlu kebijakan retensi dan redaksi data sensitif.

---

## 10. Selalu Terhubung

### 10.1 Lapisan koneksi

| Skenario | Perilaku |
|---|---|
| Socket terhubung | Pesan dan update tiket dikirim seketika |
| Socket terputus | Widget/mobile/web memakai REST; UI menampilkan status offline |
| Pesan gagal | Disimpan di antrean lokal |
| Reconnect | Antrean dikirim ulang dengan `client_message_id` yang sama |
| Event terlewat | `ticket:join {last_seq}` mengembalikan pesan setelah seq terakhir |
| Multi-kanal | Widget, web, dan mobile masuk ke room tiket yang sama |

### 10.2 Widget

- Menyimpan token, user, tiket, pesan, dan antrean di `localStorage`.
- Jika socket tidak tersedia, pesan dikirim lewat REST.
- Jika REST juga gagal karena jaringan, pesan masuk antrean dan ditandai "Menunggu koneksi".
- Saat reconnect, antrean dikirim satu per satu. Pesan yang sudah diterima server tidak digandakan.
- Jika server menolak pesan (misalnya tiket sudah ditutup), pesan ditandai gagal dan dapat di-retry.

### 10.3 Mobile

- Menyimpan sesi, alamat server, dan antrean di `shared_preferences`.
- Antrean dikirim lewat REST, tidak bergantung pada socket.
- Pengiriman antrean dilindungi flag agar tidak berjalan ganda.
- Jika token kedaluwarsa saat flush, user diarahkan login kembali.
- Pesan yang ditolak validasi dibuang agar antrean tidak macet.
- Pesan yang gagal karena jaringan atau server 5xx tetap disimpan.

### 10.4 Web

- Menggunakan REST untuk aksi dan Socket.IO untuk event.
- Polling REST setiap 8 detik saat socket tidak terhubung.
- Listener socket dan timer dibersihkan saat logout agar tidak menumpuk.
- Notifikasi in-app tetap tersedia meski halaman laporan atau admin sedang dibuka.

### 10.5 Presence

Presence menghitung jumlah koneksi per user, bukan sekadar ada/tidak ada. Jika agent membuka dua
tab lalu menutup satu, status tetap online sampai tab terakhir ditutup. Ini mencegah status offline
palsu.

Presence bersifat informatif. Aplikasi belum mengunci tiket untuk mencegah dua agent membalas
bersamaan.

---

## 11. Keamanan

### 11.1 Autentikasi

- Login memakai email dan password.
- Password di-hash dengan bcrypt (cost 10).
- JWT ditandatangani dengan `JWT_SECRET`, berlaku 12 jam.
- Setiap request privat memuat ulang user dari database, sehingga akun yang dinonaktifkan langsung
  kehilangan akses meskipun tokennya belum kedaluwarsa.
- Pada `NODE_ENV=production`, server menolak berjalan tanpa `JWT_SECRET`.

### 11.2 Otorisasi

- `requireRole` membatasi route admin.
- `assertTicketAccess` memastikan customer hanya membuka tiket miliknya.
- Pembuatan user hanya admin. Agent dapat melihat daftar user untuk kebutuhan assign, tetapi tidak
  dapat menambah atau mengubah user.
- Perubahan kategori dan knowledge base hanya admin.
- Admin tidak dapat menurunkan role atau menonaktifkan akunnya sendiri lewat API.
- Catatan internal disaring di service pesan; customer tidak menerimanya lewat REST maupun socket.
- Socket memakai pemeriksaan akses yang sama sebelum join atau mengirim pesan.

### 11.3 Validasi input

- Field wajib, email, role, status, prioritas, dan angka positif divalidasi.
- `is_active` dan `is_published` menerima boolean/0/1 secara eksplisit; nilai lain ditolak.
- Panjang teks dibatasi per field.
- Upload dibatasi 5 MB dan tipe file tertentu.
- Otorisasi tiket dilakukan **sebelum** Multer menulis file ke disk.
- Jika metadata gagal disimpan, file yang sudah terupload dihapus.

### 11.4 XSS

Web dan widget memakai fungsi `esc()` untuk semua data yang berasal dari pengguna sebelum
dimasukkan ke `innerHTML`. Ini mencakup subjek, isi pesan, nama, email, nama file, komentar CSAT,
judul notifikasi, dan nilai event audit.

Gambar atau HTML mentah tidak dirender. Pesan selalu ditampilkan sebagai teks.

### 11.5 Rate limit dan CORS

- Login dan pembuatan sesi guest dibatasi per IP.
- CORS dibuka agar widget dapat ditempel di domain lain. Pada produksi, origin sebaiknya dibatasi
  ke domain customer dan dashboard.
- Folder upload tidak diekspos sebagai static; download melewati endpoint yang memeriksa akses.

### 11.6 Yang belum ada

- Refresh token dan revokasi token.
- 2FA.
- Enkripsi end-to-end.
- Audit log admin terpisah.
- Pembatasan CORS per tenant.
- Sanitasi prompt AI terhadap prompt injection.

Semua ini bukan syarat take-home, tetapi penting disebut agar batas keamanan aplikasi jelas.

---

## 12. API dan Socket.IO

### 12.1 REST utama

| Method | Endpoint | Akses |
|---|---|---|
| `POST` | `/api/auth/login` | Publik |
| `GET` | `/api/auth/me` | Login |
| `GET` | `/api/public/categories` | Publik |
| `POST` | `/api/public/session` | Publik |
| `GET/POST` | `/api/tickets` | Login; customer melihat tiket sendiri |
| `GET/PATCH` | `/api/tickets/:id` | Pemilik tiket atau staff |
| `GET/POST` | `/api/tickets/:id/messages` | Pemilik tiket atau staff |
| `POST` | `/api/tickets/:id/attachments` | Pemilik tiket atau staff |
| `POST` | `/api/tickets/:id/csat` | Customer pemilik tiket |
| `POST` | `/api/tickets/:id/reopen` | Pemilik tiket atau staff |
| `POST` | `/api/tickets/:id/ai-reply` | Staff |
| `GET` | `/api/reports/summary` | Supervisor/admin |
| `GET` | `/api/notifications` | Login |
| `GET/POST/PATCH` | `/api/users` | Admin untuk perubahan; staff untuk daftar |
| `GET/POST/PATCH` | `/api/categories` | Staff untuk daftar; admin untuk perubahan |
| `GET/POST/PATCH` | `/api/kb` | Admin untuk perubahan |

### 12.2 Socket.IO

Auth:

```js
const socket = io('http://localhost:3000', { auth: { token } });
```

Event penting:

| Event | Arah | Keterangan |
|---|---|---|
| `ticket:join` | client → server | Join room, ambil tiket dan pesan setelah `last_seq` |
| `ticket:leave` | client → server | Keluar dari room tiket |
| `message:send` | client → server | Kirim pesan dengan ack |
| `typing` | dua arah | Indikator mengetik |
| `message:read` | dua arah | Tanda pesan dibaca |
| `presence:list` | client → server | Daftar staff online |
| `message:new` | server → client | Pesan baru |
| `ticket:update` | server → client | Snapshot tiket berubah |
| `ticket:created` | server → client | Tiket baru untuk staff |
| `notification:new` | server → client | Notifikasi in-app |
| `sla:breach` | server → client | SLA terlampaui |
| `presence:update` | server → client | Staff online/offline |

Contoh ack `message:send`:

```json
{
  "ok": true,
  "duplicate": false,
  "client_message_id": "b2e1...",
  "message_id": "8f0a...",
  "seq": 4,
  "created_at": "2026-10-23T04:12:00.000Z"
}
```

---

## 13. Keputusan Teknologi

### 13.1 Node.js + Express

Alasan:

- Satu bahasa untuk backend dan widget/web.
- Ekosistem Socket.IO matang.
- Express ringan dan mudah dibaca reviewer.
- Tidak memerlukan build step untuk server.

Trade-off: Node cocok untuk banyak koneksi I/O, tetapi bukan pilihan terbaik untuk CPU-bound
processing. Untuk helpdesk dengan beban normal, ini sesuai.

### 13.2 Socket.IO

Alasan:

- Room, ack, reconnect, heartbeat, dan fallback polling sudah tersedia.
- Client tersedia untuk JavaScript dan Flutter (`socket_io_client`).
- Lebih cepat diintegrasikan daripada WebSocket murni.

Trade-off: menambah ukuran dependency dan protokolnya bukan WebSocket murni. Untuk kebutuhan
"selalu terhubung", fitur bawaan Socket.IO sepadan.

### 13.3 SQLite + better-sqlite3

Alasan:

- Tidak perlu server database terpisah.
- File database mudah diperiksa dan di-reset.
- Transaksi sinkron memudahkan konsistensi pada aplikasi single-node.
- WAL memberi pembacaan yang baik saat penulisan berjalan.

Trade-off: tidak cocok untuk multi-instance horizontal. Jika aplikasi tumbuh, migrasi ke
PostgreSQL dan Redis adapter adalah langkah alami.

### 13.4 Vanilla JavaScript untuk web dan widget

Alasan:

- Memenuhi syarat JavaScript tanpa menambah kompleksitas build.
- Fresh clone langsung jalan; tidak ada `node_modules` untuk frontend.
- Widget harus ringan dan tidak boleh membawa framework besar ke website customer.
- Shadow DOM mengisolasi style.

Trade-off: tanpa framework, pengelolaan state dan render dilakukan manual. Karena itu kode
dipisah per view, listener dibersihkan saat unmount, dan semua interpolasi HTML memakai `esc()`.

### 13.5 Flutter

Alasan:

- Satu basis kode untuk Android dan Windows.
- `socket_io_client` kompatibel dengan server.
- Widget material siap pakai.
- Local notification tersedia tanpa Firebase.

Trade-off: ukuran APK lebih besar daripada aplikasi native sederhana. Untuk demo dan kebutuhan
lintas platform, ini pilihan yang wajar.

### 13.6 JWT + bcrypt

Alasan:

- Stateless, cocok untuk REST dan handshake Socket.IO.
- Tidak memerlukan session store.
- bcrypt adalah pilihan standar untuk password.

Trade-off: revokasi token tidak instan kecuali user dinonaktifkan (yang memang dicek ulang).
Refresh token dapat ditambahkan nanti.

### 13.7 AI opsional dengan fallback

Alasan:

- Demo tetap berjalan tanpa API key.
- Biaya dan ketergantungan vendor tidak menjadi blocker.
- Fallback KB memberi jawaban yang dapat diprediksi.

Trade-off: kualitas fallback terbatas pada keyword matching. AI juga tidak menggantikan agent.

---

## 14. Pengujian

### 14.1 Backend

`server/tests/api.test.js` memakai Vitest, Supertest, dan `socket.io-client`. Cakupan:

1. Health check dan proteksi endpoint privat.
2. Login benar/salah.
3. Guest session dan konflik email.
4. Siklus tiket lengkap: buat, assign, pesan, catatan internal, resolve, CSAT, reopen.
5. RBAC: customer tidak boleh ubah status; laporan hanya supervisor/admin; pembuatan user hanya
   admin; agent tidak boleh ubah kategori; admin tidak boleh menurunkan role sendiri.
6. Idempotensi pesan dan isolasi antar-tiket.
7. Socket: join, pesan, retry, update tiket, catatan internal hanya ke staff.
8. Auto-close tiket resolved dan idempotensi sweep.

Perintah:

```bash
cd server
npm test
```

### 14.2 Mobile

```bash
cd mobile
flutter analyze
flutter test
```

Test mencakup parsing payload tiket, status tiket, formatter, dan render `StatusChip`.

### 14.3 Manual E2E

Skenario yang diperiksa:

- Login semua role di web.
- Widget guest membuat tiket dan muncul realtime di inbox.
- Agent membalas dari web, widget menerima tanpa refresh.
- Tiket yang sama dibuka di mobile agent.
- Agent mengirim pesan dari mobile.
- Customer mengirim pesan, mobile menerima realtime.
- CSAT dari widget dan tampil di laporan.
- Laporan supervisor.
- Admin user/kategori/KB.
- APK release di emulator Android.
- Fresh clone, `npm ci`, test, dan server.
- Reseed data demo.

Detail hasil ada di `docs/QA.md`.

### 14.4 Yang belum diuji otomatis

- UI end-to-end lintas browser.
- Upload file di semua tipe.
- Notifikasi lokal di perangkat fisik.
- Beban tinggi dan multi-instance.
- Keamanan secara formal (penetration test).

---

## 15. Skrip Demo 5 Menit

1. **Buka web** `http://localhost:3000`, login sebagai agent.
2. **Buka widget** `http://localhost:3000/widget/demo.html` di tab lain.
3. Isi nama dan email baru, kirim pesan. Tunjukkan tiket muncul di inbox agent tanpa refresh.
4. Balas dari web. Tunjukkan balasan muncul di widget.
5. **Buka mobile**, login sebagai customer yang sama, buka tiket, dan lanjutkan percakapan.
6. Dari web, ubah status menjadi **Resolved**. Tunjukkan CSAT muncul di widget/mobile.
7. Isi CSAT. Tunjukkan rating masuk ke laporan supervisor.
8. **Matikan server** sebentar. Kirim pesan dari widget/mobile. Tunjukkan status antre.
9. Nyalakan server. Tunjukkan pesan terkirim otomatis tanpa duplikasi.
10. Buka **Laporan** sebagai supervisor dan **Pengaturan** sebagai admin.

Jika waktu terbatas, fokus pada langkah 3–6 karena menunjukkan nilai utama: satu tiket, tiga kanal,
realtime, dan status yang konsisten.

---

## 16. Pertanyaan Interview dan Jawaban

### Mengapa memilih widget, web, dan mobile dalam satu repo?

Karena inti masalahnya adalah konsistensi data lintas kanal. Dengan satu repo dan satu backend,
perubahan kontrak API, model data, dan perilaku realtime dapat diuji bersama. Untuk take-home,
monorepo juga memudahkan reviewer menjalankan semuanya.

### Mengapa web dan widget tidak memakai React?

Kebutuhan utamanya adalah widget yang ringan dan web yang mudah dijalankan tanpa build. Vanilla JS
mengurangi dependensi dan membuat fresh clone langsung berfungsi. Konsekuensinya, saya harus
disiplin mengelola render dan listener. Kode dipisah per view, dan semua data pengguna di-escape.

### Bagaimana mencegah pesan ganda saat retry?

Klien membuat `client_message_id` unik. Server mencari kombinasi tiket dan ID tersebut. Jika sudah
ada, server mengembalikan pesan lama dengan `duplicate: true`. Jika belum, pesan baru dibuat dalam
transaksi. Ini berlaku untuk REST dan Socket.IO.

### Bagaimana jika socket putus?

Aksi tetap memakai REST. Widget dan mobile menyimpan pesan yang gagal ke antrean lokal. Saat
koneksi pulih, antrean dikirim ulang. `ticket:join` dengan `last_seq` mengambil pesan yang terlewat.
Web juga melakukan polling saat socket tidak terhubung.

### Mengapa memakai SQLite? Bagaimana jika pengguna bertambah?

SQLite dipilih karena demo tidak memerlukan server database dan transaksi sinkron memudahkan
konsistensi. Untuk produksi multi-instance, saya akan migrasi ke PostgreSQL, menambahkan connection
pool, dan memakai Redis adapter untuk Socket.IO agar broadcast antar-instance bekerja.

### Bagaimana RBAC diterapkan?

Ada tiga lapis: UI menyembunyikan menu, route memeriksa role, dan service memeriksa kepemilikan
tiket. Socket juga memakai pemeriksaan yang sama sebelum join atau mengirim pesan. Jadi memanggil
API langsung tetap ditolak.

### Bagaimana menangani XSS?

Semua data pengguna di-escape sebelum masuk ke HTML. Tidak ada rendering HTML mentah dari pesan.
Untuk file, nama file di-escape dan download melewati endpoint yang memeriksa akses.

### Bagaimana AI diuji dan dibatasi?

AI opsional. Tanpa API key, sistem memakai fallback KB. AI tidak menutup tiket, tidak dihitung
sebagai first response manusia, dan tidak membalas jika agent sudah merespons lebih dulu. Setiap
panggilan dicatat di `ai_logs` untuk audit.

### Apa trade-off yang paling terasa?

Pengelolaan state manual di web dan widget. Framework akan mengurangi boilerplate, tetapi menambah
build step dan ukuran widget. Saya memilih trade-off ini karena syaratnya adalah JavaScript dan
widget harus ringan.

### Apa yang akan ditingkatkan jika ada waktu?

- PostgreSQL + Redis untuk skala horizontal.
- FCM untuk notifikasi saat aplikasi mati.
- SLA pause saat status Pending dan kalender jam kerja.
- Refresh token dan revokasi sesi.
- Escalation L2 sebagai modul terpisah.
- E2E test dengan Playwright untuk web dan integration test Flutter.
- Pembatasan CORS per domain customer.

---

## 17. Keterbatasan yang Perlu Disebut Jujur

1. **Single-node.** SQLite dan Socket.IO tanpa adapter tidak dirancang untuk banyak instance.
2. **Notifikasi mobile lokal.** Tidak ada FCM, jadi notifikasi tidak muncul saat proses aplikasi
   benar-benar berhenti.
3. **SLA 24/7.** Belum ada pause saat pending atau jam kerja.
4. **Lampiran.** Widget tidak mendukung upload; mobile hanya menampilkan nama file.
5. **AI.** Tanpa API key, kualitas jawaban terbatas. Prompt injection belum ditangani khusus.
6. **Eskalasi L2.** Tergambar di BPMN sebagai proses target, belum menjadi modul aplikasi.
7. **Token storage.** Web memakai `localStorage`; mobile memakai `shared_preferences`. Untuk
   produksi, token sebaiknya disimpan di secure storage.
8. **APK.** Ditandatangani dengan debug key untuk kemudahan demo, bukan untuk distribusi publik.

Menyebutkan batasan ini lebih baik daripada mengklaim aplikasi siap produksi. Yang penting adalah
alasan di balik batasan dan langkah lanjutan yang jelas.

---

## 18. Menjalankan Proyek

### 18.1 Backend dan web

```bash
cd server
npm install
npm run seed
npm start
```

Buka:

- Web: <http://localhost:3000/>
- Widget demo: <http://localhost:3000/widget/demo.html>
- Health: <http://localhost:3000/health>

### 18.2 Mobile

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000
```

Untuk perangkat fisik, ganti `10.0.2.2` dengan IP LAN komputer. Alamat juga dapat diubah dari
halaman login atau menu Pengaturan.

### 18.3 Build APK

```bash
cd mobile
flutter build apk --release --dart-define=API_BASE=http://10.0.2.2:3000
```

Hasil build disalin ke `artifacts/helpdesk.apk`.

### 18.4 Konfigurasi environment

```env
PORT=3000
JWT_SECRET=ganti-di-produksi
DB_PATH=./data/helpdesk.db
UPLOAD_DIR=./uploads
SLA_TICK_MS=30000
AUTO_CLOSE=true
AUTO_CLOSE_DAYS=7
AI_AUTO_REPLY=true
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=12000
```

Tanpa `AI_API_KEY`, aplikasi tetap berjalan dengan fallback knowledge base.

---

## 19. Akun Demo

| Role | Email | Password |
|---|---|---|
| Admin | `admin@helpdesk.test` | `Admin123!` |
| Supervisor | `supervisor@helpdesk.test` | `Super123!` |
| Agent | `agent@helpdesk.test` | `Agent123!` |
| Agent 2 | `agent2@helpdesk.test` | `Agent123!` |
| Customer | `customer@helpdesk.test` | `Cust123!` |

Widget membuat guest baru berdasarkan email. Gunakan email baru untuk sesi guest baru.

---

## 20. Ringkasan untuk Interview

Jika diminta menjelaskan proyek dalam satu menit:

> Ciheul Helpdesk adalah aplikasi layanan pelanggan dengan satu tiket yang bisa dilanjutkan dari
> widget, web, dan mobile. Backend Node.js menyimpan data di SQLite, menyediakan REST untuk aksi
> dan Socket.IO untuk update realtime. Setiap pesan punya ID idempoten sehingga aman dikirim ulang
> saat offline. Ada RBAC, SLA, CSAT, audit trail, AI opsional dengan fallback knowledge base, dan
> auto-close. Saya memilih vanilla JS untuk widget agar ringan, Flutter untuk mobile agar satu
> basis kode, dan SQLite agar demo mudah dijalankan. Batasan utamanya single-node, notifikasi lokal,
> dan SLA 24/7; langkah produksinya PostgreSQL, Redis, FCM, dan secure storage.

Yang perlu ditekankan: alasan keputusan, bukan hanya daftar fitur. Interviewer biasanya lebih
tertarik pada bagaimana Anda menangani kegagalan, keamanan, dan trade-off daripada jumlah halaman.
