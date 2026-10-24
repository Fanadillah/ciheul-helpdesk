# Catatan Analisis

Ini catatan kerja untuk demo helpdesk di repo ini. Isinya alur tiket, pembagian role,
kontrak realtime, dan struktur database yang dipakai. BPMN dan WBS ada di file terpisah.

## Ruang lingkup

Ada tiga kanal:

| Kanal | Dipakai oleh | Teknis |
|---|---|---|
| Widget | customer | JavaScript, REST + Socket.IO |
| Web | customer, agent, supervisor, admin | JavaScript tanpa build step |
| Mobile | customer dan staff | Flutter |

Yang tidak dikerjakan: billing, gudang, integrasi Jira/Zendesk, dan multi-tenant.

## Role

| Role | Bisa melakukan |
|---|---|
| Customer | Buat tiket, kirim pesan, upload lampiran di web, isi CSAT, reopen |
| Agent | Assign tiket, ubah status/prioritas, balas chat, catatan internal, canned response |
| Supervisor | Sama seperti agent untuk tiket, plus lihat laporan dan CSAT rendah |
| Admin | Kelola user/role, kategori dan SLA, knowledge base |

Pengecekan role ada di route dan event Socket.IO. UI hanya menyembunyikan tombol; akses tetap
ditolak kalau endpoint dipanggil langsung.

## Alur tiket

1. Customer membuka widget atau mobile, mengisi nama/email/kategori.
2. Server membuat tiket. Prioritas diambil dari default kategori kalau customer tidak memilih.
3. Tiket otomatis di-assign ke agent aktif dengan tiket terbuka paling sedikit. Kalau tidak ada
   agent, statusnya tetap `new`.
4. SLA first response dan resolution dihitung dari waktu pembuatan tiket.
5. Kalau AI auto-reply aktif, server menunggu 1,2 detik lalu mengirim balasan AI. Balasan ini
   dilewati kalau agent sudah membalas lebih dulu atau tiket sudah resolved/closed.
6. Agent membalas, mengubah status, atau menambahkan catatan internal.
7. Setelah selesai, agent set status `resolved`. Customer bisa memberi CSAT.
8. Tiket `resolved` ditutup otomatis setelah 7 hari. Customer masih bisa reopen dalam batas
   7 hari sejak `resolved_at`/`closed_at`.

## Status

| Status | Arti |
|---|---|
| `new` | Masuk antrean, belum ada assignee |
| `assigned` | Sudah ada assignee |
| `in_progress` | Sedang dikerjakan |
| `pending` | Menunggu customer atau pihak lain |
| `resolved` | Solusi sudah diberikan |
| `closed` | Selesai dan ditutup |

Transisi:

| Dari | Boleh ke |
|---|---|
| `new` | `assigned`, `in_progress` |
| `assigned` | `in_progress`, `pending`, `resolved` |
| `in_progress` | `pending`, `resolved` |
| `pending` | `in_progress`, `resolved`, `closed` |
| `resolved` | `closed`, `in_progress` |
| `closed` | `in_progress` |

Reopen dari `resolved`/`closed` mengosongkan `resolved_at` dan `closed_at`, lalu menambah
`reopen_count`. Resolve mengisi `resolved_at`; close mengisi `closed_at`. Perubahan penting
dicatat di `ticket_events`.

## SLA dan CSAT

SLA mengikuti kategori, bukan prioritas:

| Kategori | Prioritas default | First response | Resolution |
|---|---|---|---|
| Technical Issue | high | 15 menit | 8 jam |
| Billing & Payment | medium | 30 menit | 24 jam |
| Feature Request | low | 2 jam | 72 jam |

Nilai ini bisa diubah admin lewat halaman kategori. SLA dihitung 24/7 dan tidak dijeda saat
status `pending`. Setiap 30 detik server memeriksa tiket terbuka yang melewati deadline.
Kalau belum pernah ditandai breach, server mengisi kolom breach, mencatat event, membuat
notifikasi untuk agent/supervisor, dan mengirim event `sla:breach`.

First response dihitung saat staff mengirim pesan publik pertama. Balasan AI tidak dihitung.
CSAT 1–5 bisa diisi customer setelah tiket `resolved` atau `closed`; komentar opsional.

## Realtime

Room yang dipakai:

- `ticket:{id}`: semua peserta tiket.
- `ticket:{id}:staff`: staff saja, dipakai untuk catatan internal.
- `user:{id}`: notifikasi user.
- `role:{role}` dan `staff`: event untuk staff.

Saat membuka tiket, klien mengirim `ticket:join` dengan `last_seq`. Server mengecek akses,
memasukkan socket ke room, lalu mengembalikan tiket dan pesan setelah sequence tersebut.
Kalau socket putus, REST tetap dipakai. Widget dan mobile menyimpan pesan yang gagal ke antrean
lokal dan mengirim ulang dengan `client_message_id` yang sama.

Event utama:

| Event | Arah | Isi |
|---|---|---|
| `ticket:join` | client → server | `{ticket_id, last_seq}` → ack `{ok, ticket, messages}` |
| `ticket:leave` | client → server | `{ticket_id}` |
| `message:send` | client → server | `{ticket_id, body, client_message_id, is_internal}` |
| `message:new` | server → client | objek pesan |
| `message:read` | dua arah | `{ticket_id, message_id, user_id}` |
| `typing` | dua arah | `{ticket_id, user_id, name, is_typing}` |
| `presence:list` | client → server | ack `{ok, users}` untuk staff |
| `presence:update` | server → client | `{user_id, name, role, status}` |
| `ticket:update`, `ticket:created` | server → client | objek tiket |
| `notification:new`, `sla:breach` | server → client | notifikasi/event SLA |

Presence menghitung jumlah koneksi per user. Satu tab ditutup tidak langsung membuat agent
offline kalau tab lain masih terbuka.

## Database

SQLite dengan WAL. Nama tabel dan kolom dibuat supaya tidak terlalu jauh dari PostgreSQL.

| Tabel | Isi |
|---|---|
| `users` | Customer, agent, supervisor, admin, dan guest widget |
| `categories` | Nama kategori, prioritas default, target SLA |
| `tickets` | Data tiket, status, assignee, deadline SLA, CSAT, reopen |
| `ticket_messages` | Pesan customer/staff/AI, catatan internal, sequence |
| `message_receipts` | Status delivered/read per user |
| `ticket_events` | Riwayat perubahan tiket |
| `attachments` | Metadata file; file fisik di folder upload |
| `canned_responses` | Template balasan agent |
| `kb_articles` | Artikel knowledge base untuk AI |
| `notifications` | Notifikasi in-app |
| `ai_logs` | Prompt, output, model, latency, dan status fallback |
| `devices` | Disiapkan untuk push token; belum dipakai karena belum ada FCM |

Guest disimpan di `users` dengan `is_guest = 1` dan `password_hash = NULL`. Ini menghindari
tabel customer terpisah yang isinya hampir sama.

`ticket_messages` punya `seq` per tiket dan kombinasi `(ticket_id, seq)` unik. Idempotensi
memakai `(ticket_id, client_message_id)`. Kolom `client_message_id` sendiri unik global; kalau
ID yang sama dipakai di tiket lain, server mengembalikan 409.

## Keputusan yang diambil

- **Socket.IO** dipilih karena sudah punya room, ack, reconnect, dan fallback polling.
- **SQLite** dipilih supaya demo tidak perlu setup database server. Ini bukan pilihan untuk
  banyak instance.
- **Vanilla JS** untuk web/widget supaya tidak ada build step dan widget tetap ringan.
- **Flutter** supaya Android dan Windows memakai kode yang sama.
- **JWT + bcrypt** supaya REST dan handshake socket memakai token yang sama.
- **AI opsional**. Tanpa API key, sistem tetap menjawab dari knowledge base.

Detail trade-off dan batasan ada di [`PANDUAN-PROYEK.md`](PANDUAN-PROYEK.md).
