'use strict';

const { socketAuth } = require('../middleware/auth');
const { isStaff, assertTicketAccess } = require('../services/access');
const messages = require('../services/messages');
const tickets = require('../services/tickets');
const { createNotification } = require('../services/notifications');

const presence = new Map();

module.exports = function attachRealtime(io, db) {
  io.use(socketAuth(db));

  io.on('connection', (socket) => {
    const user = socket.user;
    socket.join(`user:${user.id}`);
    socket.join(`role:${user.role}`);
    if (isStaff(user)) socket.join('staff');

    if (isStaff(user)) {
      presence.set(user.id, { user_id: user.id, name: user.name, role: user.role });
      io.to('staff').emit('presence:update', { ...presence.get(user.id), status: 'online' });
    }

    const notifyUser = (userId, type, title, payload) => {
      if (!userId) return;
      const row = createNotification(db, { userId, type, title, payload });
      io.to(`user:${userId}`).emit('notification:new', row);
    };

    const supervisorIds = () => db.prepare("SELECT id FROM users WHERE role = 'supervisor' AND is_active = 1")
      .all().map((r) => r.id);

    socket.on('ticket:join', (payload = {}, ack) => {
      try {
        const ticket = assertTicketAccess(db, user, payload.ticket_id);
        const room = `ticket:${ticket.id}`;
        socket.join(room);
        if (isStaff(user)) socket.join(`${room}:staff`);
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
          const fresh = tickets.decorate(tickets.getTicketRow(db, ticket.id));
          io.to(`ticket:${ticket.id}`).emit('ticket:update', fresh);
          io.to('staff').except(`ticket:${ticket.id}`).emit('ticket:update', fresh);

          if (!message.is_internal && message.sender_type === 'customer') {
            if (ticket.assignee_id) {
              notifyUser(ticket.assignee_id, 'message',
                `Pesan baru dari ${user.name}`, { ticket_id: ticket.id });
            } else {
              for (const sid of supervisorIds()) {
                notifyUser(sid, 'ticket_unassigned',
                  `Tiket belum ditangani: ${ticket.subject}`, { ticket_id: ticket.id });
              }
            }
          } else if (!message.is_internal) {
            notifyUser(ticket.customer_id, 'message',
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
        const room = `ticket:${ticket.id}`;
        socket.to(room).emit('typing', {
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
        /* ignore */
      }
    });

    socket.on('presence:list', (ack) => {
      if (isStaff(user)) ack?.({ ok: true, users: [...presence.values()] });
    });

    socket.on('disconnect', () => {
      if (!isStaff(user)) return;
      presence.delete(user.id);
      io.to('staff').emit('presence:update', { user_id: user.id, status: 'offline' });
    });
  });
};
