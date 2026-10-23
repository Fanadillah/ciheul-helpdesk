import { api, session, onUnauthorized } from './api.js';
import * as sock from './socket.js';
import { esc, timeAgo, toast, icons, qs } from './ui.js';
import { renderLogin } from './views/login.js';
import { renderInbox } from './views/inbox.js';
import { renderReports } from './views/reports.js';
import { renderAdmin } from './views/admin.js';
import { connectSocket, disconnectSocket } from './socket.js';

const app = document.getElementById('app');

const state = {
  user: null,
  notifications: [],
  notifOpen: false,
  cleanupView: null,
  shellReady: false,
  inboxCount: 0,
  onlineAgents: 0,
};

onUnauthorized(() => logout(true));

// ------------------------------------------------------------------ boot
async function boot() {
  if (!session.token) {
    showLogin();
    return;
  }
  try {
    const { user } = await api('/api/auth/me');
    session.set(session.token, user);
    state.user = user;
    await startApp();
  } catch {
    session.clear();
    showLogin();
  }
}

function showLogin() {
  destroyView();
  disconnectSocket();
  state.shellReady = false;
  renderLogin(app, (user) => {
    state.user = user;
    startApp();
  });
}

async function startApp() {
  const isStaff = ['agent', 'supervisor', 'admin'].includes(state.user.role);
  renderShell(isStaff);
  bindShell();
  try {
    await connectSocket();
  } catch (err) {
    toast('Mode offline: realtime tidak tersedia, data tetap dapat diakses lewat REST.', 'error', 5000);
  }
  loadNotifications();
  if (!location.hash) location.hash = '#/inbox';
  route();
  startFallbackPolling();
}

// ------------------------------------------------------------------ shell
function renderShell(isStaff) {
  const user = state.user;
  app.innerHTML = `
    <div class="app" id="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo-mark">C</div>
          <div class="brand-text">Ciheul<small>HELPDESK</small></div>
        </div>
        <nav class="nav">
          <div class="nav-label">Ruang kerja</div>
          <a class="nav-item" href="#/inbox" data-nav="inbox">
            ${icons.inbox}<span>${isStaff ? 'Kotak Masuk' : 'Tiket Saya'}</span>
            ${isStaff ? '<span class="count zero" id="nav-inbox-count">0</span>' : ''}
          </a>
          ${isStaff ? `<a class="nav-item" href="#/mine" data-nav="mine">${icons.ticket}<span>Tiket Saya</span></a>` : ''}
          ${['supervisor', 'admin'].includes(user.role) ? `<a class="nav-item" href="#/reports" data-nav="reports">${icons.chart}<span>Laporan</span></a>` : ''}
          ${user.role === 'admin' ? `<a class="nav-item" href="#/admin" data-nav="admin">${icons.settings}<span>Pengaturan</span></a>` : ''}
        </nav>
        <div class="sidebar-foot">
          <div class="user-card">
            <div class="avatar">${esc((user.name || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase())}</div>
            <div class="user-meta"><b>${esc(user.name)}</b><span>${esc(user.role)}</span></div>
            <button class="logout-btn" id="logout" title="Keluar" aria-label="Keluar">${icons.logout}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="iconbtn" id="sidebar-toggle" title="Lipat sidebar" aria-label="Lipat sidebar">${icons.menu}</button>
          <div>
            <h1 id="page-title">Kotak Masuk</h1>
          </div>
          <span class="spacer"></span>
          <span class="socket-pill" id="socket-pill"><span class="dot"></span><span id="socket-text">Realtime</span></span>
          <button class="iconbtn" id="bell" title="Notifikasi" aria-label="Notifikasi">
            ${icons.bell}<span class="dot-badge hidden" id="bell-badge">0</span>
          </button>
        </header>
        <main class="view" id="view"></main>
      </div>
    </div>`;
  state.shellReady = true;
}

function bindShell() {
  qs('#logout').addEventListener('click', () => logout(false));
  qs('#sidebar-toggle').addEventListener('click', () => qs('#shell').classList.toggle('collapsed'));

  const bell = qs('#bell');
  bell.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleNotifications();
  });

  window.addEventListener('hashchange', route);

  sock.onStatus((connected) => {
    const pill = qs('#socket-pill');
    const text = qs('#socket-text');
    if (!pill) return;
    pill.classList.toggle('offline', !connected);
    text.textContent = connected ? 'Realtime' : 'Mode REST';
    if (connected) window.dispatchEvent(new CustomEvent('helpdesk:resync'));
  });

  sock.on('notification:new', (notification) => {
    state.notifications.unshift(notification);
    renderNotifications();
    if (qs('.notif-panel')) renderNotifPanel();
    toast(notification.title, 'info');
  });

  sock.on('ticket:created', () => {
    if (['agent', 'supervisor', 'admin'].includes(state.user.role)) {
      setTimeout(() => window.dispatchEvent(new CustomEvent('helpdesk:resync')), 400);
    }
  });
  sock.on('presence:update', () => {});
}

function updateInboxBadge() {
  const badge = qs('#nav-inbox-count');
  if (!badge) return;
  badge.textContent = state.inboxCount > 99 ? '99+' : String(state.inboxCount);
  badge.classList.toggle('zero', !state.inboxCount);
}

function setInboxCount(count) {
  state.inboxCount = count;
  updateInboxBadge();
}

// ------------------------------------------------------------------ router
const TITLES = {
  inbox: ['Kotak Masuk', 'Semua percakapan pelanggan'],
  mine: ['Tiket Saya', 'Tiket yang ditugaskan kepada Anda'],
  reports: ['Laporan & Analitik', 'Performa tim dan kepatuhan SLA'],
  admin: ['Pengaturan', 'Pengguna, kategori SLA, dan knowledge base'],
};

function route() {
  if (!state.shellReady) return;
  const hash = location.hash.replace(/^#/, '') || '/inbox';
  const parts = hash.split('/').filter(Boolean);
  const name = parts[0] || 'inbox';
  let ticketId = null;
  if (name === 'ticket') ticketId = parts[1];

  const isStaff = ['agent', 'supervisor', 'admin'].includes(state.user.role);
  let view = name === 'ticket' ? 'inbox' : name;
  if (!isStaff && name !== 'inbox') view = 'inbox';
  if (view === 'mine' && !isStaff) view = 'inbox';
  if (view === 'reports' && !['supervisor', 'admin'].includes(state.user.role)) view = 'inbox';
  if (view === 'admin' && state.user.role !== 'admin') view = 'inbox';

  const title = TITLES[view] || TITLES.inbox;
  const titleEl = qs('#page-title');
  if (titleEl) titleEl.textContent = ticketId ? 'Detail Tiket' : title[0];

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.nav === view);
  });

  destroyView();
  const container = qs('#view');
  if (!container) return;

  const ctx = {
    user: state.user,
    setInboxCount,
    navigate: (to) => { location.hash = to; },
    toast,
  };

  if (view === 'inbox' || view === 'mine') {
    state.cleanupView = renderInbox(container, ctx, {
      ticketId,
      scope: view === 'mine' ? 'mine' : 'all',
    }) || null;
  } else if (view === 'reports') {
    state.cleanupView = renderReports(container, ctx) || null;
  } else if (view === 'admin') {
    state.cleanupView = renderAdmin(container, ctx) || null;
  }
}

function destroyView() {
  if (typeof state.cleanupView === 'function') {
    try { state.cleanupView(); } catch { /* ignore */ }
  }
  state.cleanupView = null;
}

// ------------------------------------------------------------------ notifications
async function loadNotifications() {
  try {
    const { notifications } = await api('/api/notifications');
    state.notifications = notifications || [];
    renderNotifications();
  } catch { /* ignore */ }
}

function renderNotifications() {
  const badge = qs('#bell-badge');
  if (!badge) return;
  const unread = state.notifications.filter((n) => !n.read_at).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.classList.toggle('hidden', unread === 0);
}

function toggleNotifications() {
  if (qs('.notif-panel')) {
    qs('.notif-panel').remove();
    return;
  }
  renderNotifPanel();
}

function renderNotifPanel() {
  const existing = qs('.notif-panel');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.innerHTML = `<header>NOTIFIKASI
      <span style="flex:1"></span>
      <button class="btn ghost sm" id="notif-read-all" style="font-size:11px">Tandai dibaca</button>
    </header>
    ${state.notifications.length ? state.notifications.slice(0, 25).map((n) => `
      <div class="notif-item ${n.read_at ? 'read' : ''}" data-id="${esc(n.id)}" data-ticket="${esc(n.payload && n.payload.ticket_id || '')}">
        <span class="ndot"></span>
        <div style="flex:1;min-width:0"><b>${esc(n.title)}</b><span>${timeAgo(n.created_at)}</span></div>
      </div>`).join('') : '<div class="notif-empty">Belum ada notifikasi.</div>'}`;
  document.body.appendChild(panel);

  panel.querySelector('#notif-read-all').addEventListener('click', async (event) => {
    event.stopPropagation();
    for (const n of state.notifications.filter((x) => !x.read_at)) {
      try { await api(`/api/notifications/${n.id}/read`, { method: 'POST', body: {} }); } catch { /* ignore */ }
      n.read_at = new Date().toISOString();
    }
    renderNotifications();
    renderNotifPanel();
  });

  panel.querySelectorAll('.notif-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      const ticketId = item.dataset.ticket;
      try { await api(`/api/notifications/${id}/read`, { method: 'POST', body: {} }); } catch { /* ignore */ }
      const notif = state.notifications.find((n) => n.id === id);
      if (notif) notif.read_at = new Date().toISOString();
      renderNotifications();
      panel.remove();
      if (ticketId) location.hash = `#/ticket/${ticketId}`;
    });
  });

  const closer = (event) => {
    if (!panel.contains(event.target) && !qs('#bell').contains(event.target)) {
      panel.remove();
      document.removeEventListener('mousedown', closer);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closer), 0);
}

// ------------------------------------------------------------------ fallback
function startFallbackPolling() {
  setInterval(() => {
    if (!sock.isConnected()) window.dispatchEvent(new CustomEvent('helpdesk:resync'));
  }, 8000);
}

// ------------------------------------------------------------------ logout
function logout(expired) {
  destroyView();
  disconnectSocket();
  session.clear();
  state.user = null;
  state.shellReady = false;
  state.notifications = [];
  if (expired) toast('Sesi berakhir, silakan login kembali.', 'error');
  location.hash = '';
  showLogin();
}

boot();
