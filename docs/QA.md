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
cd server && npm test          # 9 test lulus
cd mobile && flutter analyze   # No issues found
cd mobile && flutter test      # 4 test lulus
cd mobile && flutter build apk --release   # sukses, ±48,5 MB
```

Cakupan backend (`server/tests/api.test.js`):

1. Health check, proteksi endpoint privat, dan penolakan password salah.
2. Sesi guest widget: pembuatan guest, reuse email guest, konflik dengan akun terdaftar.
3. Siklus tiket REST: buat → assign → pesan → catatan internal → resolve → CSAT → reopen.
4. Otorisasi: customer tidak dapat mengubah status; laporan hanya supervisor/admin;
   pembuatan user hanya admin; agent tidak dapat mengubah kategori.
5. Idempotensi pesan: `client_message_id` yang sama tidak membuat pesan ganda, dan tidak
   membocorkan pesan dari tiket lain.
6. Socket.IO: join room, `message:new`, retry idempoten, `ticket:update`, dan internal note
   hanya sampai ke staff.
7. Auto-close: tiket resolved lebih lama dari jendela kebijakan berubah menjadi closed dan
   tidak menghasilkan event ganda pada sweep berikutnya.

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
| 10 | APK release dipasang di emulator Android 36 | Alur utama lulus pada build saat E2E; build final setelah perbaikan antrean/status berhasil dibangun dan lolos `flutter analyze` + `flutter test` |
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

## Audit kualitas

Audit terakhir dilakukan setelah fitur utama selesai. Fokusnya bukan menambah fitur, tetapi
memastikan perilaku tetap benar saat jaringan buruk, role tidak sesuai, dan data datang dari kanal
berbeda.

| Area | Temuan | Perbaikan |
|---|---|---|
| RBAC admin | `POST /api/users` masih dapat dipanggil agent | Route manajemen user dibatasi admin; daftar user tetap tersedia untuk staff |
| Admin self-lockout | Admin dapat menurunkan role/menonaktifkan akunnya sendiri | Ditolak dengan pesan yang jelas |
| Validasi kategori | Angka SLA negatif dapat tersimpan | Divalidasi sebagai bilangan positif |
| Idempotensi | Pencarian `client_message_id` tidak dibatasi tiket | Dicari per tiket; benturan antar-tiket menghasilkan 409, bukan membocorkan pesan |
| Attachment | File ditulis sebelum otorisasi tiket diperiksa | Otorisasi dipindah ke depan; file dibersihkan bila metadata gagal disimpan |
| Presence | Satu tab ditutup membuat agent langsung offline | Jumlah koneksi dihitung per user |
| Auto-close | Tiket resolved menumpuk | Sweep berkala menutup tiket setelah 7 hari dan mencatat event |
| Realtime | Emit/notifikasi tersebar di banyak route | Dipusatkan di `realtime/events.js` |
| Widget | Label status salah dan klaim enkripsi tidak benar | Label diperbaiki; klaim dihapus; antrean di-flush lewat REST/socket |
| Widget | Retry pesan pertama gagal bila tiket belum ada | Retry membuat tiket lebih dulu, lalu mengirim ulang pesan |
| Mobile | Antrean hanya dikirim bila socket terhubung | Flush lewat REST, dilindungi flag agar tidak berjalan ganda |
| Mobile | Notifikasi lokal muncul untuk chat yang sedang dibuka | Notifikasi untuk tiket aktif tidak ditampilkan |
| Mobile | Pesan antre tidak terlihat statusnya | Status “Menunggu koneksi” ditambahkan |
| Web | Listener/timer menumpuk setelah logout | Semua listener, polling, dan panel dibersihkan saat shell dilepas |
| Web | Toast menandai pesan agent sendiri sebagai pesan customer | Kondisi dibalik ke `sender_type === 'customer'` |
| Web | Pilihan tiket cepat dapat menimpa tiket yang lebih baru | Token pilihan mencegah respons lama menimpa state |

Perubahan ini diverifikasi ulang dengan `npm test`, `flutter analyze`, `flutter test`, build APK,
dan smoke test web/widget/mobile.

Verifikasi akhir:

- APK release: 50.838.081 byte (48,5 MB), SHA-256
  `06C1F467549C327138B39F0725BABD7D24072F3DAF9C6CF858025811E1690500`.
- Smoke test web headless: login agent, 4 tiket tampil, detail tiket terbuka, panel notifikasi
  terbuka, tombol resync berfungsi, logout kembali ke halaman login, tanpa error console.
- Server health `ok`; web dan widget demo merespons HTTP 200; login dan daftar tiket REST berhasil.
- Fresh clone commit `7d1999d`: `npm ci`, `npm test` 9/9 lulus, server auto-seed 4 tiket, health
  `ok`, web/widget HTTP 200, dan login agent berhasil. `npm audit --omit=dev` melaporkan
  0 vulnerabilitas pada dependency produksi.
