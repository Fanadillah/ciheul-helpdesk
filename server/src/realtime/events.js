'use strict';

const { createNotification } = require('../services/notifications');

/**
 * Broadcast a ticket snapshot to everyone currently viewing it, plus staff
 * members who are not in the ticket room (inbox, reports, dashboard).
 */
function emitTicket(io, ticket) {
  io.to(`ticket:${ticket.id}`).emit('ticket:update', ticket);
  io.to('staff').except(`ticket:${ticket.id}`).emit('ticket:update', ticket);
}

/**
 * Persist an in-app notification and deliver it to the user's room.
 * Returning the row keeps callers free of notification formatting details.
 */
function notifyUser(io, db, userId, type, title, payload) {
  if (!userId) return null;
  const row = createNotification(db, { userId, type, title, payload });
  io.to(`user:${userId}`).emit('notification:new', row);
  return row;
}

module.exports = { emitTicket, notifyUser };
