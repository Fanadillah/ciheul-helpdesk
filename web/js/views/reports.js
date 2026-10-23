import { api } from '../api.js';
import * as sock from '../socket.js';
import { esc, duration, toast, icons } from '../ui.js';

export function renderReports(container, ctx) {
  if (!['supervisor', 'admin'].includes(ctx.user.role)) {
    container.innerHTML = `<div class="empty-state"><div class="big">${icons.chart}</div>
      <h3>Akses terbatas</h3><p>Laporan hanya dapat diakses supervisor dan admin.</p></div>`;
    return () => {};
  }

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h2>Laporan &amp; Analitik</h2><p>Ringkasan performa layanan helpdesk.</p></div>
        <span class="spacer"></span>
        <select class="select" id="range-select" style="width:auto">
          <option value="7">7 hari terakhir</option>
          <option value="30" selected>30 hari terakhir</option>
          <option value="90">90 hari terakhir</option>
        </select>
        <button class="btn" id="refresh-report">Muat ulang</button>
      </div>
      <div id="report-body"><div class="skeleton" style="height:110px"></div></div>
    </div>`;

  const body = container.querySelector('#report-body');
  const rangeSelect = container.querySelector('#range-select');

  const unsubscribe = sock.on('ticket:update', () => {
    clearTimeout(container._timer);
    container._timer = setTimeout(() => load(Number(rangeSelect.value)), 1200);
  });

  async function load(days) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    try {
      const data = await api(`/api/reports/summary?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
      render(data);
    } catch (err) {
      body.innerHTML = `<div class="empty-state"><h3>Gagal memuat laporan</h3><p>${esc(err.message)}</p></div>`;
      toast(err.message, 'error');
    }
  }

  function render(data) {
    const t = data.timing || {};
    const totals = data.totals || {};
    const kpi = (label, value, note) => `<div class="kpi"><span>${esc(label)}</span><b>${value}</b><small>${esc(note || '')}</small></div>`;
    const volume = data.volume || [];
    const maxVolume = Math.max(1, ...volume.map((v) => v.total));

    body.innerHTML = `
      <div class="kpis">
        ${kpi('Total tiket', totals.total || 0, `${totals.new_count || 0} baru`)}
        ${kpi('Sedang aktif', totals.open_count || 0, 'assigned / diproses / pending')}
        ${kpi('Avg first response', duration(t.avg_first_response_sec), 'waktu balasan pertama')}
        ${kpi('SLA compliance', t.sla_compliance == null ? '-' : `${t.sla_compliance}%`, `${t.resolved_for_sla || 0} tiket selesai`)}
        ${kpi('CSAT', t.csat_count ? Number(t.avg_csat).toFixed(1) + '/5' : '-', `${t.csat_count || 0} penilaian`)}
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h3>Volume tiket harian</h3><span class="spacer"></span>
            <span style="font-size:11px;color:#94a3b8">${esc(data.range.from.slice(0, 10))} &rarr; ${esc(data.range.to.slice(0, 10))}</span></div>
          <div class="card-body">
            ${volume.length ? `<div class="chart">
              ${volume.map((v) => `<div class="bar-wrap" title="${esc(v.day)}: ${v.total} tiket">
                <div class="bar" style="height:${Math.max(3, Math.round((v.total / maxVolume) * 100))}%"></div>
                <div class="bar-label">${esc(v.day.slice(8))}/${esc(v.day.slice(5, 7))}</div>
              </div>`).join('')}
            </div>` : '<div class="chart-empty">Belum ada data pada rentang ini.</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Distribusi tiket</h3></div>
          <div class="card-body">
            <p style="font-size:10.5px;font-weight:800;letter-spacing:.8px;color:#94a3b8;margin:0 0 8px">PRIORITAS</p>
            ${(data.byPriority || []).map((p) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
              <span style="width:60px;font-size:12px;text-transform:capitalize">${esc(p.priority)}</span>
              <div class="progress" style="flex:1"><i style="width:${totals.total ? Math.round((p.total / totals.total) * 100) : 0}%"></i></div>
              <b style="font-size:12px;width:24px;text-align:right">${p.total}</b>
            </div>`).join('') || '<p style="font-size:12px;color:#94a3b8">Tidak ada data.</p>'}
            <p style="font-size:10.5px;font-weight:800;letter-spacing:.8px;color:#94a3b8;margin:18px 0 8px">CHANNEL</p>
            ${(data.byChannel || []).map((c) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
              <span style="width:60px;font-size:12px;text-transform:capitalize">${esc(c.channel)}</span>
              <div class="progress" style="flex:1"><i style="width:${totals.total ? Math.round((c.total / totals.total) * 100) : 0}%;background:#7c3aed"></i></div>
              <b style="font-size:12px;width:24px;text-align:right">${c.total}</b>
            </div>`).join('') || '<p style="font-size:12px;color:#94a3b8">Tidak ada data.</p>'}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="card-head"><h3>Performa agent</h3><span class="spacer"></span>
          <span style="font-size:11px;color:#94a3b8">Avg resolusi ${duration(t.avg_resolution_sec)}</span></div>
        <div class="card-body" style="padding:0">
          <table class="table">
            <thead><tr><th>Agent</th><th class="num">Ditugaskan</th><th class="num">Selesai</th><th class="num">CSAT</th><th style="width:180px">Beban</th></tr></thead>
            <tbody>
              ${(data.perAgent || []).length ? data.perAgent.map((a) => `
                <tr>
                  <td><b>${esc(a.name)}</b></td>
                  <td class="num">${a.assigned || 0}</td>
                  <td class="num">${a.resolved || 0}</td>
                  <td class="num">${a.avg_csat ? Number(a.avg_csat).toFixed(1) : '-'}</td>
                  <td><div class="progress"><i style="width:${a.assigned ? Math.min(100, Math.round((a.resolved / a.assigned) * 100)) : 0}%;background:#16a34a"></i></div></td>
                </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Belum ada data agent.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  container.querySelector('#refresh-report').addEventListener('click', () => load(Number(rangeSelect.value)));
  rangeSelect.addEventListener('change', () => load(Number(rangeSelect.value)));

  load(30);

  return () => {
    unsubscribe && unsubscribe();
    clearTimeout(container._timer);
  };
}
