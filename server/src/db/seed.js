'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');
const { openDb } = require('./index');
const { uuid, now, ticketCode } = require('../utils/ids');

const PASSWORD = (p) => bcrypt.hashSync(p, 10);

function seed(db) {
  const ts = now();
  const ids = {
    admin: uuid(), supervisor: uuid(), agent1: uuid(), agent2: uuid(), customer: uuid(),
  };
  const cat = { tech: uuid(), billing: uuid(), feature: uuid() };

  const run = db.transaction(() => {
    for (const table of ['message_receipts', 'ai_logs', 'attachments', 'ticket_events',
      'ticket_messages', 'notifications', 'devices', 'tickets', 'categories',
      'canned_responses', 'kb_articles', 'users']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    const insertUser = db.prepare(`INSERT INTO users
      (id, name, email, password_hash, role, is_guest, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 1, ?)`);
    insertUser.run(ids.admin, 'Admin Helpdesk', 'admin@helpdesk.test', PASSWORD('Admin123!'), 'admin', ts);
    insertUser.run(ids.supervisor, 'Sari Supervisor', 'supervisor@helpdesk.test', PASSWORD('Super123!'), 'supervisor', ts);
    insertUser.run(ids.agent1, 'Rina Agent', 'agent@helpdesk.test', PASSWORD('Agent123!'), 'agent', ts);
    insertUser.run(ids.agent2, 'Budi Agent', 'agent2@helpdesk.test', PASSWORD('Agent123!'), 'agent', ts);
    insertUser.run(ids.customer, 'Andi Customer', 'customer@helpdesk.test', PASSWORD('Cust123!'), 'customer', ts);

    const insertCategory = db.prepare(`INSERT INTO categories
      (id, name, description, default_priority, first_response_min, resolution_min, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)`);
    insertCategory.run(cat.tech, 'Technical Issue', 'Kendala teknis aplikasi, login, atau performa', 'high', 15, 480, ts);
    insertCategory.run(cat.billing, 'Billing & Payment', 'Pertanyaan invoice, pembayaran, dan tagihan', 'medium', 30, 1440, ts);
    insertCategory.run(cat.feature, 'Feature Request', 'Permintaan fitur baru atau perubahan alur', 'low', 120, 4320, ts);

    db.prepare(`INSERT INTO canned_responses (id, title, body, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(uuid(), 'Salam pembuka',
      'Halo, terima kasih sudah menghubungi kami. Saya akan membantu kendala Anda.', ids.agent1, ts);
    db.prepare(`INSERT INTO canned_responses (id, title, body, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(uuid(), 'Minta detail',
      'Boleh dibantu informasi tambahan: perangkat, versi aplikasi, dan langkah yang sudah dicoba?', ids.agent1, ts);
    db.prepare(`INSERT INTO canned_responses (id, title, body, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(uuid(), 'Penutup',
      'Kendala sudah kami tutup. Jika masih terjadi, silakan balas tiket ini untuk membukanya kembali.', ids.agent1, ts);

    const kb = [
      ['Cara reset password', 'Buka halaman login, pilih "Lupa password", masukkan email terdaftar, lalu ikuti tautan reset yang dikirim ke email.', 'password,login,reset'],
      ['Status pengiriman invoice', 'Invoice dikirim ke email billing setiap tanggal 1. Jika belum diterima, periksa folder spam atau hubungi tim billing.', 'invoice,billing,pembayaran'],
      ['Aplikasi mobile tidak sinkron', 'Pastikan koneksi internet stabil. Pesan yang tertunda akan dikirim otomatis setelah koneksi pulih tanpa duplikasi.', 'mobile,offline,sinkron'],
      ['Jam operasional support', 'Tim support aktif Senin-Jumat 08.00-20.00 WIB. Tiket di luar jam kerja tetap tercatat dan dijawab pada hari kerja berikutnya.', 'sla,jam,operasional'],
    ];
    const insertKb = db.prepare(`INSERT INTO kb_articles
      (id, title, body, tags, is_published, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`);
    for (const [title, body, tags] of kb) insertKb.run(uuid(), title, body, tags, ts, ts);

    const insertTicket = db.prepare(`INSERT INTO tickets
      (id, code, subject, description, category_id, priority, status, channel, customer_id,
       assignee_id, sla_first_due_at, sla_resolution_due_at, first_response_at, resolved_at,
       csat_rating, csat_comment, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMessage = db.prepare(`INSERT INTO ticket_messages
      (id, ticket_id, sender_id, sender_type, body, is_internal, client_message_id, seq, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`);

    const minutes = (n) => new Date(Date.now() + n * 60000).toISOString();

    // 1) in progress ticket handled by Rina
    const t1 = uuid();
    insertTicket.run(t1, ticketCode(), 'Tidak bisa login ke aplikasi',
      'Sejak pagi saya tidak bisa login. Muncul pesan "invalid credentials" padahal password benar.',
      cat.tech, 'high', 'in_progress', 'widget', ids.customer, ids.agent1,
      minutes(-10), minutes(400), minutes(-40), null, null, null, minutes(-60), minutes(-5));
    insertMessage.run(uuid(), t1, ids.customer, 'customer',
      'Halo, saya tidak bisa login sejak pagi. Muncul pesan invalid credentials.', 'seed-1', 1, minutes(-60));
    insertMessage.run(uuid(), t1, ids.agent1, 'agent',
      'Halo Andi, terima kasih sudah menghubungi kami. Saya bantu cek ya.', 'seed-2', 2, minutes(-40));
    insertMessage.run(uuid(), t1, ids.agent1, 'agent',
      'Boleh dicoba reset password lewat menu "Lupa password"? Kabari hasilnya.', 'seed-3', 3, minutes(-5));

    // 2) assigned ticket handled by Budi
    const t2 = uuid();
    insertTicket.run(t2, ticketCode(), 'Invoice September belum diterima',
      'Invoice untuk periode September belum masuk ke email billing kami.',
      cat.billing, 'medium', 'assigned', 'mobile', ids.customer, ids.agent2,
      minutes(20), minutes(1400), null, null, null, null, minutes(-20), minutes(-20));
    insertMessage.run(uuid(), t2, ids.customer, 'customer',
      'Selamat pagi, invoice September belum kami terima. Mohon dibantu.', 'seed-4', 1, minutes(-20));

    // 3) new ticket in the queue
    const t3 = uuid();
    insertTicket.run(t3, ticketCode(), 'Permintaan fitur export laporan',
      'Kami butuh export laporan tiket ke CSV untuk kebutuhan audit internal.',
      cat.feature, 'low', 'new', 'web', ids.customer, null,
      minutes(115), minutes(4300), null, null, null, null, minutes(-5), minutes(-5));
    insertMessage.run(uuid(), t3, ids.customer, 'customer',
      'Bisa tambahkan fitur export laporan ke CSV? Terima kasih.', 'seed-5', 1, minutes(-5));

    // 4) resolved ticket with CSAT
    const t4 = uuid();
    insertTicket.run(t4, ticketCode(), 'Aplikasi mobile tidak sinkron',
      'Pesan di mobile tidak muncul di web setelah koneksi putus.',
      cat.tech, 'high', 'resolved', 'mobile', ids.customer, ids.agent1,
      minutes(-300), minutes(-60), minutes(-320), minutes(-120), 5,
      'Respon cepat dan masalah terselesaikan.', minutes(-360), minutes(-120));
    insertMessage.run(uuid(), t4, ids.customer, 'customer',
      'Pesan saya tidak muncul di dashboard agent setelah internet mati sebentar.', 'seed-6', 1, minutes(-360));
    insertMessage.run(uuid(), t4, ids.agent1, 'agent',
      'Sudah kami perbaiki. Pesan yang tertunda sekarang terkirim otomatis tanpa duplikat.', 'seed-7', 2, minutes(-180));

    db.prepare(`INSERT INTO ticket_events (id, ticket_id, actor_id, type, from_value, to_value, created_at)
      VALUES (?, ?, ?, 'status_changed', 'new', 'in_progress', ?)`)
      .run(uuid(), t1, ids.agent1, minutes(-50));
    db.prepare(`INSERT INTO ticket_events (id, ticket_id, actor_id, type, from_value, to_value, created_at)
      VALUES (?, ?, ?, 'status_changed', 'in_progress', 'resolved', ?)`)
      .run(uuid(), t4, ids.agent1, minutes(-120));
  });

  run();
}

if (require.main === module) {
  const db = openDb(config.dbPath);
  seed(db);
  db.close();
  console.log('[seed] demo data ready');
  console.log('  admin@helpdesk.test / Admin123!');
  console.log('  supervisor@helpdesk.test / Super123!');
  console.log('  agent@helpdesk.test / Agent123!');
  console.log('  agent2@helpdesk.test / Agent123!');
  console.log('  customer@helpdesk.test / Cust123!');
}

module.exports = { seed };
