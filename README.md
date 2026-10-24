# Ciheul Helpdesk

Repo ini berisi demo helpdesk untuk take-home test Software Engineer di Ciheul Technologies.
Isinya: live chat widget, dashboard web, backend Node.js, dan aplikasi Flutter. Semua kanal
memakai backend dan database yang sama.

| Isi | Lokasi |
|---|---|
| BPMN | [`docs/BPMN-Helpdesk.pdf`](docs/BPMN-Helpdesk.pdf) |
| WBS | [`docs/WBS-Helpdesk.xlsx`](docs/WBS-Helpdesk.xlsx) |
| Catatan analisis | [`docs/ANALISIS.md`](docs/ANALISIS.md) |
| Catatan proyek | [`docs/PANDUAN-PROYEK.md`](docs/PANDUAN-PROYEK.md) |
| Hasil pengujian | [`docs/QA.md`](docs/QA.md) |
| Widget | [`widget/`](widget) |
| Web app | [`web/`](web) |
| Backend | [`server/`](server) |
| Mobile | [`mobile/`](mobile) |
| APK | [`artifacts/helpdesk.apk`](artifacts/helpdesk.apk) |

Repository: <https://github.com/Fanadillah/ciheul-helpdesk>

## Menjalankan

Butuh Node.js 20 atau lebih baru. Web dan widget tidak punya build step.

```bash
cd server
npm ci
npm run seed
npm start
```

Kalau database masih kosong, server akan menjalankan seed otomatis. `npm run seed` berguna
kalau ingin mengembalikan data demo ke kondisi awal.

| Halaman | URL |
|---|---|
| Web app | <http://localhost:3000/> |
| Widget demo | <http://localhost:3000/widget/demo.html> |
| Health check | <http://localhost:3000/health> |

Akun demo:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@helpdesk.test` | `Admin123!` |
| Supervisor | `supervisor@helpdesk.test` | `Super123!` |
| Agent | `agent@helpdesk.test` | `Agent123!` |
| Agent 2 | `agent2@helpdesk.test` | `Agent123!` |
| Customer | `customer@helpdesk.test` | `Cust123!` |

Widget memakai nama dan email, lalu membuat akun guest. Tidak ada password untuk guest.
Pakai email baru kalau ingin mulai sesi guest baru.

## Alur demo

1. Buka widget demo, isi nama dan email, kirim pesan.
2. Login web sebagai agent. Tiket baru harus muncul di inbox.
3. Balas dari web. Balasan masuk ke widget tanpa refresh.
4. Buka tiket yang sama dari mobile, lalu lanjutkan chat dari sana.
5. Ubah status ke Resolved. Customer bisa memberi rating CSAT.
6. Matikan server sebentar, kirim pesan dari widget atau mobile, lalu nyalakan lagi.
   Pesan masuk antrean dan dikirim ulang saat koneksi kembali.

## Struktur

```text
.
├── artifacts/        APK release
├── docs/             BPMN, WBS, catatan, screenshot
├── mobile/           Flutter app (Android/Windows)
├── server/
│   ├── src/
│   │   ├── db/       schema, seed, migrate
│   │   ├── middleware/ auth dan role
│   │   ├── realtime/ Socket.IO dan helper event
│   │   ├── routes/   endpoint REST
│   │   └── services/ tiket, pesan, SLA, AI, laporan
│   └── tests/
├── web/              web app tanpa build step
└── widget/           chat-widget.js dan demo.html
```

Route menangani HTTP dan validasi awal. Aturan bisnis dan query ada di `services`, supaya
REST dan Socket.IO memakai jalur yang sama.

## Yang sudah ada

**Widget**

- Bubble chat dan panel, memakai Shadow DOM supaya CSS website tidak bentrok.
- Pre-chat nama/email dan sesi guest.
- Chat realtime, status koneksi, indikator typing.
- Antrean pesan saat offline. Pesan dikirim ulang lewat REST atau socket setelah koneksi pulih.
- Status pesan: mengirim, menunggu koneksi, gagal, terkirim. Pesan gagal bisa diklik untuk retry.
- CSAT setelah tiket resolved dan tombol mulai chat baru setelah tiket selesai.
- Polling REST kalau Socket.IO tidak tersedia.

Widget belum punya upload lampiran. Lampiran hanya ada di web.

**Web**

- Login customer, agent, supervisor, dan admin.
- Inbox dengan filter status, prioritas, assignee, dan pencarian.
- Detail tiket: chat, catatan internal, lampiran, canned response, balasan AI,
  ubah status/prioritas/assignee.
- Halaman customer untuk membuat tiket, melihat tiket sendiri, CSAT, dan reopen.
- Laporan untuk supervisor/admin: volume, first response, SLA, CSAT, beban agent.
- Admin: user, kategori + SLA, knowledge base.
- Notifikasi in-app, fallback polling, dan tombol resync.

**Mobile**

- Login semua role. Sesi dan antrean disimpan di `shared_preferences`.
- Daftar tiket, pencarian, filter, pull-to-refresh.
- Chat realtime dan optimistic UI.
- Antrean offline lewat REST.
- Buat tiket, CSAT, reopen, ubah status/assignee untuk staff, balasan AI.
- Local notification dari event Socket.IO.
- Pengaturan alamat server.

Lampiran di mobile hanya ditampilkan sebagai nama file. Upload ada di web.

**Backend**

- REST + Socket.IO.
- JWT 12 jam, password bcrypt.
- Role dicek di route dan event socket.
- Validasi transisi status tiket.
- SLA first response dan resolution per kategori.
- Audit trail di `ticket_events`.
- Idempotensi pesan lewat `client_message_id`.
- AI auto-reply opsional, fallback ke knowledge base.
- Rate limit untuk login dan pembuatan guest.
- Batas ukuran/tipe file untuk lampiran.
- Auto-close tiket resolved setelah 7 hari.
- Seed data demo.

## Koneksi dan pesan

REST dipakai untuk aksi: login, buat tiket, kirim pesan, upload, ubah status, CSAT, laporan,
dan admin. Socket.IO dipakai untuk menerima perubahan: pesan baru, update tiket, notifikasi,
typing, presence, dan SLA breach.

Kalau socket putus, widget dan mobile tetap bisa mengirim lewat REST. Pesan yang gagal karena
jaringan disimpan di antrean lokal. Saat reconnect, pesan dikirim lagi dengan
`client_message_id` yang sama. Server mencari kombinasi tiket + ID tersebut, jadi retry tidak
membuat pesan kedua.

Socket room:

- `ticket:{id}` untuk semua peserta tiket.
- `ticket:{id}:staff` untuk catatan internal.
- `user:{id}` untuk notifikasi user.
- `staff` untuk event yang perlu dilihat semua staff.

`ticket:join` dengan `last_seq` mengembalikan pesan setelah sequence terakhir. Ini dipakai
untuk mengejar pesan yang terlewat saat reconnect.

## API singkat

Semua endpoint privat memakai `Authorization: Bearer <token>`.

| Method | Endpoint | Catatan |
|---|---|---|
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/auth/me` | User dari token |
| `GET` | `/api/public/categories` | Kategori untuk widget/customer |
| `POST` | `/api/public/session` | Sesi guest widget |
| `GET/POST` | `/api/tickets` | Daftar/buat tiket |
| `GET/PATCH` | `/api/tickets/:id` | Detail/ubah tiket |
| `GET/POST` | `/api/tickets/:id/messages` | Riwayat/kirim pesan |
| `POST` | `/api/tickets/:id/attachments` | Upload lampiran |
| `POST` | `/api/tickets/:id/csat` | Rating customer |
| `POST` | `/api/tickets/:id/reopen` | Reopen tiket |
| `POST` | `/api/tickets/:id/ai-reply` | Balasan AI untuk staff |
| `GET` | `/api/reports/summary` | Laporan |
| `GET/POST/PATCH` | `/api/users`, `/api/categories`, `/api/kb` | Admin; daftar user/kategori juga untuk staff |

Event socket yang dipakai:

| Event | Arah | Isi |
|---|---|---|
| `ticket:join` | client → server | `{ticket_id, last_seq}` → ack tiket + pesan baru |
| `ticket:leave` | client → server | `{ticket_id}` |
| `message:send` | client → server | pesan + `client_message_id` |
| `typing`, `message:read` | dua arah | status mengetik dan sudah dibaca |
| `presence:list` | client → server | daftar staff online |
| `message:new`, `ticket:update`, `ticket:created` | server → client | objek pesan/tiket |
| `notification:new`, `sla:breach`, `presence:update` | server → client | notifikasi dan status |

## Mobile

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000
```

Default Android memakai `10.0.2.2` untuk emulator. Untuk perangkat fisik, ganti dengan IP
komputer lewat `--dart-define=API_BASE=...` atau dari halaman login/Pengaturan.

Build APK:

```bash
cd mobile
flutter build apk --release --dart-define=API_BASE=http://10.0.2.2:3000
```

APK di repo dibangun dengan alamat emulator. Ukurannya 50.838.081 byte (48,5 MB), SHA-256
`06C1F467549C327138B39F0725BABD7D24072F3DAF9C6CF858025811E1690500`. APK memakai debug
signing key supaya bisa langsung dipasang untuk demo.

Local notification hanya berjalan saat proses aplikasi masih aktif. Belum ada FCM, jadi
notifikasi tidak muncul kalau aplikasi benar-benar dimatikan.

## AI opsional

Tanpa `AI_API_KEY`, server memakai pencocokan kata sederhana terhadap artikel knowledge base.
Kalau key diisi, server memanggil endpoint OpenAI-compatible.

```bash
cd server
copy .env.example .env
# isi AI_API_KEY, AI_BASE_URL, AI_MODEL
npm start
```

`AI_AUTO_REPLY=false` mematikan balasan otomatis. Tombol **Balasan AI** di web/mobile tetap
memakai fallback knowledge base kalau key kosong.

## Testing

```bash
cd server
npm test

cd mobile
flutter analyze
flutter test
```

Terakhir: 9 test backend lulus, 4 test Flutter lulus, `flutter analyze` tanpa issue.
Detail skenario ada di [`docs/QA.md`](docs/QA.md).

## Batasan

- SQLite hanya cocok untuk satu instance. Untuk produksi perlu PostgreSQL dan Redis adapter
  kalau Socket.IO dipakai di lebih dari satu node.
- Notifikasi mobile masih lokal, belum FCM.
- SLA dihitung 24/7. Belum ada pause saat status Pending atau kalender jam kerja.
- Belum ada refresh token, SSO, atau enkripsi pesan di sisi klien.
- Token web disimpan di `localStorage`; mobile di `shared_preferences`.
- Widget tidak mendukung upload lampiran. Mobile hanya menampilkan nama file.
- APK memakai debug key, bukan key untuk distribusi publik.
- Seed memakai password demo. Jangan dipakai di environment nyata.

## Dokumen

- [`docs/ANALISIS.md`](docs/ANALISIS.md): alur, role, realtime, database.
- [`docs/PANDUAN-PROYEK.md`](docs/PANDUAN-PROYEK.md): catatan implementasi dan keputusan.
- [`docs/QA.md`](docs/QA.md): hasil test dan catatan perbaikan.
- [`docs/README.md`](docs/README.md): isi folder docs dan cara regenerasi BPMN/WBS.
