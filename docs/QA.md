# QA & Verifikasi

Tanggal pengujian: 23 Oktober 2026.

## Lingkungan

| Komponen | Versi |
|---|---|
| OS | Windows 10 Home 22H2 |
| Node.js | 22.x |
| Flutter / Dart | 3.35.6 / 3.9.2 |
| Android SDK | 36.1.0 (emulator Medium Phone API 36.1) |
| Chrome | 155 (headless untuk QA web) |
| Database | SQLite (better-sqlite3, mode WAL) |

## Automated tests

```bash
cd server && npm test          # 6 test lulus
cd mobile && flutter analyze   # No issues found
cd mobile && flutter test      # 4 test lulus
cd mobile && flutter build apk --release   # sukses, ±48,5 MB
```

Cakupan backend (`server/tests/api.test.js`):

1. Health check, proteksi endpoint privat, dan penolakan password salah.
2. Sesi guest widget: pembuatan guest, reuse email guest, konflik dengan akun terdaftar.
3. Siklus tiket REST: buat → assign → pesan → catatan internal → resolve → CSAT → reopen.
4. Otorisasi: customer tidak dapat mengubah status; laporan hanya supervisor/admin.
5. Idempotensi pesan: `client_message_id` yang sama tidak membuat pesan ganda.
6. Socket.IO: join room, `message:new`, retry idempoten, `ticket:update`, dan internal note
   hanya sampai ke staff.

Cakupan Flutter (`mobile/test/widget_test.dart`): parsing `Ticket`, status tiket, formatter
(label, inisial, normalisasi URL), dan render `StatusChip`.

## Manual E2E

| # | Skenario | Hasil |
|---|---|---|
| 1 | Login web sebagai agent/supervisor/admin/customer | Lulus; menu & route sesuai role |
| 2 | Widget pre-chat guest membuat tiket | Lulus; tiket muncul realtime di inbox agent |
| 3 | Agent membalas dari web, widget menerima tanpa refresh | Lulus |
| 4 | Tiket yang sama dibuka di mobile agent | Lulus; riwayat pesan lengkap |
| 5 | Agent mengirim pesan dari mobile | Lulus; tersimpan di server dan tampil di thread |
| 6 | Customer mengirim pesan (REST), mobile menerima realtime | Lulus; balon pesan muncul dan badge notifikasi bertambah |
| 7 | CSAT bintang dari widget setelah resolved | Lulus; rating tersimpan dan tampil di laporan |
| 8 | Laporan supervisor (KPI, grafik, tabel) | Lulus; 5 KPI dan data seed tampil |
| 9 | Admin user/category/KB | Lulus; daftar dan form tampil |
| 10 | APK release dipasang di emulator Android 36 | Lulus; login, inbox, detail, kirim pesan, socket "Realtime" |
| 11 | Fresh clone dari GitHub → `npm ci` → `npm test` → server | Lulus; health, web, dan widget merespons 200 |
| 12 | Reseed data demo (`npm run seed`) | Lulus; 4 tiket demo, 5 akun, 3 kategori |

Bukti tangkapan layar mobile: [`screenshots/mobile-login.png`](screenshots/mobile-login.png),
[`screenshots/mobile-detail.png`](screenshots/mobile-detail.png),
[`screenshots/mobile-realtime.png`](screenshots/mobile-realtime.png).

## Catatan QA

- Pada pengujian awal di emulator, inbox sempat kosong karena request daftar tiket pertama gagal
  sebelum socket terhubung. Perbaikan: refresh tiket dan notifikasi otomatis setiap event
  `connect`, sehingga data langsung tersinkron setelah koneksi pulih. APK final sudah memuat
  perbaikan ini.
- Status tiket yang berubah karena pesan pertama agent kini juga di-broadcast ke room tiket,
  sehingga header status di semua kanal ikut terbarui tanpa reload.
- Notifikasi mobile bersifat lokal (tidak memakai FCM) dan hanya muncul saat proses aplikasi aktif.
- Emulator memakai `10.0.2.2`; untuk perangkat fisik ganti alamat server dari halaman login atau
  menu Pengaturan.
