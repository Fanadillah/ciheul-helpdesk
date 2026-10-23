'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../utils/errors');
const { requireFields, email } = require('../utils/validate');
const { signToken, requireAuth } = require('../middleware/auth');

module.exports = function authRoutes(db) {
  const router = express.Router();

  router.post('/login', asyncHandler(async (req, res) => {
    requireFields(req.body, ['email', 'password']);
    const mail = email(req.body.email);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(mail);
    const valid = user && user.password_hash
      && bcrypt.compareSync(String(req.body.password), user.password_hash);
    if (!valid || !user.is_active) {
      return res.status(401).json({ error: { message: 'Email atau password salah' } });
    }
    const { password_hash: _ignored, ...safe } = user;
    return res.json({ token: signToken(user), user: safe });
  }));

  router.get('/me', requireAuth(db), (req, res) => res.json({ user: req.user }));

  return router;
};
