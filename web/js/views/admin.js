import { api } from '../api.js';
import { esc, toast, modal, confirmDialog, formatDateTime, icons } from '../ui.js';

const ROLE_LABEL = { customer: 'Customer', agent: 'Agent', supervisor: 'Supervisor', admin: 'Admin' };
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function renderAdmin(container, ctx) {
  if (ctx.user.role !== 'admin') {
    container.innerHTML = `<div class="empty-state"><div class="big">${icons.settings}</div>
      <h3>Akses terbatas</h3><p>Halaman pengaturan hanya untuk admin.</p></div>`;
    return () => {};
  }

  let tab = 'users';

  container.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div><h2>Pengaturan</h2><p>Kelola pengguna, kategori SLA, dan knowledge base AI.</p></div>
      </div>
      <div class="admin-tabs" id="admin-tabs">
        <button class="active" data-tab="users">Pengguna</button>
        <button data-tab="categories">Kategori &amp; SLA</button>
        <button data-tab="kb">Knowledge Base</button>
      </div>
      <div id="admin-body"></div>
    </div>`;

  const body = container.querySelector('#admin-body');
  const tabs = container.querySelector('#admin-tabs');

  tabs.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (!btn) return;
    tab = btn.dataset.tab;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    load();
  });

  async function load() {
    body.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    try {
      if (tab === 'users') await loadUsers();
      if (tab === 'categories') await loadCategories();
      if (tab === 'kb') await loadKb();
    } catch (err) {
      body.innerHTML = `<div class="empty-state"><h3>Gagal memuat data</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // ------------------------------------------------------------- users
  async function loadUsers() {
    const { users } = await api('/api/users');
    body.innerHTML = `
      <div class="toolbar">
        <span style="font-size:12px;color:#64748b">${users.length} akun terdaftar</span>
        <span class="spacer"></span>
        <button class="btn primary" id="add-user">${icons.plus} Tambah pengguna</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        <table class="table">
          <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Dibuat</th><th></th></tr></thead>
          <tbody>
            ${users.map((u) => `<tr data-user="${esc(u.id)}">
              <td><b>${esc(u.name)}</b></td>
              <td style="color:#64748b">${esc(u.email)}</td>
              <td>
                <select class="select role-select" style="width:auto;padding:4px 7px;font-size:11.5px" ${u.id === ctx.user.id ? 'disabled' : ''}>
                  ${['agent', 'supervisor', 'admin', 'customer'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
                </select>
              </td>
              <td><span class="pill ${u.is_active ? 'on' : 'off'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td style="color:#94a3b8;font-size:11.5px">${esc(formatDateTime(u.created_at))}</td>
              <td style="text-align:right">
                <button class="btn sm toggle-user" ${u.id === ctx.user.id ? 'disabled' : ''}>${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div>`;

    body.querySelector('#add-user').addEventListener('click', addUserModal);
    body.querySelectorAll('tr[data-user]').forEach((row) => {
      const id = row.dataset.user;
      const roleSelect = row.querySelector('.role-select');
      roleSelect.addEventListener('change', async () => {
        try {
          await api(`/api/users/${id}`, { method: 'PATCH', body: { role: roleSelect.value } });
          toast('Role diperbarui', 'success');
        } catch (err) {
          toast(err.message, 'error');
          load();
        }
      });
      row.querySelector('.toggle-user').addEventListener('click', async () => {
        const active = row.querySelector('.pill').classList.contains('on');
        const ok = await confirmDialog(active ? 'Nonaktifkan akun?' : 'Aktifkan akun?',
          active ? 'Akun tidak dapat login sampai diaktifkan kembali.' : 'Akun akan dapat login kembali.');
        if (!ok) return;
        try {
          await api(`/api/users/${id}`, { method: 'PATCH', body: { is_active: !active } });
          toast('Status akun diperbarui', 'success');
          load();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function addUserModal() {
    const { overlay, close } = modal({
      title: 'Tambah pengguna',
      body: `
        <div class="form-grid">
          <div class="field full"><label>Nama lengkap</label><input class="input" id="u-name" maxlength="80"></div>
          <div class="field full"><label>Email</label><input class="input" id="u-email" type="email"></div>
          <div class="field"><label>Role</label><select class="select" id="u-role">
            <option value="agent">Agent</option><option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option><option value="customer">Customer</option>
          </select></div>
          <div class="field"><label>Password</label><input class="input" id="u-password" type="password" placeholder="Min. 8 karakter"></div>
        </div>`,
      footer: '<button class="btn" data-x="cancel">Batal</button><button class="btn primary" data-x="ok">Simpan</button>',
    });
    overlay.querySelector('[data-x="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-x="ok"]').addEventListener('click', async () => {
      const name = overlay.querySelector('#u-name').value.trim();
      const email = overlay.querySelector('#u-email').value.trim();
      const role = overlay.querySelector('#u-role').value;
      const password = overlay.querySelector('#u-password').value;
      if (!name || !email || password.length < 8) {
        toast('Nama, email, dan password (min. 8) wajib diisi', 'error');
        return;
      }
      try {
        await api('/api/users', { method: 'POST', body: { name, email, role, password } });
        close();
        toast('Pengguna ditambahkan', 'success');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ------------------------------------------------------------- categories
  async function loadCategories() {
    const { categories } = await api('/api/categories');
    body.innerHTML = `
      <div class="toolbar">
        <span style="font-size:12px;color:#64748b">SLA dihitung otomatis saat tiket dibuat.</span>
        <span class="spacer"></span>
        <button class="btn primary" id="add-cat">${icons.plus} Tambah kategori</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        <table class="table">
          <thead><tr><th>Kategori</th><th>Prioritas</th><th class="num">Respon (menit)</th><th class="num">Resolusi (menit)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${categories.map((c) => `<tr data-cat="${esc(c.id)}">
              <td><b>${esc(c.name)}</b><div style="font-size:11px;color:#94a3b8">${esc(c.description || '')}</div></td>
              <td style="text-transform:capitalize">${esc(c.default_priority)}</td>
              <td class="num">${c.first_response_min}</td>
              <td class="num">${c.resolution_min}</td>
              <td><span class="pill ${c.is_active ? 'on' : 'off'}">${c.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td style="text-align:right"><button class="btn sm edit-cat">Edit</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div>`;

    body.querySelector('#add-cat').addEventListener('click', () => catModal(null));
    body.querySelectorAll('[data-cat]').forEach((row) => {
      const category = categories.find((c) => c.id === row.dataset.cat);
      row.querySelector('.edit-cat').addEventListener('click', () => catModal(category));
    });
  }

  function catModal(category) {
    const c = category || { name: '', description: '', default_priority: 'medium', first_response_min: 30, resolution_min: 1440, is_active: 1 };
    const { overlay, close } = modal({
      title: category ? 'Edit kategori' : 'Tambah kategori',
      body: `
        <div class="form-grid">
          <div class="field full"><label>Nama kategori</label><input class="input" id="c-name" maxlength="80" value="${esc(c.name)}"></div>
          <div class="field full"><label>Deskripsi</label><input class="input" id="c-desc" maxlength="300" value="${esc(c.description || '')}"></div>
          <div class="field"><label>Prioritas default</label><select class="select" id="c-priority">
            ${PRIORITIES.map((p) => `<option value="${p}" ${c.default_priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select></div>
          <div class="field"><label>Status</label><select class="select" id="c-active">
            <option value="1" ${c.is_active ? 'selected' : ''}>Aktif</option>
            <option value="0" ${!c.is_active ? 'selected' : ''}>Nonaktif</option>
          </select></div>
          <div class="field"><label>Respon pertama (menit)</label><input class="input" id="c-first" type="number" min="1" value="${c.first_response_min}"></div>
          <div class="field"><label>Resolusi (menit)</label><input class="input" id="c-resolve" type="number" min="1" value="${c.resolution_min}"></div>
        </div>`,
      footer: '<button class="btn" data-x="cancel">Batal</button><button class="btn primary" data-x="ok">Simpan</button>',
    });
    overlay.querySelector('[data-x="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-x="ok"]').addEventListener('click', async () => {
      const payload = {
        name: overlay.querySelector('#c-name').value.trim(),
        description: overlay.querySelector('#c-desc').value.trim(),
        default_priority: overlay.querySelector('#c-priority').value,
        is_active: Number(overlay.querySelector('#c-active').value),
        first_response_min: Number(overlay.querySelector('#c-first').value),
        resolution_min: Number(overlay.querySelector('#c-resolve').value),
      };
      if (!payload.name) { toast('Nama kategori wajib', 'error'); return; }
      try {
        if (category) await api(`/api/categories/${category.id}`, { method: 'PATCH', body: payload });
        else await api('/api/categories', { method: 'POST', body: payload });
        close();
        toast('Kategori disimpan', 'success');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ------------------------------------------------------------- knowledge base
  async function loadKb() {
    const { articles } = await api('/api/kb');
    body.innerHTML = `
      <div class="toolbar">
        <span style="font-size:12px;color:#64748b">Artikel digunakan AI sebagai sumber jawaban otomatis.</span>
        <span class="spacer"></span>
        <button class="btn primary" id="add-kb">${icons.plus} Tambah artikel</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        <table class="table">
          <thead><tr><th>Judul</th><th>Tags</th><th>Diperbarui</th><th></th></tr></thead>
          <tbody>
            ${articles.length ? articles.map((a) => `<tr data-kb="${esc(a.id)}">
              <td><b>${esc(a.title)}</b><div style="font-size:11.5px;color:#64748b;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.body)}</div></td>
              <td style="font-size:11.5px;color:#94a3b8">${esc(a.tags || '-')}</td>
              <td style="font-size:11.5px;color:#94a3b8">${esc(formatDateTime(a.updated_at))}</td>
              <td style="text-align:right"><button class="btn sm edit-kb">Edit</button></td>
            </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Belum ada artikel.</td></tr>'}
          </tbody>
        </table>
      </div></div>`;

    body.querySelector('#add-kb').addEventListener('click', () => kbModal(null));
    body.querySelectorAll('[data-kb]').forEach((row) => {
      const article = articles.find((a) => a.id === row.dataset.kb);
      row.querySelector('.edit-kb').addEventListener('click', () => kbModal(article));
    });
  }

  function kbModal(article) {
    const a = article || { title: '', body: '', tags: '' };
    const { overlay, close } = modal({
      title: article ? 'Edit artikel' : 'Tambah artikel',
      width: 560,
      body: `
        <div class="field"><label>Judul</label><input class="input" id="k-title" maxlength="160" value="${esc(a.title)}"></div>
        <div class="field"><label>Tags (pisahkan koma)</label><input class="input" id="k-tags" maxlength="200" value="${esc(a.tags || '')}"></div>
        <div class="field"><label>Isi artikel</label><textarea class="textarea" id="k-body" rows="8" maxlength="4000">${esc(a.body)}</textarea></div>`,
      footer: '<button class="btn" data-x="cancel">Batal</button><button class="btn primary" data-x="ok">Simpan</button>',
    });
    overlay.querySelector('[data-x="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-x="ok"]').addEventListener('click', async () => {
      const payload = {
        title: overlay.querySelector('#k-title').value.trim(),
        tags: overlay.querySelector('#k-tags').value.trim(),
        body: overlay.querySelector('#k-body').value.trim(),
      };
      if (!payload.title || !payload.body) { toast('Judul dan isi wajib diisi', 'error'); return; }
      try {
        if (article) await api(`/api/kb/${article.id}`, { method: 'PATCH', body: payload });
        else await api('/api/kb', { method: 'POST', body: payload });
        close();
        toast('Artikel disimpan', 'success');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  load();
  return () => {};
}
