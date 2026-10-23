import { api, session } from '../api.js';
import { esc } from '../ui.js';

const DEMO = [
  { label: 'Agent', email: 'agent@helpdesk.test', password: 'Agent123!' },
  { label: 'Supervisor', email: 'supervisor@helpdesk.test', password: 'Super123!' },
  { label: 'Admin', email: 'admin@helpdesk.test', password: 'Admin123!' },
  { label: 'Customer', email: 'customer@helpdesk.test', password: 'Cust123!' },
];

export function renderLogin(root, onSuccess) {
  root.innerHTML = `
    <div class="login-wrap">
      <section class="login-hero">
        <div class="brand-lg"><div class="logo-mark">C</div>Ciheul Helpdesk</div>
        <div>
          <h1>Satu ruang kerja untuk <em>setiap percakapan</em> pelanggan.</h1>
          <p>Kelola tiket, balas live chat, dan pantau SLA dari satu dashboard. Terhubung real-time
             dengan widget website dan aplikasi mobile.</p>
          <div class="login-points">
            <div class="login-point"><i>&#10003;</i><span>Live chat realtime dengan antrean offline</span></div>
            <div class="login-point"><i>&#10003;</i><span>SLA monitoring dan eskalasi otomatis</span></div>
            <div class="login-point"><i>&#10003;</i><span>AI auto-reply dengan knowledge base</span></div>
            <div class="login-point"><i>&#10003;</i><span>CSAT, laporan agent, dan audit trail</span></div>
          </div>
        </div>
        <div style="font-size:11.5px;color:#7c8aa3">Ciheul Technologies &middot; Technical Test 2026</div>
      </section>
      <section class="login-side">
        <form class="login-card" id="login-form" novalidate>
          <h2>Masuk ke dashboard</h2>
          <p class="sub">Gunakan akun helpdesk Anda untuk melanjutkan.</p>
          <div id="login-error" class="login-error hidden"></div>
          <div class="field">
            <label for="email">Email</label>
            <input class="input" id="email" type="email" autocomplete="username" placeholder="nama@perusahaan.com" required>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" id="password" type="password" autocomplete="current-password" placeholder="Masukkan password" required>
          </div>
          <button class="btn primary block" id="login-submit" type="submit">Masuk</button>
          <div class="demo-accounts">
            <p>Akun demo (klik untuk isi otomatis)</p>
            <div class="account-chips">
              ${DEMO.map((a) => `<button type="button" class="account-chip" data-email="${esc(a.email)}" data-password="${esc(a.password)}">${esc(a.label)}</button>`).join('')}
            </div>
          </div>
        </form>
      </section>
    </div>`;

  const form = root.querySelector('#login-form');
  const email = root.querySelector('#email');
  const password = root.querySelector('#password');
  const submit = root.querySelector('#login-submit');
  const errorBox = root.querySelector('#login-error');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  root.querySelectorAll('.account-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      email.value = chip.dataset.email;
      password.value = chip.dataset.password;
      errorBox.classList.add('hidden');
      password.focus();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    if (!email.value.trim() || !password.value) {
      showError('Email dan password wajib diisi.');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Memeriksa...';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email: email.value.trim(), password: password.value },
      });
      session.set(data.token, data.user);
      onSuccess(data.user);
    } catch (err) {
      showError(err.message);
      submit.disabled = false;
      submit.textContent = 'Masuk';
    }
  });

  setTimeout(() => email.focus(), 60);
}
