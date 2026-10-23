'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../utils/errors');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name },
    config.jwtSecret, { expiresIn: config.tokenTtl });
}

function decode(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function loadUser(db, id) {
  const user = db.prepare(`SELECT id, name, email, role, is_guest, is_active
    FROM users WHERE id = ?`).get(id);
  return user && user.is_active ? user : null;
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(db) {
  return (req, res, next) => {
    const token = bearer(req);
    const payload = token && decode(token);
    if (!payload) return next(unauthorized('Token tidak valid atau sudah kedaluwarsa'));
    const user = loadUser(db, payload.sub);
    if (!user) return next(unauthorized('Akun tidak aktif'));
    req.user = user;
    return next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

function socketAuth(db) {
  return (socket, next) => {
    const token = socket.handshake.auth?.token
      || (socket.handshake.headers.authorization || '').replace(/^Bearer /, '');
    const payload = token && decode(token);
    if (!payload) return next(new Error('unauthorized'));
    const user = loadUser(db, payload.sub);
    if (!user) return next(new Error('unauthorized'));
    socket.user = user;
    return next();
  };
}

module.exports = { signToken, decode, requireAuth, requireRole, socketAuth, loadUser };
