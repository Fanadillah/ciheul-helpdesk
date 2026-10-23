import { api, session } from '../api.js';
import * as sock from '../socket.js';
import {
  esc, el, qs, qsa, initials, timeAgo, formatDateTime, formatClock, dayLabel, duration,
  statusLabel, priorityLabel, statusBadge, priorityBadge, toast, modal, icons,
} from '../ui.js';

const OPEN_STATUSES = ['assigned', 'in_progress', 'pending'];
const STATUS_RANK = { new: 0, assigned: 1, in_progress: 2, pending: 3, resolved: 4, closed: 5 };
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
const TRANSITIONS = {
  new: ['assigned', 'in_progress'],
  assigned: ['in_progress', 'pending', 'resolved'],
  in_progress: ['pending', 'resolved'],
  pending: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
};
const EVENT_LABEL = {
  created: 'Tiket dibuat', auto_assigned: 'Auto-assign ke agent', status_changed: 'Status berubah',
  priority_changed: 'Prioritas berubah', category_changed: 'Kategori berubah',
  assignee_changed: 'Agent berubah', first_response: 'Respon pertama dikirim',
  csat_submitted: 'CSAT diisi', sla_breach: 'SLA terlampaui', note: 'Catatan',
};

export function renderInbox(container, ctx, options = {}) {
  const isStaff = ['agent', 'supervisor', 'admin'].includes(ctx.user.role);
  const state = {
    tickets: [],
    loading: true,
    q: '',
    tab: 'all',
    priority: '',
    scope: options.scope || 'all',
    currentId: options.ticketId || null,
    current: null,
    messages: [],
    events: [],
    users: [],
    canned: [],
    categories: [],
    unread: new Set(),
    typingName: null,
    typingStopTimer: null,
    typingClearTimer: null,
    internal: false,
    draft: '',
    attachments: [],
    sending: false,
    cannedOpen: false,
    selectToken: 0,
  };

  container.innerHTML = `
    <div class="inbox" id="inbox">
      <aside class="ticket-list">
        <div class="list-head">
          <div style="display:flex;gap:7px;align-items:center">
            <div class="search-box" style="flex:1">
              ${icons.search}
              <input id="ticket-search" placeholder="Cari tiket, kode, atau nama..." autocomplete="off">
            </div>
            ${!isStaff ? `<button class="btn primary sm" id="new-ticket-btn" title="Buat tiket">${icons.plus}</button>` : ''}
        </div>
          <div class="tabs" id="tabs">
            <button class="tab active" data-tab="all">Semua</button>
            <button class="tab" data-tab="new">Baru</button>
            <button class="tab" data-tab="open">Aktif</button>
            <button class="tab" data-tab="pending">Pending</button>
            <button class="tab" data-tab="done">Selesai</button>
          </div>
          <div class="filter-row">
            <select class="select" id="filter-priority">
              <option value="">Semua prioritas</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            ${isStaff ? `<select class="select" id="filter-scope">
              <option value="all">Semua agent</option>
              <option value="mine">Tiket saya</option>
              <option value="unassigned">Belum ditugaskan</option>
            </select>` : ''}
          </div>
        </div>
        <div class="list-scroll" id="ticket-cards">
          ${Array.from({ length: 5 }).map(() => `
            <div style="padding:10px 8px">
              <div class="skeleton" style="height:12px;width:45%;margin-bottom:8px"></div>
              <div class="skeleton" style="height:12px;width:80%;margin-bottom:8px"></div>
              <div class="skeleton" style="height:10px;width:60%"></div>
            </div>`).join('')}
        </div>
      </aside>
      <section class="detail" id="detail">
        <div class="chat-col" id="chat-col">
          <div class="chat-empty">
            <div>
              <div class="big">${icons.inbox}</div>
              <h3>Pilih tiket untuk mulai</h3>
              <p>Semua percakapan dari widget, web, dan mobile muncul di sini secara real-time.</p>
            </div>
          </div>
        </div>
        <aside class="context" id="context"></aside>
      </section>
    </div>`;

  const refs = {
    inbox: qs('#inbox', container),
    cards: qs('#ticket-cards', container),
    detail: qs('#detail', container),
    chatCol: qs('#chat-col', container),
    context: qs('#context', container),
    search: qs('#ticket-search', container),
    tabs: qs('#tabs', container),
    priority: qs('#filter-priority', container),
    scope: qs('#filter-scope', container),
  };
  if (refs.scope) refs.scope.value = state.scope;

  // ------------------------------------------------------------- data load
  async function loadInitial() {
    try {
      const requests = [api('/api/tickets?limit=100')];
      if (isStaff) {
        requests.push(api('/api/users'));
        requests.push(api('/api/canned-responses'));
        requests.push(api('/api/categories'));
      } else {
        requests.push(api('/api/public/categories'));
      }
      const [ticketsRes, second, third, fourth] = await Promise.all(requests);
      state.tickets = ticketsRes.tickets || [];
      if (isStaff) {
        state.users = (second.users || []).filter((u) => ['agent', 'supervisor'].includes(u.role) && u.is_active);
        state.canned = third.canned_responses || [];
        state.categories = fourth.categories || [];
      } else {
        state.categories = second.categories || [];
      }
      state.loading = false;
      renderList();
      updateNavCount();

      const autoId = state.currentId
        || (window.innerWidth > 760 && state.tickets.length ? state.tickets[0].id : null);
      if (autoId) selectTicket(autoId, { silent: true });
      else renderPlaceholder();
    } catch (err) {
      state.loading = false;
      refs.cards.innerHTML = `<div class="list-empty">Gagal memuat tiket.<br>${esc(err.message)}</div>`;
      toast(err.message, 'error');
    }
  }

  function updateNavCount() {
    if (!isStaff) return;
    ctx.setInboxCount(state.tickets.filter((t) => t.status === 'new').length);
  }

  async function refreshTickets() {
    try {
      const data = await api('/api/tickets?limit=100');
      const incoming = data.tickets || [];
      const incomingById = new Map(incoming.map((t) => [t.id, t]));
      // Preserve transient client-side fields that are not part of the REST payload.
      state.tickets = state.tickets
        .filter((t) => incomingById.has(t.id))
        .map((t) => ({ ...t, ...incomingById.get(t.id) }));
      for (const ticket of incoming) {
        if (!state.tickets.some((t) => t.id === ticket.id)) state.tickets.push(ticket);
      }
      sortTickets();
      renderList();
      updateNavCount();
    } catch { /* offline, keep current state */ }
  }

  async function resync() {
    await refreshTickets();
    if (!state.current) return;
    const id = state.current.id;
    const token = state.selectToken;
    try {
      const lastSeq = state.messages.reduce((max, m) => Math.max(max, m.seq || 0), 0);
      const data = await api(`/api/tickets/${id}/messages?after_seq=${lastSeq}`);
      if (token !== state.selectToken) return;
      if ((data.messages || []).length) {
        mergeMessages(data.messages);
        renderMessages();
      }
      const fresh = await api(`/api/tickets/${id}`);
      if (token !== state.selectToken) return;
      const prev = state.current;
      state.current = fresh.ticket;
      if (prev.status !== fresh.ticket.status || prev.priority !== fresh.ticket.priority
        || prev.assignee_id !== fresh.ticket.assignee_id) {
        renderDetail();
      } else {
        refs.context.innerHTML = contextTemplate(fresh.ticket);
        bindContext(fresh.ticket);
      }
    } catch { /* ignore transient failures */ }
  }

  window.addEventListener('helpdesk:resync', resync);

  // ------------------------------------------------------------- list
  function filteredTickets() {
    let list = state.tickets.slice();
    if (state.tab === 'new') list = list.filter((t) => t.status === 'new');
    else if (state.tab === 'open') list = list.filter((t) => OPEN_STATUSES.includes(t.status));
    else if (state.tab === 'pending') list = list.filter((t) => t.status === 'pending');
    else if (state.tab === 'done') list = list.filter((t) => ['resolved', 'closed'].includes(t.status));
    if (state.priority) list = list.filter((t) => t.priority === state.priority);
    if (isStaff && state.scope === 'mine') list = list.filter((t) => t.assignee_id === ctx.user.id);
    if (isStaff && state.scope === 'unassigned') list = list.filter((t) => !t.assignee_id);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((t) => [t.code, t.subject, t.customer_name, t.assignee_name]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    }
    return list;
  }

  function renderList() {
    updateTabCounts();
    const list = filteredTickets();
    if (state.loading) return;
    if (!list.length) {
      refs.cards.innerHTML = `<div class="list-empty">
        <div style="font-size:24px;margin-bottom:8px">&#128236;</div>
        Tidak ada tiket pada filter ini.<br>${isStaff ? 'Coba ubah tab atau kata kunci.' : 'Mulai percakapan baru lewat tombol +.'}
      </div>`;
      return;
    }
    refs.cards.innerHTML = list.map((t) => {
      const active = t.id === state.currentId;
      const unread = state.unread.has(t.id);
      const late = t.sla && (t.sla.first_response_breached || t.sla.resolution_breached);
      const preview = String(t.last_message || t.description || '').replace(/\s+/g, ' ').slice(0, 90);
      return `<div class="ticket-card ${active ? 'active' : ''} ${unread ? 'unread' : ''}" data-id="${esc(t.id)}">
        <div class="prio-stripe ${esc(t.priority)}"></div>
        <div class="tc-top">
          <div class="tc-name">${esc(t.customer_name || 'Customer')}</div>
          <div class="tc-time">${timeAgo(t.updated_at)}</div>
        </div>
        <div class="tc-subject">${esc(t.subject)}</div>
        <div class="tc-preview">${esc(preview)}</div>
        <div class="tc-bottom">
          ${statusBadge(t.status)}
          ${['urgent', 'high'].includes(t.priority) ? priorityBadge(t.priority) : ''}
          ${late ? '<span class="badge sla-late">SLA</span>' : ''}
          <span style="flex:1"></span>
          ${t.assignee_name ? `<span class="badge" title="Assignee">${esc(initials(t.assignee_name))}</span>` : '<span class="badge">Unassigned</span>'}
        </div>
      </div>`;
    }).join('');

    qsa('.ticket-card', refs.cards).forEach((card) => {
      card.addEventListener('click', () => selectTicket(card.dataset.id));
    });
  }

  function updateTabCounts() {
    const counts = {
      all: state.tickets.length,
      new: state.tickets.filter((t) => t.status === 'new').length,
      open: state.tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
      pending: state.tickets.filter((t) => t.status === 'pending').length,
      done: state.tickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length,
    };
    qsa('.tab', refs.tabs).forEach((tab) => {
      const key = tab.dataset.tab;
      tab.innerHTML = `${({ all: 'Semua', new: 'Baru', open: 'Aktif', pending: 'Pending', done: 'Selesai' })[key]} <span class="n">${counts[key] || ''}</span>`;
      tab.classList.toggle('active', key === state.tab);
    });
  }

  function sortTickets() {
    state.tickets.sort((a, b) => {
      const s = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (s) return s;
      const p = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (p) return p;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
  }

  function upsertTicket(ticket) {
    const index = state.tickets.findIndex((t) => t.id === ticket.id);
    if (index >= 0) state.tickets.splice(index, 1, { ...state.tickets[index], ...ticket });
    else state.tickets.push(ticket);
    sortTickets();
    renderList();
    updateNavCount();
  }

  // ------------------------------------------------------------- detail
  async function selectTicket(id, opts = {}) {
    if (!id) return;
    const token = ++state.selectToken;
    if (state.currentId && state.currentId !== id) {
      sock.emit('ticket:leave', { ticket_id: state.currentId });
    }
    state.currentId = id;
    state.unread.delete(id);
    state.messages = [];
    state.events = [];
    state.attachments = [];
    state.draft = '';
    state.internal = false;
    if (!opts.silent) history.replaceState(null, '', `#/ticket/${id}`);
    renderList();
    refs.chatCol.innerHTML = `<div class="chat-empty"><div><div class="big">${icons.clock}</div>
      <h3>Memuat percakapan...</h3><p>Mengambil pesan dan status tiket.</p></div></div>`;
    refs.context.innerHTML = '';

    try {
      const tasks = [
        api(`/api/tickets/${id}`),
        api(`/api/tickets/${id}/messages`),
        isStaff ? api(`/api/tickets/${id}/events`) : Promise.resolve({ events: [] }),
      ];
      const [ticketRes, messagesRes, eventsRes] = await Promise.all(tasks);
      if (token !== state.selectToken) return;
      state.current = ticketRes.ticket;
      state.messages = messagesRes.messages || [];
      state.events = eventsRes.events || [];
      upsertTicket(state.current);
      renderDetail();
      markRead();

      if (sock.isConnected()) {
        const lastSeq = state.messages.reduce((max, m) => Math.max(max, m.seq || 0), 0);
        try {
          const ack = await sock.emitAck('ticket:join', { ticket_id: id, last_seq: lastSeq });
          if (token !== state.selectToken) return;
          if (ack && ack.ok) {
            if (ack.ticket) state.current = ack.ticket;
            mergeMessages(ack.messages || []);
            renderDetail();
          }
        } catch { /* REST already loaded */ }
      }
    } catch (err) {
      if (token !== state.selectToken) return;
      refs.chatCol.innerHTML = `<div class="chat-empty"><div><h3>Tidak dapat memuat tiket</h3>
        <p>${esc(err.message)}</p></div></div>`;
      toast(err.message, 'error');
    }
  }

  function renderPlaceholder() {
    refs.detail.classList.remove('show-detail');
    refs.chatCol.innerHTML = `<div class="chat-empty"><div>
      <div class="big">${icons.inbox}</div>
      <h3>Pilih tiket untuk mulai</h3>
      <p>Semua percakapan dari widget, web, dan mobile muncul di sini secara real-time.</p>
    </div></div>`;
    refs.context.innerHTML = '';
  }

  function renderDetail() {
    const ticket = state.current;
    if (!ticket) { renderPlaceholder(); return; }
    refs.detail.classList.add('show-detail');
    refs.chatCol.innerHTML = chatTemplate(ticket);
    refs.context.innerHTML = contextTemplate(ticket);
    bindChat(ticket);
    bindContext(ticket);
    renderMessages();
    const body = qs('#chat-body', refs.chatCol);
    if (body) body.scrollTop = body.scrollHeight;
  }

  function slaChip(ticket) {
    if (!ticket.sla) return '';
    if (['resolved', 'closed'].includes(ticket.status)) return '<span class="badge resolved">SLA selesai</span>';
    const remaining = ticket.sla.resolution_due_in;
    if (ticket.sla.resolution_breached || (remaining != null && remaining < 0)) {
      return '<span class="badge sla-late">SLA terlampaui</span>';
    }
    if (remaining != null) {
      return `<span class="badge ${remaining < 3600 ? 'priority-high' : ''}">SLA ${esc(duration(remaining))}</span>`;
    }
    return '';
  }

  function chatTemplate(ticket) {
    const closed = ['resolved', 'closed'].includes(ticket.status);
    const statusOptions = [ticket.status, ...(TRANSITIONS[ticket.status] || [])];
    return `
      <div class="chat-head">
        <div class="chat-head-top">
          <button class="iconbtn back-btn" data-act="back" aria-label="Kembali">${icons.back}</button>
          <div style="min-width:0">
            <div class="chat-code">${esc(ticket.code)} &middot; ${esc(ticket.category_name || 'Tanpa kategori')}</div>
            <h2>${esc(ticket.subject)}</h2>
          </div>
          <div class="chat-actions">
            ${isStaff ? `<select class="select" id="status-select" style="width:auto;padding:6px 9px;font-size:12px" title="Ubah status">
              ${statusOptions.map((s) => `<option value="${esc(s)}" ${s === ticket.status ? 'selected' : ''}>${esc(statusLabel(s))}</option>`).join('')}
            </select>` : ''}
            ${isStaff && !closed ? `<button class="btn sm" data-act="resolve" title="Tandai selesai">${icons.check} Selesai</button>` : ''}
            ${isStaff ? `<button class="btn sm" data-act="ai" title="Buat balasan AI">${icons.sparkle} AI</button>` : ''}
          </div>
        </div>
        <div class="chat-badges">
          ${statusBadge(ticket.status)}
          ${priorityBadge(ticket.priority)}
          ${ticket.assignee_name ? `<span class="badge">Agent: ${esc(ticket.assignee_name)}</span>` : '<span class="badge">Belum ditugaskan</span>'}
          ${slaChip(ticket)}
          ${ticket.reopen_count ? `<span class="badge">Reopen ${ticket.reopen_count}x</span>` : ''}
        </div>
      </div>
      <div class="chat-body" id="chat-body"></div>
      <div class="composer" id="composer">
        <div class="composer-toolbar">
          ${isStaff ? `<button class="note-toggle ${state.internal ? 'on' : ''}" data-act="note" title="Catatan internal hanya terlihat agent">${icons.ticket} ${state.internal ? 'Catatan internal' : 'Balas customer'}</button>` : ''}
          ${isStaff && state.canned.length ? `<button class="btn sm ghost" data-act="canned" style="font-size:11.5px">Balasan cepat</button>` : ''}
          ${state.attachments.length ? `<span class="badge" style="margin-left:auto">${icons.paperclip} ${state.attachments.length} file</span>` : ''}
        </div>
        <div class="composer-box">
          <textarea id="composer-input" rows="1" placeholder="${state.internal ? 'Tulis catatan internal (tidak dikirim ke customer)...' : 'Tulis balasan...'}" maxlength="4000">${esc(state.draft)}</textarea>
          <div class="composer-footer">
            <button class="btn" data-act="attach" title="Lampirkan file">${icons.paperclip}</button>
            <input type="file" id="file-input" class="hidden" accept="image/*,.pdf,.txt,.docx,.xlsx">
            <span class="spacer"></span>
            <span style="font-size:10.5px;color:#94a3b8;margin-right:4px">Enter untuk kirim</span>
            <button class="send-btn" data-act="send" id="send-btn">${icons.send} Kirim</button>
          </div>
        </div>
      </div>`;
  }

  function bindChat(ticket) {
    const textarea = qs('#composer-input', refs.chatCol);
    const sendBtn = qs('#send-btn', refs.chatCol);
    if (textarea) {
      textarea.addEventListener('input', () => {
        state.draft = textarea.value;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        typingSignal();
      });
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
      setTimeout(() => textarea.focus(), 40);
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    const statusSelect = qs('#status-select', refs.chatCol);
    if (statusSelect) {
      statusSelect.addEventListener('change', () => patchTicket({ status: statusSelect.value }));
    }

    const fileInput = qs('#file-input', refs.chatCol);
    if (fileInput) fileInput.addEventListener('change', () => uploadFile(fileInput.files[0]));

    qsa('[data-act]', refs.chatCol).forEach((btn) => {
      const act = btn.dataset.act;
      if (act === 'send') return;
      btn.addEventListener('click', () => {
        if (act === 'back') {
          refs.detail.classList.remove('show-detail');
          state.currentId = null;
          history.replaceState(null, '', '#/inbox');
          renderList();
          renderPlaceholder();
        }
        if (act === 'note') {
          state.internal = !state.internal;
          renderDetail();
        }
        if (act === 'resolve') patchTicket({ status: 'resolved' });
        if (act === 'ai') generateAi();
        if (act === 'attach') qs('#file-input', refs.chatCol).click();
        if (act === 'canned') toggleCanned();
      });
    });
  }

  function renderMessages() {
    const body = qs('#chat-body', refs.chatCol);
    if (!body) return;
    if (!state.messages.length) {
      body.innerHTML = `<div class="chat-empty"><div><div class="big">${icons.inbox}</div>
        <h3>Belum ada pesan</h3><p>Kirim pesan pertama untuk memulai percakapan.</p></div></div>`;
      return;
    }
    let lastDay = '';
    const html = state.messages.map((m) => {
      const day = dayLabel(m.created_at);
      const sep = day !== lastDay ? `<div class="day-sep">${esc(day)}</div>` : '';
      lastDay = day;
      const mine = m.sender_type === 'customer' ? !isStaff : isStaff;
      const cls = [mine ? 'mine' : '', m.sender_type === 'customer' ? 'customer' : '',
        m.sender_type === 'ai' ? 'ai' : '', m.is_internal ? 'internal' : ''].filter(Boolean).join(' ');
      const name = m.sender_type === 'customer' ? (m.sender_name || 'Customer')
        : m.sender_type === 'ai' ? 'Helpdesk AI' : (m.sender_name || 'Agent');
      const attachments = (m.attachments || []).map((a) => `<button class="attach" data-attachment="${esc(a.id)}" data-name="${esc(a.original_name)}" title="${esc(a.original_name)}">${icons.paperclip} ${esc(a.original_name)}</button>`).join(' ');
      const meta = `${m._pending ? 'Mengirim...' : m._failed ? 'Gagal - klik untuk ulang' : formatClock(m.created_at)}`;
      return `${sep}<div class="msg-row ${cls}" data-mid="${esc(m.id || m.client_message_id || '')}" ${m._failed ? 'data-failed="1"' : ''}>
        <div class="avatar">${esc(initials(name))}</div>
        <div class="msg-col">
          <div class="msg-name">${esc(name)}</div>
          <div class="bubble">${esc(m.body)}${attachments ? `<div>${attachments}</div>` : ''}</div>
          <div class="msg-meta"><span>${esc(meta)}</span>${mine && !m._pending && !m._failed ? '<span class="seen">&#10003;&#10003;</span>' : ''}</div>
        </div>
      </div>`;
    }).join('');
    body.innerHTML = html + `<div class="typing-ind" id="typing-ind">${state.typingName ? `${esc(state.typingName)} sedang mengetik...` : ''}</div>`;
    qsa('[data-attachment]', body).forEach((btn) => {
      btn.addEventListener('click', () => downloadAttachment(btn.dataset.attachment, btn.dataset.name));
    });
    qsa('[data-failed]', body).forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => retryMessage(row.dataset.mid));
    });
    if (!state.typingName) {
      const typing = qs('#typing-ind', body);
      if (typing) typing.textContent = '';
    }
  }

  function contextTemplate(ticket) {
    const assigneeOptions = isStaff ? state.users.map((u) =>
      `<option value="${esc(u.id)}" ${ticket.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)}${u.role === 'supervisor' ? ' (Spv)' : ''}</option>`).join('') : '';
    const events = state.events.slice(-8).reverse().map((e) => `
      <li><b>${esc(EVENT_LABEL[e.type] || e.type)}</b>
        ${e.from_value || e.to_value ? `${esc(e.from_value || '')}${e.from_value && e.to_value ? ' &rarr; ' : ''}${esc(e.to_value || '')}` : ''}
        <span style="display:block;font-size:10px;color:#94a3b8;margin-top:2px">${timeAgo(e.created_at)}${e.actor_name ? ' · ' + esc(e.actor_name) : ''}</span>
      </li>`).join('');

    const sla = ticket.sla || {};
    let slaPercent = 0;
    let slaClass = '';
    if (ticket.created_at && ticket.sla_resolution_due_at) {
      const total = new Date(ticket.sla_resolution_due_at) - new Date(ticket.created_at);
      const used = Date.now() - new Date(ticket.created_at);
      slaPercent = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
      if (sla.resolution_breached || slaPercent >= 100) slaClass = 'late';
      else if (slaPercent > 70) slaClass = 'warn';
    }

    return `
      <div class="ctx-block">
        <p class="ctx-title">Customer</p>
        <div class="ctx-person">
          <div class="avatar">${esc(initials(ticket.customer_name))}</div>
          <div style="min-width:0"><b>${esc(ticket.customer_name || '-')}</b><span>${esc(ticket.customer_email || '')}</span></div>
        </div>
      </div>
      <div class="ctx-block">
        <p class="ctx-title">Properti tiket</p>
        <div class="kv"><span>Status</span><b>${esc(statusLabel(ticket.status))}</b></div>
        <div class="kv"><span>Prioritas</span><b>${esc(priorityLabel(ticket.priority))}</b></div>
        <div class="kv"><span>Kategori</span><b>${esc(ticket.category_name || '-')}</b></div>
        <div class="kv"><span>Channel</span><b>${esc(ticket.channel)}</b></div>
        <div class="kv"><span>Dibuat</span><b>${esc(formatDateTime(ticket.created_at))}</b></div>
        <div class="kv"><span>Respon pertama</span><b>${ticket.first_response_at ? esc(formatDateTime(ticket.first_response_at)) : 'Belum'}</b></div>
        ${isStaff ? `<div class="kv"><span>Assignee</span><b>${esc(ticket.assignee_name || '-')}</b></div>` : ''}
      </div>
      ${isStaff ? `<div class="ctx-block">
        <p class="ctx-title">Tugaskan ke</p>
        <select class="select" id="assign-select">
          <option value="">Belum ditugaskan</option>
          ${assigneeOptions}
        </select>
        ${ticket.assignee_id !== ctx.user.id ? `<button class="btn sm block" data-act="claim" style="margin-top:7px">Ambil tiket ini</button>` : ''}
      </div>` : ''}
      <div class="ctx-block">
        <p class="ctx-title">SLA resolusi</p>
        <div class="sla-meter">
          <div class="sla-bar"><i class="${slaClass}" style="width:${slaPercent}%"></i></div>
          <div class="sla-note"><span>${esc(formatDateTime(ticket.sla_resolution_due_at))}</span>
            <span>${sla.resolution_due_in != null ? (sla.resolution_due_in < 0 ? 'terlambat ' + duration(sla.resolution_due_in) : duration(sla.resolution_due_in) + ' lagi') : '-'}</span>
          </div>
        </div>
      </div>
      ${!isStaff && ['resolved', 'closed'].includes(ticket.status) && !ticket.csat_rating ? `
        <div class="ctx-block">
          <p class="ctx-title">Kepuasan Anda</p>
          <div class="csat-box">
            <div style="display:flex;justify-content:center;gap:4px;margin-bottom:1px">
              ${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-rating="${n}" style="border:0;background:none;font-size:22px;color:#cbd5e1;cursor:pointer" aria-label="${n} bintang">&#9733;</button>`).join('')}
            </div>
            <p>Beri penilaian untuk membantu kami meningkatkan layanan.</p>
          </div>
        </div>` : ''}
      ${ticket.csat_rating ? `<div class="ctx-block">
        <p class="ctx-title">CSAT</p>
        <div class="csat-box">
          <div class="csat-stars">${'&#9733;'.repeat(ticket.csat_rating)}${'&#9734;'.repeat(5 - ticket.csat_rating)}</div>
          <p>${esc(ticket.csat_comment || 'Customer memberi penilaian ' + ticket.csat_rating + '/5.')}</p>
        </div>
      </div>` : ''}
      ${isStaff ? `<div class="ctx-block">
        <p class="ctx-title">Aksi cepat</p>
        <div class="ctx-actions">
          <button class="btn sm" data-act="ai">${icons.sparkle} Buat balasan AI</button>
          ${ticket.status === 'resolved' ? `<button class="btn sm" data-act="close">Tutup tiket</button>` : ''}
          ${!['resolved', 'closed'].includes(ticket.status) ? `<button class="btn sm" data-act="pending">Tandai pending</button>` : ''}
        </div>
      </div>` : ''}
      ${!isStaff && ['resolved', 'closed'].includes(ticket.status) ? `<div class="ctx-block">
        <button class="btn sm block" data-act="reopen">Buka kembali tiket</button>
      </div>` : ''}
      ${isStaff && events ? `<div class="ctx-block">
        <p class="ctx-title">Riwayat</p>
        <ul class="timeline">${events}</ul>
      </div>` : ''}`;
  }

  function bindContext(ticket) {
    const assignSelect = qs('#assign-select', refs.context);
    if (assignSelect) {
      assignSelect.addEventListener('change', () => patchTicket({ assignee_id: assignSelect.value || null }));
    }
    qsa('[data-act]', refs.context).forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'claim') patchTicket({ assignee_id: ctx.user.id });
        if (act === 'ai') generateAi();
        if (act === 'close') patchTicket({ status: 'closed' });
        if (act === 'pending') patchTicket({ status: 'pending' });
        if (act === 'reopen') reopenTicket();
      });
    });
    qsa('[data-rating]', refs.context).forEach((btn) => {
      btn.addEventListener('click', () => submitCsat(Number(btn.dataset.rating)));
    });
  }

  // ------------------------------------------------------------- actions
  async function patchTicket(patch) {
    if (!state.current) return;
    try {
      const data = await api(`/api/tickets/${state.current.id}`, { method: 'PATCH', body: patch });
      state.current = data.ticket;
      upsertTicket(data.ticket);
      renderDetail();
      const labels = { resolved: 'Tiket ditandai selesai', closed: 'Tiket ditutup', pending: 'Tiket ditandai pending' };
      toast(labels[patch.status] || (patch.assignee_id ? 'Assignee diperbarui' : 'Tiket diperbarui'), 'success');
      if (isStaff) refreshEvents();
    } catch (err) {
      toast(err.message, 'error');
      renderDetail();
    }
  }

  async function refreshEvents() {
    if (!isStaff || !state.current) return;
    try {
      const data = await api(`/api/tickets/${state.current.id}/events`);
      state.events = data.events || [];
      refs.context.innerHTML = contextTemplate(state.current);
      bindContext(state.current);
    } catch { /* ignore */ }
  }

  async function reopenTicket() {
    try {
      const data = await api(`/api/tickets/${state.current.id}/reopen`, { method: 'POST', body: {} });
      state.current = data.ticket;
      upsertTicket(data.ticket);
      renderDetail();
      toast('Tiket dibuka kembali', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function submitCsat(rating) {
    try {
      const data = await api(`/api/tickets/${state.current.id}/csat`, {
        method: 'POST', body: { rating },
      });
      state.current = data.ticket;
      upsertTicket(data.ticket);
      renderDetail();
      toast('Terima kasih atas penilaian Anda!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function generateAi() {
    if (!state.current) return;
    toast('AI sedang menyusun balasan...');
    try {
      await api(`/api/tickets/${state.current.id}/ai-reply`, { method: 'POST', body: {} });
      const data = await api(`/api/tickets/${state.current.id}/messages`);
      state.messages = data.messages || [];
      renderMessages();
      toast('Balasan AI dibuat', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function uploadFile(file) {
    if (!file || !state.current) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('Ukuran file maksimal 5 MB', 'error');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    toast('Mengunggah lampiran...');
    try {
      const data = await api(`/api/tickets/${state.current.id}/attachments`, { method: 'POST', body: form });
      state.attachments.push(data.attachment);
      renderDetail();
      toast('Lampiran siap dikirim', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function toggleCanned() {
    let pop = qs('.canned', refs.chatCol);
    if (pop) { pop.remove(); return; }
    pop = el(`<div class="canned">
      ${state.canned.map((c, i) => `<button data-canned="${i}"><b>${esc(c.title)}</b><span>${esc(c.body)}</span></button>`).join('')}
    </div>`);
    qs('#composer', refs.chatCol).appendChild(pop);
    qsa('[data-canned]', pop).forEach((btn) => {
      btn.addEventListener('click', () => {
        state.draft = state.canned[Number(btn.dataset.canned)].body;
        pop.remove();
        const textarea = qs('#composer-input', refs.chatCol);
        if (textarea) { textarea.value = state.draft; textarea.focus(); }
      });
    });
  }

  function typingSignal() {
    if (!sock.isConnected() || !state.current) return;
    sock.emit('typing', { ticket_id: state.current.id, is_typing: true });
    clearTimeout(state.typingStopTimer);
    state.typingStopTimer = setTimeout(() => {
      sock.emit('typing', { ticket_id: state.current.id, is_typing: false });
    }, 2500);
  }

  async function sendMessage() {
    const textarea = qs('#composer-input', refs.chatCol);
    if (!textarea || state.sending) return;
    const body = textarea.value.trim();
    if (!body && !state.attachments.length) return;
    if (!state.current) return;

    const payload = {
      ticket_id: state.current.id,
      body,
      client_message_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      is_internal: state.internal,
      attachment_ids: state.attachments.map((a) => a.id),
    };
    const optimistic = {
      id: `tmp-${payload.client_message_id}`,
      client_message_id: payload.client_message_id,
      sender_type: isStaff ? 'agent' : 'customer',
      sender_name: ctx.user.name,
      body,
      is_internal: payload.is_internal,
      created_at: new Date().toISOString(),
      attachments: state.attachments,
      _pending: true,
    };

    state.messages.push(optimistic);
    state.draft = '';
    state.attachments = [];
    state.internal = false;
    state.sending = true;
    renderDetail();
    scrollBottom();
    textarea.value = '';
    textarea.style.height = 'auto';

    try {
      let message = null;
      if (sock.isConnected()) {
        const ack = await sock.emitAck('message:send', payload);
        if (!ack || !ack.ok) throw new Error((ack && ack.error) || 'Gagal mengirim pesan');
        message = {
          id: ack.message_id, client_message_id: payload.client_message_id,
          sender_type: optimistic.sender_type, sender_name: ctx.user.name, body,
          is_internal: payload.is_internal, created_at: ack.created_at, seq: ack.seq,
          attachments: optimistic.attachments,
        };
      } else {
        const data = await api(`/api/tickets/${state.current.id}/messages`, { method: 'POST', body: payload });
        message = data.message;
      }
      replaceOptimistic(payload.client_message_id, message);
      if (state.current.status === 'resolved' || state.current.status === 'closed') {
        selectTicket(state.current.id, { silent: true });
      }
    } catch (err) {
      state.messages = state.messages.map((m) => (
        m.client_message_id === payload.client_message_id ? { ...m, _pending: false, _failed: true, _payload: payload } : m
      ));
      renderMessages();
      toast(`Gagal mengirim: ${err.message}`, 'error');
    } finally {
      state.sending = false;
      renderMessages();
      const input = qs('#composer-input', refs.chatCol);
      if (input) input.focus();
    }
  }

  async function retryMessage(clientId) {
    const failed = state.messages.find((m) => m.client_message_id === clientId && m._payload);
    if (!failed) return;
    const payload = failed._payload;
    state.messages = state.messages.map((m) => (
      m.client_message_id === clientId ? { ...m, _failed: false, _pending: true } : m
    ));
    renderMessages();
    try {
      const data = await api(`/api/tickets/${payload.ticket_id}/messages`, { method: 'POST', body: payload });
      replaceOptimistic(clientId, data.message);
    } catch (err) {
      state.messages = state.messages.map((m) => (
        m.client_message_id === clientId ? { ...m, _pending: false, _failed: true } : m
      ));
      renderMessages();
      toast(err.message, 'error');
    }
  }

  function replaceOptimistic(clientId, message) {
    const index = state.messages.findIndex((m) => m.client_message_id === clientId);
    if (index >= 0) state.messages.splice(index, 1, { ...message, _pending: false, _failed: false });
    else if (message) state.messages.push(message);
    state.messages.sort((a, b) => (a.seq || 99999) - (b.seq || 99999));
    renderMessages();
  }

  function mergeMessages(list) {
    list.forEach((message) => {
      const byId = message.id && state.messages.findIndex((m) => m.id === message.id);
      const byClient = message.client_message_id && state.messages.findIndex((m) => m.client_message_id === message.client_message_id);
      const index = byId >= 0 ? byId : byClient;
      if (index >= 0) state.messages.splice(index, 1, message);
      else state.messages.push(message);
    });
    state.messages.sort((a, b) => (a.seq || 99999) - (b.seq || 99999));
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      const body = qs('#chat-body', refs.chatCol);
      if (body) body.scrollTop = body.scrollHeight;
    });
  }

  async function markRead() {
    if (!state.current) return;
    try {
      await api(`/api/tickets/${state.current.id}/read`, { method: 'POST', body: {} });
    } catch { /* non-critical */ }
  }

  async function downloadAttachment(id, name) {
    try {
      const res = await fetch(`/api/attachments/${id}`, {
        headers: { authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('Lampiran tidak dapat diunduh');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name || 'lampiran';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function newTicketModal() {
    const options = state.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const { overlay, close } = modal({
      title: 'Buat tiket baru',
      body: `<div class="field"><label>Subjek</label><input class="input" id="nt-subject" maxlength="160" placeholder="Ringkasan singkat kendala"></div>
        <div class="field"><label>Kategori</label><select class="select" id="nt-category">${options}</select></div>
        <div class="field"><label>Deskripsi</label><textarea class="textarea" id="nt-desc" rows="4" maxlength="4000" placeholder="Jelaskan kendala Anda secara detail..."></textarea></div>
        <p style="font-size:11px;color:#94a3b8;margin:0">Tim support akan merespons sesuai SLA kategori yang dipilih.</p>`,
      footer: '<button class="btn" data-x="cancel">Batal</button><button class="btn primary" data-x="ok">Buat tiket</button>',
    });
    overlay.querySelector('[data-x="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-x="ok"]').addEventListener('click', async () => {
      const subject = overlay.querySelector('#nt-subject').value.trim();
      const description = overlay.querySelector('#nt-desc').value.trim();
      const category_id = overlay.querySelector('#nt-category').value;
      if (subject.length < 3 || description.length < 5) {
        toast('Subjek dan deskripsi wajib diisi', 'error');
        return;
      }
      try {
        const data = await api('/api/tickets', {
          method: 'POST',
          body: { subject, description, category_id, channel: 'web' },
        });
        close();
        upsertTicket(data.ticket);
        toast('Tiket berhasil dibuat', 'success');
        selectTicket(data.ticket.id);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ------------------------------------------------------------- realtime
  const unsubs = [];
  unsubs.push(sock.on('ticket:update', (ticket) => {
    upsertTicket(ticket);
    if (state.current && ticket.id === state.current.id) {
      state.current = ticket;
      renderDetail();
    }
  }));

  unsubs.push(sock.on('ticket:created', (ticket) => {
    if (!isStaff) return;
    upsertTicket(ticket);
    toast(`Tiket baru: ${ticket.subject}`, 'info');
  }));

  unsubs.push(sock.on('message:new', (message) => {
    const ticketId = state.current && state.current.id;
    if (message.ticket_id === ticketId) {
      mergeMessages([message]);
      renderMessages();
      if (message.sender_type !== 'customer') {
        const body = qs('#chat-body', refs.chatCol);
        if (body) {
          const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 160;
          if (nearBottom) scrollBottom();
        }
      }
      markRead();
      if (state.current && message.sender_type === 'customer') {
        state.current.last_message = message.body;
        state.current.updated_at = message.created_at;
        renderList();
      }
    } else {
      const ticket = state.tickets.find((t) => t.id === message.ticket_id);
      if (ticket) {
        ticket.last_message = message.body;
        ticket.updated_at = message.created_at;
        ticket.message_count = (ticket.message_count || 0) + 1;
        state.unread.add(ticket.id);
        sortTickets();
        renderList();
      } else if (isStaff) {
        refreshTickets();
      }
      if (message.sender_type === 'customer' && isStaff) {
        toast(`Pesan baru dari ${message.sender_name || 'customer'}`, 'info');
      }
    }
  }));

  unsubs.push(sock.on('typing', (payload) => {
    if (!state.current || payload.ticket_id !== state.current.id) return;
    if (payload.user_id === ctx.user.id) return;
    state.typingName = payload.is_typing ? payload.name : null;
    const typing = qs('#typing-ind', refs.chatCol);
    if (typing) typing.textContent = state.typingName ? `${state.typingName} sedang mengetik...` : '';
    clearTimeout(state.typingClearTimer);
    if (payload.is_typing) {
      state.typingClearTimer = setTimeout(() => {
        state.typingName = null;
        const elx = qs('#typing-ind', refs.chatCol);
        if (elx) elx.textContent = '';
      }, 3500);
    }
  }));

  unsubs.push(sock.on('message:read', (payload) => {
    if (!state.current || payload.ticket_id !== state.current.id) return;
    // receipts are informational; no UI change required beyond the double check
  }));

  refs.search.addEventListener('input', () => {
    state.q = refs.search.value.trim();
    renderList();
  });
  refs.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    state.tab = tab.dataset.tab;
    renderList();
  });
  refs.priority.addEventListener('change', () => {
    state.priority = refs.priority.value;
    renderList();
  });
  if (refs.scope) {
    refs.scope.addEventListener('change', () => {
      state.scope = refs.scope.value;
      renderList();
    });
  }
  const newBtn = qs('#new-ticket-btn', container);
  if (newBtn) newBtn.addEventListener('click', newTicketModal);

  function cleanup() {
    unsubs.forEach((fn) => fn && fn());
    window.removeEventListener('helpdesk:resync', resync);
    clearTimeout(state.typingStopTimer);
    clearTimeout(state.typingClearTimer);
    if (state.currentId) sock.emit('ticket:leave', { ticket_id: state.currentId });
  }

  loadInitial();
  return cleanup;
}
