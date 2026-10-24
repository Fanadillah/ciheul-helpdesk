# Isi Folder Docs

Folder ini berisi dokumen pendukung untuk demo helpdesk. Bukan dokumentasi produk.

| File | Isi |
|---|---|
| [`BPMN-Helpdesk.pdf`](BPMN-Helpdesk.pdf) | BPMN A3 landscape, 5 lane: customer, live chat system, CS agent, supervisor, admin |
| [`WBS-Helpdesk.xlsx`](WBS-Helpdesk.xlsx) | WBS, estimasi jam, dependency, acceptance criteria, timeline, risiko |
| [`ANALISIS.md`](ANALISIS.md) | Alur tiket, role, realtime, database, dan keputusan desain |
| [`PANDUAN-PROYEK.md`](PANDUAN-PROYEK.md) | Catatan implementasi, cara menjalankan, dan batasan |
| [`QA.md`](QA.md) | Hasil automated test, uji manual, dan perbaikan yang sempat dilakukan |
| [`BPMN-Helpdesk.drawio`](BPMN-Helpdesk.drawio) | Sumber diagram untuk draw.io / diagrams.net |
| [`assets/bpmn-helpdesk.svg`](assets/bpmn-helpdesk.svg) | SVG BPMN yang dipakai untuk export PDF |
| [`screenshots/`](screenshots) | Screenshot mobile |

## Isi BPMN

- **Customer**: mulai, buka widget/app, isi pre-chat, diskusi, konfirmasi, CSAT.
- **Live Chat System**: buat sesi dan tiket, AI auto-reply opsional, klasifikasi/prioritas/SLA,
  antrean, notifikasi agent, relay pesan, monitor SLA, simpan CSAT, auto-close.
- **CS Agent**: ambil tiket, verifikasi, analisis, eskalasi L2, beri solusi, set resolved.
- **Supervisor**: review eskalasi, pantau tiket, tinjau CSAT rendah.
- **Admin**: user/role, kategori/SLA, knowledge base, canned response, laporan.

Garis putus-putus adalah alur pesan realtime antara widget, web, dan mobile. Timer pada
"Monitor SLA" memicu eskalasi ke supervisor.

Eskalasi L2 ada di diagram sebagai proses target, tetapi belum jadi modul terpisah di aplikasi.
Yang dipakai di kode saat ini: assign tiket, ubah prioritas, dan notifikasi SLA.

## Isi WBS

Sheet: `WBS`, `Ringkasan`, `Timeline`, `Risiko`, `Legenda`.

Setiap fitur punya kolom Ref BPMN, prioritas (Must/Should/Could), estimasi jam, dependency,
acceptance criteria, target hari, dan status.

## Regenerasi

```bash
python docs/tools/gen_bpmn.py
python docs/tools/export_pdf.py
python docs/tools/gen_wbs.py
```

Butuh Python 3.11, `openpyxl`, `PyMuPDF`, dan Google Chrome.
