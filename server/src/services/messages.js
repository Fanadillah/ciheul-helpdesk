'use strict';

const { badRequest, notFound } = require('../utils/errors');
const { uuid, now } = require('../utils/ids');
const { logEvent } = require('./tickets');

const STAFF = ['agent', 'supervisor', 'admin'];

function hydrate(db, message) {
  if (!message) return null;
  const sender = message.sender_id
    ? db.prepare('SELECT name, role FROM users WHERE id = ?').get(message.sender_id)
    : null;
  const attachments = db.prepare(`SELECT id, original_name, mime, size FROM attachments
    WHERE message_id = ?`).all(message.id);
  return {
    ...message,
    is_internal: Boolean(message.is_internal),
    sender_name: sender ? sender.name : message.sender_type === 'ai' ? 'Helpdesk AI' : 'System',
    attachments,
  };
}

/**
 * Persist a chat message, making retries idempotent through client_message_id.
 * Returns { message, duplicate }.
 */
function appendMessage(db, input) {
  const { ticketId, sender, body, isInternal = false, clientMessageId = null } = input;
  const text = String(body || '').trim();
  if (!text && !(input.attachmentIds || []).length) throw badRequest('Pesan tidak boleh kosong');
  if (text.length > 4000) throw badRequest('Pesan maksimal 4000 karakter');

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) throw notFound('Tiket tidak ditemukan');

  if (clientMessageId) {
    const existing = db.prepare('SELECT * FROM ticket_messages WHERE client_message_id = ?').get(clientMessageId);
    if (existing) return { message: hydrate(db, existing), duplicate: true };
  }

  const senderType = input.senderType
    || (sender.role === 'customer' ? 'customer' : sender.role);
  const senderId = sender ? sender.id : null;
  const internal = isInternal && STAFF.includes(senderType) ? 1 : 0;
  const iso = now();

  const tx = db.transaction(() => {
    const { seq } = db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM ticket_messages WHERE ticket_id = ?')
      .get(ticketId);
    const id = uuid();
    db.prepare(`INSERT INTO ticket_messages
      (id, ticket_id, sender_id, sender_type, body, is_internal, client_message_id, seq, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, ticketId, senderId, senderType, text, internal, clientMessageId, seq, iso);

    const ids = input.attachmentIds || [];
    if (ids.length) {
      const link = db.prepare(`UPDATE attachments SET message_id = ?
        WHERE id = ? AND ticket_id = ? AND message_id IS NULL`);
      for (const attId of ids) link.run(id, attId, ticketId);
    }

    const fields = ['updated_at = ?'];
    const params = [iso];
    if (STAFF.includes(senderType) && !ticket.first_response_at) {
      fields.push('first_response_at = ?');
      params.push(iso);
      logEvent(db, ticketId, senderId, 'first_response', null, iso);
    }
    let nextStatus = null;
    if (STAFF.includes(senderType) && ['new', 'assigned'].includes(ticket.status)) {
      fields.push('status = ?');
      params.push('in_progress');
      nextStatus = 'in_progress';
    }
    db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(...params, ticketId);
    if (nextStatus) logEvent(db, ticketId, senderId, 'status_changed', ticket.status, nextStatus);
    return id;
  });

  const id = tx();
  return { message: hydrate(db, db.prepare('SELECT * FROM ticket_messages WHERE id = ?').get(id)), duplicate: false };
}

function listMessages(db, ticketId, { afterSeq = 0, includeInternal = false } = {}) {
  const rows = db.prepare(`SELECT * FROM ticket_messages
    WHERE ticket_id = ? AND seq > ? ${includeInternal ? '' : 'AND is_internal = 0'}
    ORDER BY seq ASC`).all(ticketId, Number(afterSeq) || 0);
  return rows.map((m) => hydrate(db, m));
}

function markRead(db, ticketId, userId, messageId = null) {
  const target = messageId
    ? db.prepare('SELECT id FROM ticket_messages WHERE id = ? AND ticket_id = ?').get(messageId, ticketId)
    : db.prepare('SELECT id FROM ticket_messages WHERE ticket_id = ? ORDER BY seq DESC LIMIT 1').get(ticketId);
  if (!target) throw notFound('Pesan tidak ditemukan');
  db.prepare(`INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(message_id, user_id) DO UPDATE SET delivered_at = COALESCE(delivered_at, excluded.delivered_at),
      read_at = excluded.read_at`)
    .run(target.id, userId, now(), now());
  return target.id;
}

module.exports = { appendMessage, listMessages, markRead, hydrate };
