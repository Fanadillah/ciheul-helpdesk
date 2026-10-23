export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map((p) => p[0]).join('').toUpperCase();
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'baru saja';
  if (diff < 3600) return `${Math.round(diff / 60)} mnt`;
  if (diff < 86400) return `${Math.round(diff / 3600)} jam`;
  if (diff < 604800) return `${Math.round(diff / 86400)} hr`;
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export function formatDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatClock(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Hari ini';
  if (same(d, yesterday)) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function duration(seconds) {
  if (seconds == null) return '-';
  const abs = Math.abs(Math.round(seconds));
  const h = Math.floor(abs / 3600);
  const m = Math.round((abs % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)} hr ${h % 24} j`;
  if (h > 0) return `${h} j ${m} mnt`;
  return `${m} mnt`;
}

export function statusLabel(status) {
  return ({
    new: 'Baru', assigned: 'Ditugaskan', in_progress: 'Diproses',
    pending: 'Pending', resolved: 'Selesai', closed: 'Ditutup',
  })[status] || status;
}

export function priorityLabel(priority) {
  return ({ low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' })[priority] || priority;
}

export function statusBadge(status) {
  return `<span class="badge ${esc(status)}"><i class="dt"></i>${esc(statusLabel(status))}</span>`;
}

export function priorityBadge(priority) {
  return `<span class="badge priority-${esc(priority)}">${esc(priorityLabel(priority))}</span>`;
}

export function stars(rating) {
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function toast(message, type = 'info', timeout = 3600) {
  let wrap = qs('.toast-wrap');
  if (!wrap) {
    wrap = el('<div class="toast-wrap"></div>');
    document.body.appendChild(wrap);
  }
  const node = el(`<div class="toast ${type}"><span>${esc(message)}</span><button class="x" aria-label="Tutup">&times;</button></div>`);
  node.querySelector('.x').addEventListener('click', () => node.remove());
  wrap.appendChild(node);
  setTimeout(() => node.remove(), timeout);
}

export function modal({ title, body, footer = '', width }) {
  const overlay = el(`<div class="overlay">
    <div class="modal" ${width ? `style="max-width:${width}px"` : ''} role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" aria-label="Tutup">&times;</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  </div>`);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  return { overlay, close, root: overlay.querySelector('.modal') };
}

export function confirmDialog(title, message, confirmLabel = 'Ya, lanjutkan') {
  return new Promise((resolve) => {
    const { overlay, close } = modal({
      title,
      body: `<p style="margin:0;font-size:13px;color:#475569;line-height:1.6">${esc(message)}</p>`,
      footer: `<button class="btn" data-x="cancel">Batal</button>
               <button class="btn primary" data-x="ok">${esc(confirmLabel)}</button>`,
    });
    overlay.querySelector('[data-x="cancel"]').addEventListener('click', () => { close(); resolve(false); });
    overlay.querySelector('[data-x="ok"]').addEventListener('click', () => { close(); resolve(true); });
  });
}

export const icons = {
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.6l-8.6 8.6a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 1 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8-8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
};
