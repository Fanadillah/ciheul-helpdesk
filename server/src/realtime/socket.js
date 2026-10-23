'use strict';

const { socketAuth } = require('../middleware/auth');
const { isStaff, assertTicketAccess } = require('../services/access');
const messages = require('../services/messages');
const tickets = require('../services/tickets');
const { emitTicket, notifyUser } = require('../realtime/events');

// A user may have several tabs/devices open. Count connections so a single
// closed tab does not mark the agent offline.
const presence = new Map();

function presenceEntry(user) {
  return { user_id: user.id, name: user.name, role: user.role };
}

function onlineUsers() {
  return [...presence.values()].map((entry) => presenceEntry(entry));
}

module.exports = function attachRealtime(io, db) {
  io.use(socketAuth(db));

  io.on('connection', (socket) => {
    const user = socket.user;
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    if (isStaff(user)) socket.join('staff');

    if (isStaff(user)) {
      const current = presence.get(user.id);
      const count = (current ? current.count : 0) + 1;
      presence.set(user.id, { ...presenceEntry(user), count });
      if (count === 1) io.to('staff').emit('presence:update', { ...presenceEntry(user), status: 'online' });
    }

    const supervisorIds = () => db.prepare("SELECT id FROM users WHERE role = 'supervisor' AND is_active = 1")
      .all().map((row) => row.id);

    socket.on('ticket:join', (payload = {}, ack) => {
      try {
        const ticket = assertTicketAccess(db, user, payload.ticket_id);
        if (socket.data.ticketId && socket.data.ticketId !== ticket.id) {
          socket.leave(`ticket:${socket.data.ticketId}`);
          socket.leave(`ticket:${socket.data.ticketId}:staff`);
        }
        const room = `ticket:${ticket.id}`;
        socket.join(room);
        if (isStaff(user)) socket.join(`${room}:staff`);
        socket.data.ticketId = ticket.id;
        const list = messages.listMessages(db, ticket.id, {
          afterSeq: Number(payload.last_seq) || 0,
          includeInternal: isStaff(user),
        });
        ack?.({ ok: true, ticket: tickets.decorate(tickets.getTicketRow(db, ticket.id)), messages: list });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('ticket:leave', (payload = {}) => {
      socket.leave(`ticket:${payload.ticket_id}`);
      socket.leave(`ticket:${payload.ticket_id}:staff`);
      if (socket.data.ticketId === payload.ticket_id) socket.data.ticketId = null;
    });

    socket.on('message:send', (payload = {}, ack) => {
      try {
        const ticket = assertTicketAccess(db, user, payload.ticket_id);
        const { message, duplicate } = messages.appendMessage(db, {
          ticketId: ticket.id,
          sender: user,
          body: payload.body,
          clientMessageId: payload.client_message_id || null,
          isInternal: Boolean(payload.is_internal),
          attachmentIds: payload.attachment_ids || [],
        });

        if (!duplicate) {
          const room = message.is_internal ? `ticket:${ticket.id}:staff` : `ticket:${ticket.id}`;
          io.to(room).emit('message:new', message);
          emitTicket(io, tickets.decorate(tickets.getTicketRow(db, ticket.id)));

          if (!message.is_internal && message.sender_type === 'customer') {
            if (ticket.assignee_id) {
              notifyUser(io, db, ticket.assignee_id, 'message',
                `Pesan baru dari ${user.name}`, { ticket_id: ticket.id });
            } else {
              for (const supervisorId of supervisorIds()) {
                notifyUser(io, db, supervisorId, 'ticket_unassigned',
                  `Tiket belum ditangani: ${ticket.subject}`, { ticket_id: ticket.id });
              }
            }
          } else if (!message.is_internal) {
            notifyUser(io, db, ticket.customer_id, 'message',
              `Balasan baru pada tiket ${ticket.code}`, { ticket_id: ticket.id });
          }
        }

        ack?.({
          ok: true,
          duplicate,
          client_message_id: payload.client_message_id || null,
          message_id: message.id,
          seq: message.seq,
          created_at: message.created_at,
        });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('typing', (payload = {}) => {
      try {
        const ticket = assertTicketAccess(db, user, payload.ticket_id);
        socket.to(`ticket:${ticket.id}`).emit('typing', {
          ticket_id: ticket.id,
          user_id: user.id,
          name: user.name,
          is_typing: Boolean(payload.is_typing),
        });
      } catch {
        /* ignore unauthorized typing events */
      }
    });

    socket.on('message:read', (payload = {}) => {
      try {
        const ticket = assertTicketAccess(db, user, payload.ticket_id);
        const messageId = messages.markRead(db, ticket.id, user.id, payload.message_id);
        socket.to(`ticket:${ticket.id}`).emit('message:read', {
          ticket_id: ticket.id, message_id: messageId, user_id: user.id,
        });
      } catch {
        /* ignore malformed read receipts */
      }
    });

    socket.on('presence:list', (ack) => {
      if (isStaff(user)) ack?.({ ok: true, users: onlineUsers() });
    });

    socket.on('disconnect', () => {
      if (!isStaff(user)) return;
      const current = presence.get(user.id);
      if (!current) return;
      if (current.count > 1) {
        presence.set(user.id, { ...current, count: current.count - 1 });
        return;
      }
      presence.delete(user.id);
      io.to('staff').emit('presence:update', { ...presenceEntry(user), status: 'offline' });
    });
  });
};
