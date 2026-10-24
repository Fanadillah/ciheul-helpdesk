#!/usr/bin/env python3
"""Render docs/assets/bpmn-helpdesk.svg to an A3 landscape PDF using Chrome."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "assets" / "bpmn-helpdesk.svg"
HTML = ROOT / "assets" / "bpmn-print.html"
PDF = ROOT / "BPMN-Helpdesk.pdf"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")

CSS = """<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: 420mm 297mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  svg { width: 420mm; height: 297mm; display: block; }
</style></head><body>
"""
HTML.write_text(CSS + SVG.read_text(encoding="utf-8") + "\n</body></html>",
                encoding="utf-8")

cmd = [str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox",
       "--no-pdf-header-footer", "--print-to-pdf-no-header",
       "--print-to-pdf=" + str(PDF), HTML.as_uri()]
res = subprocess.run(cmd, capture_output=True, text=True)
if res.returncode != 0:
    sys.exit(res.stderr or res.stdout)
print("wrote", PDF, PDF.stat().st_size, "bytes")

# preview PNG of the real PDF page + document metadata
import fitz
doc = fitz.open(PDF)
doc.set_metadata({
    "title": "BPMN Swimlane - Aplikasi Helpdesk",
    "author": "Fanadillah",
    "subject": "Take Home Programming Test - Software Engineer, Ciheul Technologies",
    "keywords": "BPMN, helpdesk, live chat, ticketing, SLA, SOAL 1a",
    "creator": "docs/tools/gen_bpmn.py",
})
tmp = PDF.with_suffix(".tmp.pdf")
doc.save(tmp, garbage=3, deflate=True)
doc.close()
tmp.replace(PDF)
doc = fitz.open(PDF)
page = doc[0]
print("pages:", doc.page_count, "size(pt):", page.rect)
pm = page.get_pixmap(matrix=fitz.Matrix(2, 2))
out = ROOT / "assets" / "bpmn-helpdesk.png"
pm.save(out)
print("wrote", out)
