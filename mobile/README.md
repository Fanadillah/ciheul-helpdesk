# Ciheul Helpdesk — Mobile

Aplikasi Flutter untuk customer dan agent: daftar tiket, chat realtime, antrean offline, dan
notifikasi lokal. Lihat [README utama](../README.md) untuk arsitektur, akun demo, dan cara
menjalankan backend.

## Menjalankan

```bash
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000
```

- Emulator Android memakai `http://10.0.2.2:3000` (default build).
- Perangkat fisik: ganti dengan IP LAN server, baik lewat `--dart-define=API_BASE=...` maupun
  tautan **Ubah alamat server** pada halaman login / menu Pengaturan.
- Windows desktop: `flutter run -d windows --dart-define=API_BASE=http://localhost:3000`.

## Build APK

```bash
flutter build apk --release --dart-define=API_BASE=http://10.0.2.2:3000
```

Hasil build disalin ke [`../artifacts/helpdesk.apk`](../artifacts/helpdesk.apk). APK memakai debug
signing key agar dapat langsung dipasang untuk demo.

## Struktur

```
lib/
├── core/     # API client, Socket.IO, state, model, session, notifikasi
├── screens/  # login, home, tiket, detail chat, buat tiket, notifikasi, setting
├── widgets/  # komponen UI (chip status, kartu tiket, avatar)
└── main.dart # bootstrap + root gate (splash → login → home)
```

## Pengujian

```bash
flutter analyze
flutter test
```

Widget test mencakup parsing model tiket, formatter, dan render status chip.
