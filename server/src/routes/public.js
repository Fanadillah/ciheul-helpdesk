'use strict';

const express = require('express');
const { asyncHandler, conflict } = require('../utils/errors');
const { email, requireFields, text } = require('../utils/validate');
const { uuid, now } = require('../utils/ids');
const { signToken } = require('../middleware/auth');

/** Guest session for the embedded chat widget (name + email, no password). */
module.exports = function publicRoutes(db) {
  const router = express.Router();

  router.get('/categories', (req, res) => {
    const rows = db.prepare(`SELECT id, name, default_priority, first_response_min, resolution_min
      FROM categories WHERE is_active = 1 ORDER BY name`).all();
    res.json({ categories: rows });
  });

  router.post('/session', asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'email']);
    const mail = email(req.body.email);
    const name = text(req.body.name, 80);

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(mail);
    if (user && !user.is_guest) {
      throw conflict('Email sudah terdaftar. Silakan login untuk melanjutkan.');
    }
    if (!user) {
      const id = uuid();
      db.prepare(`INSERT INTO users (id, name, email, password_hash, role, is_guest, is_active, created_at)
        VALUES (?, ?, ?, NULL, 'customer', 1, 1, ?)`).run(id, name, mail, now());
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }
    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }));

  return router;
};
