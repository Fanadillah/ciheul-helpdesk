'use strict';

const { uuid, now } = require('../utils/ids');

function createNotification(db, { userId, type, title, payload = null }) {
  const row = {
    id: uuid(),
    user_id: userId,
    type,
    title,
    payload: payload ? JSON.stringify(payload) : null,
    read_at: null,
    created_at: now(),
  };
  db.prepare(`INSERT INTO notifications (id, user_id, type, title, payload, read_at, created_at)
    VALUES (@id, @user_id, @type, @title, @payload, @read_at, @created_at)`).run(row);
  return { ...row, payload };
}

function listNotifications(db, userId, limit = 30) {
  return db.prepare(`SELECT * FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ?`).all(userId, Number(limit) || 30)
    .map((n) => ({ ...n, payload: n.payload ? JSON.parse(n.payload) : null }));
}

function markRead(db, userId, id) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?')
    .run(now(), id, userId);
}

module.exports = { createNotification, listNotifications, markRead };
