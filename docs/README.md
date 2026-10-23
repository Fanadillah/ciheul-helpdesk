# Dokumen — Aplikasi Helpdesk

Deliverable Soal 1 (Analysis) untuk Take Home Programming Test Software Engineer, Ciheul Technologies.

## Deliverable wajib

| File | Deskripsi |
|---|---|
| [`BPMN-Helpdesk.pdf`](BPMN-Helpdesk.pdf) | Swimlane BPMN A3 landscape: 5 lane, alur tiket end-to-end, eskalasi L2, timer SLA, CSAT, auto-close |
| [`WBS-Helpdesk.xlsx`](WBS-Helpdesk.xlsx) | WBS 7 modul / 64 fitur, estimasi jam-orang, dependency, acceptance criteria, timeline 4 hari, risiko |

## Dokumen pendukung

| File | Deskripsi |
|---|---|
| [`ANALISIS.md`](ANALISIS.md) | Analisis proses bisnis, aktor & RBAC, arsitektur realtime, rencana skema DB, event contract, keputusan desain |
| [`BPMN-Helpdesk.drawio`](BPMN-Helpdesk.drawio) | Sumber diagram yang dapat diedit (draw.io / diagrams.net) |
| [`assets/bpmn-helpdesk.svg`](assets/bpmn-helpdesk.svg) | Sumber vektor BPMN (dipakai untuk export PDF) |

## Isi BPMN

- **Customer** — mulai, buka widget/app, pre-chat, diskusi, konfirmasi & CSAT, selesai.
- **Live Chat System** — buat sesi & tiket, AI auto-reply (opsional), klasifikasi/prioritas/SLA/antrean, notifikasi agent, relay pesan realtime, monitor SLA, simpan CSAT & auto-close.
- **Customer Support (CS Agent)** — ambil tiket, verifikasi/analisis, eskalasi L2, solusi, tangani eskalasi, set resolved.
- **Supervisor** — review eskalasi, setujui & pantau, tinjau CSAT rendah.
- **Admin (periodik)** — user & role, kategori/SLA, knowledge base & canned response, dashboard & audit.

Garis putus-putus = **message flow realtime** (widget ↔ web ↔ mobile); timer boundary pada task
"Monitor SLA" memicu eskalasi otomatis ke Supervisor.

## Isi WBS

Sheet: `WBS`, `Ringkasan`, `Timeline`, `Risiko`, `Legenda`.
Setiap fitur memiliki **Ref BPMN** sehingga dapat ditelusuri ke elemen diagram, plus
prioritas (Must/Should/Could), estimasi jam, dependency, acceptance criteria, target hari, dan status.

## Regenerasi

```bash
python docs/tools/gen_bpmn.py      # bpmn-helpdesk.svg + BPMN-Helpdesk.drawio
python docs/tools/export_pdf.py    # BPMN-Helpdesk.pdf (Chrome headless, A3 landscape)
python docs/tools/gen_wbs.py       # WBS-Helpdesk.xlsx (openpyxl)
```

Prasyarat: Python 3.11 + `openpyxl` + `PyMuPDF`, Google Chrome terpasang.
