'use strict';

const { forbidden, notFound } = require('../utils/errors');

const STAFF = ['agent', 'supervisor', 'admin'];

function isStaff(user) {
  return STAFF.includes(user.role);
}

/** Load a ticket and assert that `user` may access it. */
function assertTicketAccess(db, user, ticketId) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) throw notFound('Tiket tidak ditemukan');
  if (!isStaff(user) && ticket.customer_id !== user.id) {
    throw forbidden('Tiket ini bukan milik Anda');
  }
  return ticket;
}

module.exports = { isStaff, assertTicketAccess, STAFF };
