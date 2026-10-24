'use strict';

const { createNotification } = require('../services/notifications');

/**
 * Kirim snapshot tiket ke room tiket dan staff lain.
 * Staff yang sudah ada di room tidak menerima event kedua.
 */
function emitTicket(io, ticket) {
  io.to(`ticket:${ticket.id}`).emit('ticket:update', ticket);
  io.to('staff').except(`ticket:${ticket.id}`).emit('ticket:update', ticket);
}

/**
 * Simpan notifikasi lalu kirim ke room user.
 */
function notifyUser(io, db, userId, type, title, payload) {
  if (!userId) return null;
  const row = createNotification(db, { userId, type, title, payload });
  io.to(`user:${userId}`).emit('notification:new', row);
  return row;
}

module.exports = { emitTicket, notifyUser };
