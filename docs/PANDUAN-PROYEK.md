# Catatan Proyek

Catatan ini untuk menjelaskan isi repo, cara menjalankannya, dan keputusan yang diambil.
Bukan dokumentasi produk.

## Isi repo

| Bagian | Isi |
|---|---|
| `widget/` | Live chat widget, satu file JS, memakai Shadow DOM |
| `web/` | Dashboard customer/staff, JavaScript tanpa build step |
| `server/` | REST API, Socket.IO, SQLite |
| `mobile/` | Flutter app untuk Android/Windows |
| `docs/` | BPMN, WBS, catatan analisis, QA, generator |
| `artifacts/` | APK release |

Backend dan database dipakai bersama oleh widget, web, dan mobile. Satu tiket bisa dibuka
dari kanal mana pun dan riwayatnya tetap sama.

## Menjalankan

```bash
cd server
npm ci
npm run seed
npm start
```

Kalau database kosong, server menjalankan seed sendiri. Perintah `npm run seed` dipakai kalau
ingin mengembalikan data demo.

- Web: `http://localhost:3000/`
- Widget demo: `http://localhost:3000/widget/demo.html`
- Health: `http://localhost:3000/health`

Akun demo:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@helpdesk.test` | `Admin123!` |
| Supervisor | `supervisor@helpdesk.test` | `Super123!` |
| Agent | `agent@helpdesk.test` | `Agent123!` |
| Agent 2 | `agent2@helpdesk.test` | `Agent123!` |
| Customer | `customer@helpdesk.test` | `Cust123!` |

Guest widget tidak memakai password. Email guest harus unik. Kalau email sudah dipakai akun
lain, widget akan menolak dan meminta login.

## Alur data

1. Widget/mobile membuat tiket lewat REST.
2. `tickets.createTicket` menentukan prioritas dari kategori, menghitung deadline SLA, dan
   memilih agent aktif dengan tiket terbuka paling sedikit.
3. Pesan pertama disimpan sebagai `ticket_messages` dengan `seq = 1`.
4. Server mengirim `ticket:created` ke staff. Kalau AI auto-reply aktif, balasan AI dibuat
   setelah 1,2 detik.
5. Agent membuka tiket. Klien memanggil `ticket:join` dengan `last_seq` untuk mengambil pesan
   yang belum ada.
6. Aksi seperti kirim pesan, ubah status, dan upload tetap lewat REST. Socket hanya membawa
   update dan notifikasi.

Auto-assign bisa dimatikan lewat parameter internal `autoAssign: false`, tetapi route REST
saat ini selalu memakai nilai default.

## Status tiket

| Status | Arti |
|---|---|
| `new` | Belum punya assignee |
| `assigned` | Sudah punya assignee |
| `in_progress` | Sedang dikerjakan |
| `pending` | Menunggu informasi |
| `resolved` | Sudah diberi solusi |
| `closed` | Sudah ditutup |

Transisi dibatasi di `utils/validate.js`. Reopen dari `resolved`/`closed` mengosongkan
`resolved_at` dan `closed_at`, lalu menambah `reopen_count`. Reopen masih diterima sampai
7 hari sejak `resolved_at`/`closed_at`.

Auto-close berjalan di maintenance loop. Tiket `resolved` yang lebih tua dari
`AUTO_CLOSE_DAYS` (default 7) diubah menjadi `closed`. Bisa dimatikan dengan
`AUTO_CLOSE=false`.

## SLA dan CSAT

SLA mengikuti kategori:

| Kategori | Priority default | First response | Resolution |
|---|---|---|---|
| Technical Issue | high | 15 menit | 8 jam |
| Billing & Payment | medium | 30 menit | 24 jam |
| Feature Request | low | 2 jam | 72 jam |

Deadline dihitung saat tiket dibuat. SLA berjalan 24/7 dan tidak dijeda saat `pending`.
Setiap `SLA_TICK_MS` (default 30 detik), server mencari tiket yang lewat deadline dan belum
ditandai breach. Kalau ketemu, server mencatat event, mengirim notifikasi ke agent/supervisor,
dan menyiarkan `sla:breach`.

First response dihitung dari pesan publik pertama staff, bukan balasan AI. CSAT 1–5 bisa diisi
setelah tiket `resolved` atau `closed`.

## Realtime dan antrean

Socket.IO dipakai untuk:

- `message:new`
- `ticket:update` dan `ticket:created`
- `notification:new`
- `typing` dan `message:read`
- `presence:update` dan `presence:list`
- `sla:breach`

Room:

- `ticket:{id}` untuk semua peserta.
- `ticket:{id}:staff` untuk catatan internal.
- `user:{id}` untuk notifikasi user.
- `staff` untuk event staff.

Yang perlu diingat saat mengubah bagian ini:

- Jangan mengirim catatan internal ke room tiket biasa.
- `emitTicket` mengirim update ke room tiket dan staff lain. Helper ini ada di
  `realtime/events.js`.
- Presence disimpan sebagai jumlah koneksi per user, bukan boolean.
- `ticket:join` mengecek akses sebelum socket masuk room.
- Kalau socket pindah tiket, room lama harus ditinggalkan.

Widget dan mobile menyimpan pesan yang gagal ke antrean lokal. Saat koneksi pulih, pesan
dikirim ulang dengan `client_message_id` yang sama. Server mengecek kombinasi tiket + ID;
retry pada tiket yang sama mengembalikan pesan lama.

Widget memakai `localStorage`, mobile memakai `shared_preferences`. Web tidak punya antrean
pesan; kalau socket putus, web memakai REST dan polling.

## Auth dan role

- Login memakai JWT 12 jam. Password di-hash dengan bcrypt.
- Setiap request privat memuat ulang user dari database, jadi akun yang dinonaktifkan langsung
  kehilangan akses.
- `requireRole` dipakai untuk route admin. Pengecekan pemilik tiket ada di
  `services/access.js`.
- Admin tidak bisa menurunkan role atau menonaktifkan akunnya sendiri lewat API.
- Catatan internal disaring di service pesan dan hanya dikirim ke staff.
- Rate limit login 15 request/menit per IP; guest session 20 request/menit.

CORS saat ini terbuka untuk semua origin karena widget perlu ditempel di domain lain. Kalau
dipakai di luar demo, origin sebaiknya dibatasi ke domain customer dan dashboard.

## Lampiran

- Maksimal 5 MB.
- Tipe yang diterima: PNG/JPEG/GIF/WebP, PDF, TXT, DOCX, XLSX.
- Otorisasi tiket dicek sebelum Multer menulis file.
- Kalau insert metadata gagal, file yang sudah ditulis dihapus.
- Folder upload tidak diekspos sebagai static. Download lewat `/api/attachments/:id` yang
  mengecek akses tiket.

Widget tidak punya UI upload. Mobile hanya menampilkan nama file yang sudah ada di pesan.

## AI

AI opsional. Alurnya:

1. Ambil beberapa artikel `kb_articles` yang published.
2. Susun prompt dan kirim ke endpoint OpenAI-compatible kalau `AI_API_KEY` diisi.
3. Kalau key kosong, timeout, atau provider error, pakai pencocokan kata terhadap KB.
4. Simpan hasil, model, latency, dan status fallback ke `ai_logs`.
5. Simpan balasan sebagai pesan dengan `sender_type = 'ai'`.

AI auto-reply dilewati kalau agent sudah mengirim first response atau tiket sudah
resolved/closed. Balasan AI tidak menutup tiket dan tidak dihitung sebagai first response
manusia.

Tombol **Balasan AI** di web/mobile memakai service yang sama. Tanpa API key, tombol ini tetap
menghasilkan jawaban dari fallback KB.

## Database

| Tabel | Isi |
|---|---|
| `users` | Semua akun, termasuk guest (`is_guest = 1`) |
| `categories` | Nama, prioritas default, target SLA |
| `tickets` | Tiket, status, assignee, deadline, CSAT, reopen |
| `ticket_messages` | Pesan dan catatan internal, `seq` per tiket |
| `message_receipts` | Delivered/read per user |
| `ticket_events` | Riwayat perubahan |
| `attachments` | Metadata file |
| `canned_responses` | Template agent |
| `kb_articles` | Artikel untuk AI/fallback |
| `notifications` | Notifikasi in-app |
| `ai_logs` | Log panggilan AI |
| `devices` | Disiapkan untuk push token, belum dipakai |

`client_message_id` unik global di schema, tetapi pengecekan idempotensi dibatasi per tiket.
Kalau ID yang sama dipakai di tiket lain, server mengembalikan 409. Ini mencegah pesan tiket
lain ikut terkirim.

## Kenapa memakai teknologi ini

| Pilihan | Alasan | Konsekuensi |
|---|---|---|
| Node.js + Express | Satu bahasa dengan web/widget, mudah dijalankan | Bukan pilihan untuk proses CPU berat |
| Socket.IO | Room, ack, reconnect, fallback polling sudah ada | Dependency lebih besar dari WebSocket murni |
| SQLite + better-sqlite3 | Tidak perlu setup database, transaksi sederhana | Tidak cocok untuk banyak instance |
| Vanilla JS | Tanpa build step, widget ringan | State dan render harus diatur manual |
| Flutter | Satu kode untuk Android/Windows | Ukuran APK lebih besar |
| JWT + bcrypt | Stateless, cocok untuk REST dan socket | Belum ada refresh/revoke token |
| AI opsional | Demo tetap jalan tanpa API key | Fallback hanya pencocokan kata |

## Testing

```bash
cd server
npm test

cd mobile
flutter analyze
flutter test
```

Hasil terakhir: 9 test backend lulus, 4 test Flutter lulus, analyze tanpa issue. Detail
skenario dan hasil manual ada di [`QA.md`](QA.md).

Yang belum ada test otomatis: UI lintas browser, upload file semua tipe, notifikasi di
perangkat fisik, dan pengujian beban.

## Demo singkat

1. Login web sebagai agent.
2. Buka widget demo di tab lain, isi nama/email, kirim pesan.
3. Tiket muncul di inbox. Balas dari web.
4. Buka tiket yang sama di mobile, lanjutkan chat.
5. Set status resolved, isi CSAT dari widget.
6. Matikan server, kirim pesan dari widget/mobile, nyalakan lagi. Pesan masuk antrean lalu
   terkirim tanpa duplikasi.
7. Buka laporan sebagai supervisor dan halaman admin sebagai admin.

## Batasan

- SQLite dan Socket.IO tanpa adapter hanya untuk satu instance.
- Notifikasi mobile lokal, belum FCM.
- SLA 24/7, belum ada pause atau jam kerja.
- Belum ada refresh token, SSO, dan enkripsi pesan di sisi klien.
- Token web di `localStorage`, mobile di `shared_preferences`.
- Widget tanpa upload lampiran; mobile hanya menampilkan nama file.
- APK memakai debug signing key.
- AI belum punya perlindungan khusus untuk prompt injection.
- Seed memakai password demo.

## Yang bisa dikerjakan berikutnya

- PostgreSQL dan Redis adapter kalau perlu lebih dari satu instance.
- FCM untuk notifikasi saat aplikasi mati.
- Pause SLA saat `pending` dan kalender jam kerja.
- Refresh token dan revokasi sesi.
- Modul eskalasi L2 kalau alur BPMN mau diimplementasikan penuh.
- Test alur web dan integration test Flutter.
- Pembatasan CORS per domain customer.
