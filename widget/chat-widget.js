/*!
 * Ciheul Helpdesk Live Chat Widget
 * Embed: <script src="https://your-host/widget/chat-widget.js" data-api="https://your-host" async></script>
 * Vanilla JS, Shadow DOM, Socket.IO with REST fallback + offline queue.
 */
(function () {
  'use strict';

  if (window.__helpdeskWidgetLoaded) return;
  window.__helpdeskWidgetLoaded = true;

  var current = document.currentScript;
  var API = (window.HelpdeskWidgetConfig && window.HelpdeskWidgetConfig.apiBase)
    || (current && current.getAttribute('data-api'))
    || (current && current.src ? new URL(current.src).origin : window.location.origin);
  API = String(API).replace(/\/$/, '');

  var BRAND = (window.HelpdeskWidgetConfig && window.HelpdeskWidgetConfig.brand) || 'Ciheul Support';
  var COLOR = (window.HelpdeskWidgetConfig && window.HelpdeskWidgetConfig.color) || '#2563eb';
  var STORE = 'helpdesk_widget_v1';
  var POLL_MS = 8000;

  var state = {
    token: null,
    user: null,
    ticket: null,
    messages: [],
    queue: [],
    socket: null,
    connected: false,
    open: false,
    unread: 0,
    sending: false,
    typingTimer: null,
    pollTimer: null,
    categories: [],
    view: 'boot',
    error: null,
    loading: false,
    draft: '',
  };

  // ---------------------------------------------------------------- storage
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(STORE + ':' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(STORE + ':' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function remove(key) {
    try { localStorage.removeItem(STORE + ':' + key); } catch (e) { /* ignore */ }
  }

  state.token = read('token', null);
  state.user = read('user', null);
  state.queue = read('queue', []);
  var cachedTicket = read('ticket', null);

  // ---------------------------------------------------------------- helpers
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function timeLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return p[0]; }).join('').toUpperCase();
  }
  function ticketCacheKey(id) { return 'messages:' + id; }

  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (options.body && !(options.body instanceof FormData)) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    if (state.token) headers.authorization = 'Bearer ' + state.token;
    var res = await fetch(API + path, Object.assign({}, options, { headers: headers }));
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var message = (data && data.error && data.error.message) || 'Permintaan gagal (' + res.status + ')';
      var error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  // ---------------------------------------------------------------- shadow UI
  var host = document.createElement('div');
  host.id = 'helpdesk-widget-root';
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;width:0;height:0;';
  var shadow = host.attachShadow({ mode: 'open' });
  (document.body || document.documentElement).appendChild(host);

  var css = ''
    + ':host{all:initial;}'
    + '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}'
    + '.launcher{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;'
    + 'background:' + COLOR + ';color:#fff;display:flex;align-items:center;justify-content:center;'
    + 'box-shadow:0 12px 30px rgba(15,23,42,.28);transition:transform .18s ease,box-shadow .18s ease;}'
    + '.launcher:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 16px 36px rgba(15,23,42,.34);}'
    + '.launcher svg{width:28px;height:28px;}'
    + '.badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;'
    + 'color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;'
    + 'border:2px solid #fff;}'
    + '.panel{position:fixed;right:20px;bottom:92px;width:372px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);'
    + 'background:#fff;border-radius:18px;overflow:hidden;display:none;flex-direction:column;'
    + 'box-shadow:0 24px 70px rgba(15,23,42,.28);border:1px solid rgba(15,23,42,.08);}'
    + '.panel.open{display:flex;animation:pop .18s ease-out;}'
    + '@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98);}to{opacity:1;transform:none;}}'
    + '.head{background:linear-gradient(135deg,' + COLOR + ',#1e40af);color:#fff;padding:16px 16px 14px;flex:0 0 auto;}'
    + '.head-top{display:flex;align-items:center;gap:10px;}'
    + '.avatar{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.18);display:flex;align-items:center;'
    + 'justify-content:center;font-weight:700;font-size:15px;backdrop-filter:blur(4px);}'
    + '.head h3{margin:0;font-size:15px;font-weight:700;letter-spacing:.1px;}'
    + '.head p{margin:2px 0 0;font-size:11.5px;opacity:.86;display:flex;align-items:center;gap:5px;}'
    + '.dot{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.18);}'
    + '.dot.off{background:#fbbf24;box-shadow:0 0 0 3px rgba(251,191,36,.2);}'
    + '.icon-btn{margin-left:auto;background:rgba(255,255,255,.16);border:0;color:#fff;width:30px;height:30px;border-radius:9px;'
    + 'cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;}'
    + '.icon-btn:hover{background:rgba(255,255,255,.26);}'
    + '.ticket-line{margin-top:10px;font-size:11px;display:flex;align-items:center;gap:8px;opacity:.92;}'
    + '.chip{background:rgba(255,255,255,.18);border-radius:6px;padding:2px 7px;font-weight:600;}'
    + '.body{flex:1 1 auto;overflow-y:auto;background:#f8fafc;padding:16px 14px;scroll-behavior:smooth;}'
    + '.body::-webkit-scrollbar{width:6px;} .body::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}'
    + '.msg{display:flex;gap:8px;margin-bottom:12px;align-items:flex-end;animation:fade .16s ease;}'
    + '@keyframes fade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}'
    + '.msg.me{flex-direction:row-reverse;}'
    + '.mav{width:28px;height:28px;border-radius:9px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;'
    + 'font-size:11px;font-weight:700;background:#e2e8f0;color:#475569;}'
    + '.msg.me .mav{background:' + COLOR + ';color:#fff;}'
    + '.bubble{max-width:76%;padding:9px 12px;border-radius:14px;background:#fff;color:#0f172a;font-size:13px;'
    + 'line-height:1.45;border:1px solid #e2e8f0;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 2px rgba(15,23,42,.04);}'
    + '.msg.me .bubble{background:' + COLOR + ';color:#fff;border-color:transparent;border-bottom-right-radius:5px;}'
    + '.msg.them .bubble{border-bottom-left-radius:5px;}'
    + '.meta{font-size:10px;color:#94a3b8;margin-top:4px;display:flex;gap:6px;align-items:center;}'
    + '.msg.me .meta{justify-content:flex-end;}'
    + '.pending{opacity:.65;}'
    + '.failed .meta{color:#ef4444;cursor:pointer;}'
    + '.sys{text-align:center;font-size:11px;color:#64748b;background:#eef2f7;border-radius:8px;padding:5px 10px;'
    + 'margin:8px auto;max-width:90%;}'
    + '.typing{font-size:11px;color:#64748b;padding:2px 4px 10px;height:18px;}'
    + '.composer{flex:0 0 auto;border-top:1px solid #e2e8f0;background:#fff;padding:10px;display:flex;gap:8px;align-items:flex-end;}'
    + '.composer textarea{flex:1;resize:none;border:1px solid #dbe3ee;border-radius:12px;padding:10px 12px;font-size:13px;'
    + 'line-height:1.4;max-height:96px;outline:none;color:#0f172a;background:#fff;}'
    + '.composer textarea:focus{border-color:' + COLOR + ';box-shadow:0 0 0 3px rgba(37,99,235,.12);}'
    + '.send{width:38px;height:38px;border-radius:11px;border:0;background:' + COLOR + ';color:#fff;cursor:pointer;'
    + 'display:flex;align-items:center;justify-content:center;flex:0 0 auto;}'
    + '.send:disabled{opacity:.45;cursor:not-allowed;}'
    + '.send svg{width:18px;height:18px;}'
    + '.foot{flex:0 0 auto;text-align:center;font-size:10px;color:#94a3b8;padding:0 0 8px;}'
    + '.form{padding:18px 16px;overflow-y:auto;flex:1;background:#fff;}'
    + '.form h4{margin:0 0 4px;font-size:16px;color:#0f172a;}'
    + '.form p.sub{margin:0 0 14px;font-size:12px;color:#64748b;line-height:1.5;}'
    + '.field{margin-bottom:11px;}'
    + '.field label{display:block;font-size:11.5px;font-weight:600;color:#334155;margin-bottom:5px;}'
    + '.field input,.field select,.field textarea{width:100%;border:1px solid #dbe3ee;border-radius:10px;padding:9px 11px;'
    + 'font-size:13px;outline:none;color:#0f172a;background:#fff;}'
    + '.field input:focus,.field select:focus,.field textarea:focus{border-color:' + COLOR + ';box-shadow:0 0 0 3px rgba(37,99,235,.12);}'
    + '.primary{width:100%;border:0;border-radius:11px;background:' + COLOR + ';color:#fff;font-size:13.5px;font-weight:600;'
    + 'padding:11px;cursor:pointer;margin-top:4px;}'
    + '.primary:disabled{opacity:.6;cursor:not-allowed;}'
    + '.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:9px;padding:8px 10px;font-size:12px;margin-bottom:10px;}'
    + '.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;}'
    + '.welcome .big{width:58px;height:58px;border-radius:18px;background:' + COLOR + ';color:#fff;display:flex;'
    + 'align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;box-shadow:0 12px 26px rgba(37,99,235,.3);}'
    + '.welcome h4{margin:0 0 6px;font-size:17px;color:#0f172a;}'
    + '.welcome p{margin:0 0 16px;font-size:12.5px;color:#64748b;line-height:1.55;max-width:270px;}'
    + '.csat{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:4px 0 12px;text-align:center;}'
    + '.csat h5{margin:0 0 3px;font-size:12.5px;color:#0f172a;}'
    + '.csat p{margin:0 0 8px;font-size:11px;color:#64748b;}'
    + '.stars{display:flex;justify-content:center;gap:6px;}'
    + '.star{border:0;background:none;font-size:22px;cursor:pointer;color:#cbd5e1;padding:0;line-height:1;}'
    + '.star.on{color:#f59e0b;}'
    + '.resolved{flex:0 0 auto;background:#f0fdf4;border-top:1px solid #bbf7d0;padding:10px 12px;display:flex;'
    + 'align-items:center;gap:8px;justify-content:space-between;font-size:12px;color:#166534;}'
    + '.link{background:#fff;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:5px 9px;font-size:11.5px;cursor:pointer;}'
    + '.offline-note{background:#fffbeb;color:#92400e;font-size:11px;padding:6px 12px;text-align:center;border-top:1px solid #fde68a;}'
    + '@media (max-width:420px){.panel{right:12px;left:12px;width:auto;bottom:84px;height:calc(100vh - 110px);max-height:none;}.launcher{right:14px;bottom:14px;}}';

  var style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);

  var launcher = document.createElement('button');
  launcher.className = 'launcher';
  launcher.setAttribute('aria-label', 'Buka live chat');
  launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4.2-1L3 20l1.1-4.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>'
    + '<span class="badge" style="display:none">0</span>';
  shadow.appendChild(launcher);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Live chat helpdesk');
  shadow.appendChild(panel);

  var badge = launcher.querySelector('.badge');
  var els = {};

  // ---------------------------------------------------------------- render
  function setUnread(n) {
    state.unread = n;
    badge.style.display = n > 0 ? 'flex' : 'none';
    badge.textContent = n > 99 ? '99+' : String(n);
  }

  function render() {
    if (!state.open) return;
    panel.innerHTML = '';
    els = {};

    var head = document.createElement('div');
    head.className = 'head';
    var online = state.connected || state.view === 'prechat';
    head.innerHTML = '<div class="head-top">'
      + '<div class="avatar">' + esc(initials(BRAND)) + '</div>'
      + '<div><h3>' + esc(BRAND) + '</h3><p><span class="dot ' + (online ? '' : 'off')
      + '"></span>' + (online ? 'Online - siap membantu' : 'Menghubungkan ulang...') + '</p></div>'
      + '<button class="icon-btn" data-act="minimize" aria-label="Tutup">&#8722;</button></div>'
      + (state.ticket ? '<div class="ticket-line"><span class="chip">' + esc(state.ticket.code) + '</span>'
        + '<span>' + esc(statusLabel(state.ticket.status)) + '</span></div>' : '');
    panel.appendChild(head);

    var body = document.createElement('div');
    body.className = 'body';

    if (state.view === 'prechat') {
      body = document.createElement('div');
      body.className = 'form';
      body.innerHTML = prechatHtml();
      panel.appendChild(body);
      bindPrechat(body);
    } else if (state.view === 'boot') {
      body.innerHTML = '<div class="welcome"><div class="big">...</div><p>Menyiapkan percakapan...</p></div>';
      panel.appendChild(body);
    } else {
      body.innerHTML = messagesHtml();
      panel.appendChild(body);
      els.body = body;
      bindMessages(body);
      requestAnimationFrame(function () { body.scrollTop = body.scrollHeight; });
      var ticketClosed = state.ticket && ['resolved', 'closed'].includes(state.ticket.status);
      if (state.view === 'chat' && !ticketClosed) panel.appendChild(composerNode());
      if (state.ticket && state.ticket.status === 'resolved' && !state.ticket.csat_rating) {
        panel.appendChild(csatNode());
      }
      if (state.ticket && ['resolved', 'closed'].includes(state.ticket.status)) {
        var resolvedBar = document.createElement('div');
        resolvedBar.className = 'resolved';
        resolvedBar.innerHTML = '<span>' + (state.ticket.status === 'closed' ? 'Percakapan ditutup' : 'Tiket selesai')
          + '</span><button class="link" data-act="new-chat">Mulai chat baru</button>';
        panel.appendChild(resolvedBar);
      }
      if (!state.connected) {
        var note = document.createElement('div');
        note.className = 'offline-note';
        note.textContent = state.queue.length
          ? 'Offline - ' + state.queue.length + ' pesan menunggu terkirim otomatis.'
          : 'Koneksi terputus. Pesan tetap tersimpan dan dikirim otomatis.';
        panel.appendChild(note);
      }
    }
    panel.appendChild(titleFoot());
    bindCommon();
  }

  function statusLabel(status) {
    return ({ new: 'Menunggu agen', assigned: 'Ditugaskan', in_progress: 'Sedang ditangani',
      pending: 'Menunggu balasan Anda', resolved: 'Selesai', closed: 'Ditutup' })[status] || status;
  }

  function titleFoot() {
    var foot = document.createElement('div');
    foot.className = 'foot';
    foot.innerHTML = 'Powered by <strong>Ciheul Helpdesk</strong>';
    return foot;
  }

  function prechatHtml() {
    return '<h4>Mulai percakapan</h4><p class="sub">Tim support kami siap membantu. Isi data singkat berikut.</p>'
      + (state.error ? '<div class="err">' + esc(state.error) + '</div>' : '')
      + '<div class="field"><label for="hd-name">Nama</label><input id="hd-name" placeholder="Nama lengkap" maxlength="80" autocomplete="name"></div>'
      + '<div class="field"><label for="hd-email">Email</label><input id="hd-email" type="email" placeholder="nama@perusahaan.com" maxlength="120" autocomplete="email"></div>'
      + '<div class="field"><label for="hd-cat">Topik</label><select id="hd-cat">'
      + state.categories.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('')
      + '</select></div>'
      + '<button class="primary" data-act="start">Mulai chat</button>';
  }

  function messagesHtml() {
    var rows = state.messages.map(function (m) {
      if (m.sender_type === 'system') return '<div class="sys">' + esc(m.body) + '</div>';
      var mine = m.sender_type === 'customer';
      var status = '';
      if (mine && m._pending) status = m._failed ? '<span>Gagal terkirim - klik untuk coba lagi</span>' : '<span>Mengirim...</span>';
      if (mine && !m._pending) status = '<span>Teririm</span>';
      return '<div class="msg ' + (mine ? 'me' : 'them') + (m._pending ? ' pending' : '') + (m._failed ? ' failed' : '') + '"'
        + ' data-mid="' + esc(m.id || m.client_message_id || '') + '"'
        + (m._failed ? ' data-act="retry"' : '') + '>'
        + '<div class="mav">' + esc(initials(m.sender_name || (mine ? state.user && state.user.name : 'CS'))) + '</div>'
        + '<div><div class="bubble">' + esc(m.body) + '</div>'
        + '<div class="meta"><span>' + esc(m.sender_name || (mine ? 'Anda' : 'Support')) + '</span>'
        + '<span>&middot;</span><span>' + timeLabel(m.created_at) + '</span>' + status + '</div></div></div>';
    }).join('');

    var typing = state.typingName
      ? '<div class="typing">' + esc(state.typingName) + ' sedang mengetik...</div>' : '<div class="typing"></div>';

    if (!rows && !state.ticket) {
      return '<div class="welcome"><div class="big">&#128172;</div><h4>Halo' + (state.user ? ', ' + esc(state.user.name.split(' ')[0]) : '')
        + '!</h4><p>Ada yang bisa kami bantu? Kirim pesan pertama Anda dan tim support akan segera merespons.</p></div>';
    }
    return (rows ? '<div class="sys">Percakapan terenkripsi dan tersimpan otomatis</div>' + rows : '') + typing;
  }

  function composerNode() {
    var wrap = document.createElement('div');
    wrap.className = 'composer';
    wrap.innerHTML = '<textarea rows="1" maxlength="4000" placeholder="Tulis pesan..." aria-label="Tulis pesan"></textarea>'
      + '<button class="send" data-act="send" aria-label="Kirim" disabled>'
      + '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z"/></svg></button>';
    var textarea = wrap.querySelector('textarea');
    var sendBtn = wrap.querySelector('.send');
    textarea.value = state.draft || '';
    sendBtn.disabled = !textarea.value.trim();
    textarea.addEventListener('input', function () {
      state.draft = textarea.value;
      sendBtn.disabled = !textarea.value.trim();
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 96) + 'px';
      emitTyping(true);
    });
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (textarea.value.trim()) sendMessage(textarea.value);
      }
    });
    sendBtn.addEventListener('click', function () { sendMessage(textarea.value); });
    els.textarea = textarea;
    els.sendBtn = sendBtn;
    setTimeout(function () { if (state.open) textarea.focus(); }, 80);
    return wrap;
  }

  function csatNode() {
    var wrap = document.createElement('div');
    wrap.className = 'csat';
    wrap.innerHTML = '<h5>Bagaimana pengalaman Anda?</h5><p>Penilaian membantu kami meningkatkan layanan.</p>'
      + '<div class="stars">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button class="star" data-rating="' + n + '" aria-label="' + n + ' bintang">&#9733;</button>';
      }).join('') + '</div>';
    wrap.querySelectorAll('.star').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var rating = Number(btn.getAttribute('data-rating'));
        submitCsat(rating, wrap);
      });
    });
    return wrap;
  }

  function bindMessages(body) {
    body.querySelectorAll('[data-act="retry"]').forEach(function (node) {
      node.addEventListener('click', function () { retryMessage(node.getAttribute('data-mid')); });
    });
  }

  function bindPrechat(form) {
    var name = form.querySelector('#hd-name');
    var email = form.querySelector('#hd-email');
    var cat = form.querySelector('#hd-cat');
    name.value = (state.user && state.user.name) || read('name', '') || '';
    email.value = (state.user && state.user.email) || read('email', '') || '';
    var submit = form.querySelector('[data-act="start"]');
    submit.addEventListener('click', async function () {
      state.error = null;
      var n = name.value.trim();
      var m = email.value.trim();
      if (n.length < 2) { state.error = 'Nama minimal 2 karakter'; return render(); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) { state.error = 'Format email tidak valid'; return render(); }
      submit.disabled = true;
      submit.textContent = 'Menghubungkan...';
      try {
        var result = await api('/api/public/session', { method: 'POST', body: { name: n, email: m } });
        state.token = result.token;
        state.user = result.user;
        write('token', result.token);
        write('user', result.user);
        write('name', n);
        write('email', m);
        write('category', cat.value);
        state.view = 'chat';
        render();
        connect();
        await restoreTicket();
      } catch (err) {
        state.error = err.message;
        render();
      }
    });
    setTimeout(function () { if (state.open) name.focus(); }, 80);
  }

  function bindCommon() {
    panel.querySelectorAll('[data-act="minimize"]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
    panel.querySelectorAll('[data-act="new-chat"]').forEach(function (btn) {
      btn.addEventListener('click', startNewChat);
    });
  }

  // ---------------------------------------------------------------- data flow
  function persistMessages() {
    if (!state.ticket) return;
    write(ticketCacheKey(state.ticket.id), state.messages.slice(-120));
  }

  function mergeMessages(list) {
    var seen = {};
    state.messages.forEach(function (m) {
      seen[m.id || m.client_message_id] = true;
    });
    var added = 0;
    list.forEach(function (m) {
      var key = m.id || m.client_message_id;
      if (!seen[key]) {
        // reconcile optimistic message with the server echo
        var idx = state.messages.findIndex(function (x) {
          return x.client_message_id && x.client_message_id === m.client_message_id;
        });
        if (idx >= 0) state.messages.splice(idx, 1, m);
        else state.messages.push(m);
        seen[key] = true;
        added += 1;
      }
    });
    state.messages.sort(function (a, b) {
      return (a.seq || 99999) - (b.seq || 99999);
    });
    persistMessages();
    return added;
  }

  async function restoreTicket() {
    if (!state.token) { state.view = 'prechat'; return render(); }
    state.loading = true;
    try {
      var result = await api('/api/tickets?limit=1');
      var latest = result.tickets && result.tickets[0];
      if (latest && !['closed'].includes(latest.status)) {
        state.ticket = latest;
        write('ticket', latest);
        state.messages = read(ticketCacheKey(latest.id), []);
        state.view = 'chat';
        joinTicket();
      } else {
        state.ticket = null;
        remove('ticket');
        state.view = 'chat';
      }
    } catch (err) {
      if (err.status === 401) {
        state.token = null; state.user = null; state.ticket = null;
        remove('token'); remove('user'); remove('ticket');
        state.view = 'prechat';
      } else {
        state.ticket = cachedTicket;
        state.messages = cachedTicket ? read(ticketCacheKey(cachedTicket.id), []) : [];
        state.view = cachedTicket ? 'chat' : 'chat';
      }
    } finally {
      state.loading = false;
      render();
      if (state.token) connect();
    }
  }

  async function loadCategories() {
    try {
      var data = await api('/api/public/categories');
      state.categories = data.categories || [];
    } catch (e) { state.categories = []; }
  }

  async function joinTicket() {
    if (!state.ticket) return;
    var lastSeq = state.messages.reduce(function (max, m) { return Math.max(max, m.seq || 0); }, 0);
    if (state.socket && state.connected) {
      state.socket.emit('ticket:join', { ticket_id: state.ticket.id, last_seq: lastSeq }, function (ack) {
        if (!ack || !ack.ok) return;
        if (ack.ticket) { state.ticket = ack.ticket; write('ticket', ack.ticket); }
        mergeMessages(ack.messages || []);
        render();
      });
    } else {
      try {
        var data = await api('/api/tickets/' + state.ticket.id + '/messages?after_seq=' + lastSeq);
        mergeMessages(data.messages || []);
        render();
        var t = await api('/api/tickets/' + state.ticket.id);
        state.ticket = t.ticket;
        write('ticket', t.ticket);
        render();
      } catch (e) { /* will retry */ }
    }
  }

  async function ensureTicket(firstText, clientId) {
    if (state.ticket) return state.ticket;
    var categoryId = read('category', null) || (state.categories[0] && state.categories[0].id);
    if (!categoryId) throw new Error('Kategori belum tersedia, coba lagi.');
    var subject = firstText.trim().replace(/\s+/g, ' ').slice(0, 90)
      || 'Percakapan baru dari widget';
    var data = await api('/api/tickets', {
      method: 'POST',
      body: {
        subject: subject,
        description: firstText,
        category_id: categoryId,
        channel: 'widget',
        client_message_id: clientId,
      },
    });
    state.ticket = data.ticket;
    write('ticket', data.ticket);
    joinTicket();
    return data.ticket;
  }

  async function sendMessage(raw) {
    var text = String(raw || '').trim();
    if (!text) return;
    if (state.view === 'prechat') return;
    state.draft = '';
    if (els.textarea) { els.textarea.value = ''; els.textarea.style.height = 'auto'; }
    if (els.sendBtn) els.sendBtn.disabled = true;
    emitTyping(false);

    var clientId = uuid();
    var optimistic = {
      id: 'tmp-' + clientId,
      client_message_id: clientId,
      sender_type: 'customer',
      sender_name: state.user ? state.user.name : 'Anda',
      body: text,
      created_at: new Date().toISOString(),
      _pending: true,
    };

    var isFirst = !state.ticket;
    if (isFirst) {
      // the ticket description becomes the first message on the server
      state.messages.push(Object.assign({}, optimistic, { _pending: true }));
      render();
      try {
        await ensureTicket(text, clientId);
        render();
      } catch (err) {
        markFailed(clientId, err.message);
      }
      return;
    }

    state.messages.push(optimistic);
    render();
    await deliver({ ticket_id: state.ticket.id, body: text, client_message_id: clientId }, clientId);
  }

  async function deliver(payload, clientId) {
    if (state.socket && state.connected) {
      state.socket.timeout(8000).emit('message:send', payload, function (err, ack) {
        if (err) { queueMessage(payload, clientId); return; }
        if (ack && ack.ok) {
          reconcile(clientId, ack);
        } else {
          markFailed(clientId, (ack && ack.error) || 'Gagal mengirim pesan');
        }
      });
      return;
    }
    try {
      var data = await api('/api/tickets/' + payload.ticket_id + '/messages', {
        method: 'POST', body: payload,
      });
      reconcile(clientId, { message_id: data.message.id, seq: data.message.seq, created_at: data.message.created_at });
    } catch (err) {
      if (err.status === 401 || err.status === 400 || err.status === 403) markFailed(clientId, err.message);
      else queueMessage(payload, clientId);
    }
  }

  function reconcile(clientId, ack) {
    var previous = state.messages.find(function (m) { return m.client_message_id === clientId; });
    var body = previous ? previous.body : '';
    state.messages = state.messages.filter(function (m) {
      return !(m.client_message_id === clientId && m._pending);
    });
    var fresh = state.messages.find(function (m) { return m.client_message_id === clientId; });
    if (!fresh) {
      state.messages.push({
        id: ack.message_id, client_message_id: clientId, sender_type: 'customer',
        sender_name: state.user ? state.user.name : 'Anda', body: body,
        created_at: ack.created_at || new Date().toISOString(), seq: ack.seq,
      });
    }
    state.queue = state.queue.filter(function (q) { return q.client_message_id !== clientId; });
    write('queue', state.queue);
    if (state.socket && state.connected && state.ticket) joinTicket();
    render();
  }

  function markFailed(clientId, message) {
    state.messages = state.messages.map(function (m) {
      if (m.client_message_id === clientId) return Object.assign({}, m, { _pending: false, _failed: true });
      return m;
    });
    var failed = state.messages.find(function (m) { return m.client_message_id === clientId; });
    if (failed) failed._error = message;
    render();
  }

  function queueMessage(payload, clientId) {
    state.messages = state.messages.map(function (m) {
      if (m.client_message_id === clientId) return Object.assign({}, m, { _pending: false, _queued: true });
      return m;
    });
    if (!state.queue.some(function (q) { return q.client_message_id === clientId; })) {
      state.queue.push(payload);
      write('queue', state.queue);
    }
    render();
  }

  async function flushQueue() {
    if (!state.queue.length || !state.ticket) return;
    var pending = state.queue.slice();
    for (var i = 0; i < pending.length; i += 1) {
      var item = pending[i];
      if (item.ticket_id !== state.ticket.id) {
        state.queue = state.queue.filter(function (q) { return q.client_message_id !== item.client_message_id; });
        continue;
      }
      await new Promise(function (resolve) {
        if (state.socket && state.connected) {
          state.socket.timeout(8000).emit('message:send', item, function (err, ack) {
            if (!err && ack && ack.ok) {
              reconcile(item.client_message_id, ack);
              state.queue = state.queue.filter(function (q) { return q.client_message_id !== item.client_message_id; });
            }
            resolve();
          });
        } else {
          fetch(API + '/api/tickets/' + item.ticket_id + '/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + state.token },
            body: JSON.stringify(item),
          }).then(function (res) {
            if (res.ok) {
              state.queue = state.queue.filter(function (q) { return q.client_message_id !== item.client_message_id; });
            }
            resolve();
          }).catch(function () { resolve(); });
        }
      });
    }
    write('queue', state.queue);
    render();
  }

  function retryMessage(clientId) {
    var failed = state.messages.find(function (m) { return m.client_message_id === clientId; });
    if (!failed || !state.ticket) return;
    state.messages = state.messages.filter(function (m) { return m.client_message_id !== clientId; });
    state.messages.push(Object.assign({}, failed, { _pending: true, _failed: false }));
    render();
    deliver({ ticket_id: state.ticket.id, body: failed.body, client_message_id: clientId }, clientId);
  }

  async function submitCsat(rating, wrap) {
    wrap.querySelectorAll('.star').forEach(function (btn, index) {
      btn.classList.toggle('on', index < rating);
    });
    try {
      await api('/api/tickets/' + state.ticket.id + '/csat', {
        method: 'POST', body: { rating: rating },
      });
      state.ticket.csat_rating = rating;
      write('ticket', state.ticket);
      setTimeout(render, 500);
    } catch (err) {
      state.error = err.message;
      render();
    }
  }

  function startNewChat() {
    state.ticket = null;
    state.messages = [];
    remove('ticket');
    state.view = 'chat';
    render();
  }

  // ---------------------------------------------------------------- socket
  function loadSocketClient() {
    return new Promise(function (resolve, reject) {
      if (window.io) return resolve(window.io);
      var script = document.createElement('script');
      script.src = API + '/socket.io/socket.io.js';
      script.async = true;
      script.onload = function () { window.io ? resolve(window.io) : reject(new Error('Socket client gagal dimuat')); };
      script.onerror = function () { reject(new Error('Socket client gagal dimuat')); };
      document.head.appendChild(script);
    });
  }

  async function connect() {
    if (!state.token) return;
    try {
      var io = await loadSocketClient();
      if (state.socket) return;
      state.socket = io(API, {
        auth: { token: state.token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      state.socket.on('connect', function () {
        state.connected = true;
        render();
        if (state.ticket) joinTicket();
        flushQueue();
        if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
      });

      state.socket.on('disconnect', function () {
        state.connected = false;
        render();
        startPolling();
      });

      state.socket.on('connect_error', function () {
        state.connected = false;
        render();
        startPolling();
      });

      state.socket.on('message:new', function (message) {
        mergeMessages([message]);
        if (!state.open) setUnread(state.unread + 1);
        if (message.sender_type === 'customer') return;
        render();
      });

      state.socket.on('ticket:update', function (ticket) {
        if (!state.ticket || ticket.id !== state.ticket.id) return;
        state.ticket = ticket;
        write('ticket', ticket);
        render();
      });

      state.socket.on('typing', function (payload) {
        if (!state.ticket || payload.ticket_id !== state.ticket.id) return;
        if (payload.user_id === (state.user && state.user.id)) return;
        state.typingName = payload.is_typing ? payload.name : null;
        if (state.typingTimer) clearTimeout(state.typingTimer);
        if (payload.is_typing) {
          state.typingTimer = setTimeout(function () { state.typingName = null; render(); }, 4000);
        }
        render();
      });

      state.socket.on('notification:new', function () {
        if (!state.open) setUnread(state.unread + 1);
      });
    } catch (err) {
      state.connected = false;
      startPolling();
    }
  }

  function startPolling() {
    if (state.pollTimer || !state.token) return;
    state.pollTimer = setInterval(function () {
      if (state.socket && state.connected) return;
      joinTicket();
      flushQueue();
    }, POLL_MS);
  }

  function emitTyping(isTyping) {
    if (!state.socket || !state.connected || !state.ticket) return;
    state.socket.emit('typing', { ticket_id: state.ticket.id, is_typing: isTyping });
    if (state.typingTimer) clearTimeout(state.typingTimer);
    if (isTyping) {
      state.typingTimer = setTimeout(function () { emitTyping(false); }, 3000);
    }
  }

  // ---------------------------------------------------------------- lifecycle
  function open() {
    if (state.open) return;
    state.open = true;
    setUnread(0);
    panel.classList.add('open');
    launcher.setAttribute('aria-expanded', 'true');
    loadCategories().then(function () {
      if (!state.token) { state.view = 'prechat'; render(); }
      else if (state.view === 'prechat') { state.view = 'chat'; render(); }
      else { render(); restoreTicket(); }
    });
    if (state.token) connect();
  }

  function close() {
    state.open = false;
    panel.classList.remove('open');
    launcher.setAttribute('aria-expanded', 'false');
    emitTyping(false);
  }

  launcher.addEventListener('click', function () { state.open ? close() : open(); });

  // deep-link support: ?helpdesk=open
  if (/[?&]helpdesk=open/.test(window.location.search)) setTimeout(open, 400);

  window.HelpdeskWidget = {
    open: open,
    close: close,
    toggle: function () { state.open ? close() : open(); },
  };
})();
