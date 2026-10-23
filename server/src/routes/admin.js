'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { badRequest, conflict, notFound } = require('../utils/errors');
const {
  requireFields, email, oneOf, positiveInt, text, bool, ROLES, PRIORITIES,
} = require('../utils/validate');
const { uuid, now } = require('../utils/ids');
const { requireRole } = require('../middleware/auth');

const STAFF_ROLES = ['agent', 'supervisor', 'admin'];

module.exports = function adminRoutes(db) {
  const router = express.Router();

  router.get('/users', requireRole(...STAFF_ROLES), (req, res) => {
    const rows = db.prepare(`SELECT id, name, email, role, is_active, is_guest, created_at
      FROM users WHERE is_guest = 0 ORDER BY role, name`).all();
    res.json({ users: rows });
  });

  router.post('/users', requireRole('admin'), (req, res) => {
    requireFields(req.body, ['name', 'email', 'role', 'password']);
    const mail = email(req.body.email);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail)) {
      throw conflict('Email sudah digunakan');
    }
    if (String(req.body.password).length < 8) throw badRequest('Password minimal 8 karakter');
    const role = oneOf(req.body.role, ROLES, 'role');
    const id = uuid();
    db.prepare(`INSERT INTO users (id, name, email, password_hash, role, is_guest, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 1, ?)`)
      .run(id, text(req.body.name, 80), mail, bcrypt.hashSync(String(req.body.password), 10), role, now());
    const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?').get(id);
    res.status(201).json({ user });
  });

  router.patch('/users/:id', requireRole('admin'), (req, res) => {
    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
    if (!target) throw notFound('Pengguna tidak ditemukan');

    if (target.id === req.user.id && req.body.is_active !== undefined && !bool(req.body.is_active, 'is_active')) {
      throw badRequest('Tidak dapat menonaktifkan akun sendiri');
    }
    if (target.id === req.user.id && req.body.role !== undefined && req.body.role !== req.user.role) {
      throw badRequest('Tidak dapat mengubah role sendiri');
    }

    const fields = [];
    const params = [];
    if (req.body.name !== undefined) { fields.push('name = ?'); params.push(text(req.body.name, 80)); }
    if (req.body.role !== undefined) { fields.push('role = ?'); params.push(oneOf(req.body.role, ROLES, 'role')); }
    if (req.body.is_active !== undefined) { fields.push('is_active = ?'); params.push(bool(req.body.is_active, 'is_active') ? 1 : 0); }
    if (req.body.password !== undefined) {
      if (String(req.body.password).length < 8) throw badRequest('Password minimal 8 karakter');
      fields.push('password_hash = ?');
      params.push(bcrypt.hashSync(String(req.body.password), 10));
    }
    if (!fields.length) throw badRequest('Tidak ada perubahan');
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params, req.params.id);
    const user = db.prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ?')
      .get(req.params.id);
    res.json({ user });
  });

  router.get('/categories', requireRole(...STAFF_ROLES), (req, res) => {
    res.json({
      categories: db.prepare('SELECT * FROM categories ORDER BY name').all(),
    });
  });

  router.post('/categories', requireRole('admin'), (req, res) => {
    requireFields(req.body, ['name']);
    const id = uuid();
    db.prepare(`INSERT INTO categories
      (id, name, description, default_priority, first_response_min, resolution_min, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
      .run(id, text(req.body.name, 80), text(req.body.description || '', 300),
        oneOf(req.body.default_priority || 'medium', PRIORITIES, 'default_priority'),
        positiveInt(req.body.first_response_min ?? 30, 'first_response_min'),
        positiveInt(req.body.resolution_min ?? 1440, 'resolution_min'), now());
    res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
  });

  router.patch('/categories/:id', requireRole('admin'), (req, res) => {
    const target = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id);
    if (!target) throw notFound('Kategori tidak ditemukan');

    const fields = [];
    const params = [];
    for (const key of ['name', 'description']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(text(req.body[key], key === 'name' ? 80 : 300));
      }
    }
    for (const key of ['first_response_min', 'resolution_min']) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(positiveInt(req.body[key], key));
      }
    }
    if (req.body.is_active !== undefined) {
      fields.push('is_active = ?');
      params.push(bool(req.body.is_active, 'is_active') ? 1 : 0);
    }
    if (req.body.default_priority !== undefined) {
      fields.push('default_priority = ?');
      params.push(oneOf(req.body.default_priority, PRIORITIES, 'default_priority'));
    }
    if (!fields.length) throw badRequest('Tidak ada perubahan');
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...params, req.params.id);
    res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) });
  });

  router.get('/canned-responses', requireRole(...STAFF_ROLES), (req, res) => {
    res.json({ canned_responses: db.prepare('SELECT * FROM canned_responses ORDER BY title').all() });
  });

  router.post('/canned-responses', requireRole(...STAFF_ROLES), (req, res) => {
    requireFields(req.body, ['title', 'body']);
    const id = uuid();
    db.prepare(`INSERT INTO canned_responses (id, title, body, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(id, text(req.body.title, 100), text(req.body.body, 2000), req.user.id, now());
    res.status(201).json({ canned_response: db.prepare('SELECT * FROM canned_responses WHERE id = ?').get(id) });
  });

  router.get('/kb', (req, res) => {
    res.json({ articles: db.prepare('SELECT * FROM kb_articles WHERE is_published = 1 ORDER BY title').all() });
  });

  router.post('/kb', requireRole('admin'), (req, res) => {
    requireFields(req.body, ['title', 'body']);
    const id = uuid();
    const ts = now();
    db.prepare(`INSERT INTO kb_articles (id, title, body, tags, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .run(id, text(req.body.title, 160), text(req.body.body, 4000), text(req.body.tags || '', 200), ts, ts);
    res.status(201).json({ article: db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id) });
  });

  router.patch('/kb/:id', requireRole('admin'), (req, res) => {
    const target = db.prepare('SELECT id FROM kb_articles WHERE id = ?').get(req.params.id);
    if (!target) throw notFound('Artikel tidak ditemukan');

    const fields = [];
    const params = [];
    for (const key of ['title', 'body', 'tags']) {
      if (req.body[key] === undefined) continue;
      const max = key === 'body' ? 4000 : key === 'title' ? 160 : 200;
      fields.push(`${key} = ?`);
      params.push(text(req.body[key], max));
    }
    if (req.body.is_published !== undefined) {
      fields.push('is_published = ?');
      params.push(bool(req.body.is_published, 'is_published') ? 1 : 0);
    }
    if (!fields.length) throw badRequest('Tidak ada perubahan');
    fields.push('updated_at = ?');
    params.push(now());
    db.prepare(`UPDATE kb_articles SET ${fields.join(', ')} WHERE id = ?`).run(...params, req.params.id);
    res.json({ article: db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(req.params.id) });
  });

  return router;
};
