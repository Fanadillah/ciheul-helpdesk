# Catatan Pengujian

Pengujian terakhir: 23–24 Oktober 2026.

## Lingkungan

| Komponen | Versi |
|---|---|
| OS | Windows 10 Home 22H2 |
| Node.js | 22.x |
| Flutter / Dart | 3.35.6 / 3.9.2 |
| Android SDK | 36.1.0, emulator Medium Phone API 36.1 |
| Chrome | 155, headless untuk cek web |
| Database | SQLite (better-sqlite3, WAL) |

## Test otomatis

```bash
cd server && npm test
cd mobile && flutter analyze
cd mobile && flutter test
cd mobile && flutter build apk --release
```

Hasil terakhir: 9 test backend lulus, 4 test Flutter lulus, `flutter analyze` tanpa issue,
build APK berhasil.

Yang dicek di backend (`server/tests/api.test.js`):

1. Health check, endpoint privat, dan password salah.
2. Sesi guest widget, reuse email guest, dan konflik dengan akun terdaftar.
3. Alur tiket: buat, assign, kirim pesan, catatan internal, resolve, CSAT, reopen.
4. Role: customer tidak bisa ubah status, laporan hanya supervisor/admin, user baru hanya
   admin, agent tidak bisa ubah kategori.
5. Idempotensi pesan dan pemisahan pesan antar-tiket.
6. Socket: join room, pesan baru, retry idempoten, update tiket, catatan internal hanya
   sampai ke staff.
7. Auto-close tiket resolved dan idempotensi sweep.

Yang dicek di Flutter (`mobile/test/widget_test.dart`): parsing tiket, status tiket,
formatter, dan render `StatusChip`.

## Uji manual

| Skenario | Hasil |
|---|---|
| Login web sebagai agent/supervisor/admin/customer | Lulus, menu dan route sesuai role |
| Widget guest membuat tiket | Lulus, tiket muncul di inbox agent |
| Agent membalas dari web, widget menerima tanpa refresh | Lulus |
| Tiket yang sama dibuka di mobile agent | Lulus, riwayat pesan ikut tampil |
| Agent mengirim pesan dari mobile | Lulus, tersimpan di server |
| Customer mengirim pesan, mobile menerima realtime | Lulus, pesan dan badge notifikasi muncul |
| CSAT dari widget setelah resolved | Lulus, rating masuk ke laporan |
| Laporan supervisor | Lulus, KPI dan data seed tampil |
| Admin user/kategori/KB | Lulus |
| APK di emulator Android 36 | Alur utama lulus di build saat uji. Build terakhir setelah perubahan antrean/status lolos analyze + test |
| Fresh clone lalu `npm ci` dan `npm test` | Lulus |
| Reseed data demo | Lulus, 4 tiket, 5 akun, 3 kategori |

Screenshot mobile ada di [`screenshots/`](screenshots).

## Catatan

- Di uji awal emulator, inbox sempat kosong karena request tiket pertama selesai sebelum socket
  terhubung. Sekarang tiket dan notifikasi di-refresh setiap event `connect`.
- Perubahan status dari pesan pertama agent juga dikirim ke room tiket, jadi header di widget
  dan mobile ikut berubah tanpa reload.
- Notifikasi mobile masih lokal. Tidak muncul kalau proses aplikasi sudah mati.
- Emulator memakai `10.0.2.2`. Perangkat fisik perlu IP komputer, diubah dari halaman login
  atau menu Pengaturan.

## Perbaikan yang sempat diperlukan

- Route `POST /api/users` masih bisa dipanggil agent. Sekarang hanya admin. Agent tetap bisa
  melihat daftar user untuk assign.
- Admin bisa menurunkan role atau menonaktifkan akunnya sendiri. Sekarang ditolak.
- SLA kategori bisa diisi angka negatif. Sekarang divalidasi positif.
- Pencarian `client_message_id` belum dibatasi tiket. Sekarang dicek per tiket; benturan
  antar-tiket mengembalikan 409.
- File lampiran ditulis sebelum akses tiket dicek. Otorisasi dipindah ke depan, dan file
  dihapus kalau insert metadata gagal.
- Presence langsung offline saat satu tab ditutup. Sekarang jumlah koneksi dihitung per user.
- Tiket resolved menumpuk. Sekarang ditutup otomatis setelah 7 hari.
- Emit tiket dan notifikasi tersebar di beberapa route. Sekarang ada helper di
  `realtime/events.js`.
- Widget sempat menampilkan label status yang salah dan klaim enkripsi yang tidak benar.
  Label diperbaiki, klaim dihapus, antrean dikirim lewat REST/socket.
- Retry pesan pertama widget gagal kalau tiket belum dibuat. Sekarang retry membuat tiket
  lebih dulu.
- Antrean mobile hanya jalan kalau socket terhubung. Sekarang lewat REST dan dilindungi flag
  agar tidak dobel.
- Notifikasi lokal muncul untuk chat yang sedang dibuka. Sekarang tiket aktif dilewati.
- Pesan antre di mobile tidak punya status. Sekarang ada label “Menunggu koneksi”.
- Listener dan timer web menumpuk setelah logout. Sekarang dibersihkan saat shell dilepas.
- Toast web menandai pesan agent sendiri sebagai pesan customer. Kondisinya sudah dibalik.
- Pilihan tiket yang cepat bisa ditimpa respons lama. Sekarang ada token pilihan.

## Verifikasi akhir

- APK: 50.838.081 byte (48,5 MB), SHA-256
  `06C1F467549C327138B39F0725BABD7D24072F3DAF9C6CF858025811E1690500`.
- Smoke test web headless: login agent, 4 tiket tampil, detail tiket terbuka, panel notifikasi
  terbuka, resync jalan, logout kembali ke login, tidak ada error console.
- Health check `ok`; web dan widget demo HTTP 200; login dan daftar tiket REST berhasil.
- Fresh clone commit `7d1999d`: `npm ci`, 9/9 test, server auto-seed 4 tiket, health `ok`,
  web/widget HTTP 200, login agent berhasil. `npm audit --omit=dev` tidak menemukan
  kerentanan di dependency produksi.
