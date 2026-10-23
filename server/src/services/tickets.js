'use strict';

const { badRequest, conflict, forbidden, notFound } = require('../utils/errors');
const { canTransition, oneOf, PRIORITIES, STATUSES } = require('../utils/validate');
const { uuid, now, ticketCode } = require('../utils/ids');

const OPEN_STATUSES = ['new', 'assigned', 'in_progress', 'pending'];

const TICKET_SELECT = `
  SELECT t.*,
         c.name  AS category_name,
         cu.name AS customer_name,
         cu.email AS customer_email,
         au.name AS assignee_name,
         (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
         (SELECT m.body FROM ticket_messages m WHERE m.ticket_id = t.id
            AND m.is_internal = 0 ORDER BY m.seq DESC LIMIT 1) AS last_message
  FROM tickets t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN users cu ON cu.id = t.customer_id
  LEFT JOIN users au ON au.id = t.assignee_id`;

function getTicketRow(db, id) {
  return db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(id);
}

function decorate(ticket) {
  if (!ticket) return null;
  const ts = Date.now();
  const due = (v) => (v ? Math.round((new Date(v).getTime() - ts) / 1000) : null);
  return {
    ...ticket,
    sla: {
      first_response_due_in: due(ticket.sla_first_due_at),
      resolution_due_in: due(ticket.sla_resolution_due_at),
      first_response_breached: Boolean(ticket.sla_first_breached_at),
      resolution_breached: Boolean(ticket.sla_resolved_breached_at),
    },
  };
}

function getTicket(db, id, user) {
  const ticket = getTicketRow(db, id);
  if (!ticket) throw notFound('Tiket tidak ditemukan');
  if (user.role === 'customer' && ticket.customer_id !== user.id) {
    throw forbidden('Tiket ini bukan milik Anda');
  }
  return decorate(ticket);
}

function listTickets(db, user, filters = {}) {
  const where = [];
  const params = [];
  if (user.role === 'customer') {
    where.push('t.customer_id = ?');
    params.push(user.id);
  } else if (filters.scope === 'mine') {
    where.push('t.assignee_id = ?');
    params.push(user.id);
  }
  if (filters.status) {
    where.push('t.status = ?');
    params.push(oneOf(filters.status, STATUSES, 'status'));
  }
  if (filters.priority) {
    where.push('t.priority = ?');
    params.push(oneOf(filters.priority, PRIORITIES, 'priority'));
  }
  if (filters.assignee_id) {
    where.push('t.assignee_id = ?');
    params.push(filters.assignee_id);
  }
  if (filters.category_id) {
    where.push('t.category_id = ?');
    params.push(filters.category_id);
  }
  if (filters.q) {
    where.push('(t.code LIKE ? OR t.subject LIKE ? OR cu.name LIKE ?)');
    const q = `%${filters.q}%`;
    params.push(q, q, q);
  }
  const sql = `${TICKET_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE t.status
      WHEN 'new' THEN 0 WHEN 'assigned' THEN 1 WHEN 'in_progress' THEN 2
      WHEN 'pending' THEN 3 WHEN 'resolved' THEN 4 ELSE 5 END,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
        WHEN 'medium' THEN 2 ELSE 3 END,
      t.updated_at DESC
    LIMIT ?`;
  params.push(Number(filters.limit) || 100);
  return db.prepare(sql).all(...params).map(decorate);
}

function pickAgent(db) {
  return db.prepare(`
    SELECT u.id, COUNT(t.id) AS open_tickets
    FROM users u
    LEFT JOIN tickets t ON t.assignee_id = u.id AND t.status IN ('assigned','in_progress','pending')
    WHERE u.role = 'agent' AND u.is_active = 1
    GROUP BY u.id
    ORDER BY open_tickets ASC, u.created_at ASC
    LIMIT 1`).get() || null;
}

function logEvent(db, ticketId, actorId, type, from = null, to = null) {
  db.prepare(`INSERT INTO ticket_events (id, ticket_id, actor_id, type, from_value, to_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuid(), ticketId, actorId, type, from, to, now());
}

function createTicket(db, input) {
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND is_active = 1')
    .get(input.categoryId);
  if (!category) throw badRequest('Kategori tidak ditemukan');

  const priority = oneOf(input.priority || category.default_priority, PRIORITIES, 'priority');
  const channel = oneOf(input.channel || 'web', ['widget', 'web', 'mobile'], 'channel');
  const ts = new Date();
  const iso = ts.toISOString();
  const agent = input.autoAssign === false ? null : pickAgent(db);
  const status = agent ? 'assigned' : 'new';
  const id = uuid();
  const code = ticketCode(ts);

  const firstDue = new Date(ts.getTime() + category.first_response_min * 60000).toISOString();
  const resolveDue = new Date(ts.getTime() + category.resolution_min * 60000).toISOString();

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO tickets
      (id, code, subject, description, category_id, priority, status, channel, customer_id,
       assignee_id, sla_first_due_at, sla_resolution_due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, code, input.subject, input.description, category.id, priority, status,
        channel, input.customerId, agent ? agent.id : null, firstDue, resolveDue, iso, iso);
    logEvent(db, id, input.customerId, 'created', null, status);
    if (agent) logEvent(db, id, null, 'auto_assigned', null, agent.id);
    db.prepare(`INSERT INTO ticket_messages
      (id, ticket_id, sender_id, sender_type, body, is_internal, client_message_id, seq, created_at)
      VALUES (?, ?, ?, 'customer', ?, 0, ?, 1, ?)`)
      .run(uuid(), id, input.customerId, input.description, input.clientMessageId || null, iso);
  });
  tx();
  return decorate(getTicketRow(db, id));
}

function updateTicket(db, id, patch, actor) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFound('Tiket tidak ditemukan');

  const fields = [];
  const params = [];
  const events = [];
  const iso = now();

  if (patch.status && patch.status !== ticket.status) {
    const next = oneOf(patch.status, STATUSES, 'status');
    if (!canTransition(ticket.status, next)) {
      throw conflict(`Status tidak dapat berubah dari ${ticket.status} ke ${next}`);
    }
    fields.push('status = ?');
    params.push(next);
    if (next === 'resolved') { fields.push('resolved_at = ?'); params.push(iso); }
    if (next === 'closed') { fields.push('closed_at = ?'); params.push(iso); }
    const reopening = next === 'in_progress'
      && (ticket.status === 'resolved' || ticket.status === 'closed');
    if (reopening) {
      fields.push('resolved_at = NULL', 'closed_at = NULL', 'reopen_count = reopen_count + 1');
    }
    events.push(['status_changed', ticket.status, next]);
  }

  if (patch.priority && patch.priority !== ticket.priority) {
    fields.push('priority = ?');
    params.push(oneOf(patch.priority, PRIORITIES, 'priority'));
    events.push(['priority_changed', ticket.priority, patch.priority]);
  }

  if (patch.category_id && patch.category_id !== ticket.category_id) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ? AND is_active = 1')
      .get(patch.category_id);
    if (!category) throw badRequest('Kategori tidak ditemukan');
    fields.push('category_id = ?');
    params.push(category.id);
    events.push(['category_changed', ticket.category_id, category.id]);
  }

  if (patch.assignee_id !== undefined && patch.assignee_id !== ticket.assignee_id) {
    if (patch.assignee_id) {
      const agent = db.prepare(`SELECT id FROM users WHERE id = ? AND role IN ('agent','supervisor') AND is_active = 1`)
        .get(patch.assignee_id);
      if (!agent) throw badRequest('Agent tidak ditemukan atau tidak aktif');
    }
    fields.push('assignee_id = ?');
    params.push(patch.assignee_id || null);
    if (!patch.status && ticket.status === 'new' && patch.assignee_id) {
      fields.push('status = ?');
      params.push('assigned');
      events.push(['status_changed', ticket.status, 'assigned']);
    }
    events.push(['assignee_changed', ticket.assignee_id, patch.assignee_id || null]);
  }

  if (!fields.length) {
    if (patch.note) logEvent(db, id, actor.id, 'note', null, patch.note);
    return decorate(getTicketRow(db, id));
  }

  fields.push('updated_at = ?');
  params.push(iso);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE tickets SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
    for (const [type, from, to] of events) logEvent(db, id, actor.id, type, from, to);
  });
  tx();
  return decorate(getTicketRow(db, id));
}

function submitCsat(db, id, user, rating, comment) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) throw notFound('Tiket tidak ditemukan');
  if (ticket.customer_id !== user.id) throw forbidden('Tiket ini bukan milik Anda');
  if (!['resolved', 'closed'].includes(ticket.status)) {
    throw conflict('CSAT hanya dapat diisi setelah tiket resolved');
  }
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw badRequest('Rating harus 1-5');
  db.prepare('UPDATE tickets SET csat_rating = ?, csat_comment = ?, updated_at = ? WHERE id = ?')
    .run(n, comment || null, now(), id);
  logEvent(db, id, user.id, 'csat_submitted', null, String(n));
  return decorate(getTicketRow(db, id));
}

function getEvents(db, id) {
  return db.prepare(`SELECT e.*, u.name AS actor_name FROM ticket_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.ticket_id = ? ORDER BY e.created_at ASC`).all(id);
}

/** Mark SLA deadlines that have just been exceeded; returns the affected tickets. */
function sweepSla(db) {
  const ts = now();
  const breaches = [];
  const open = db.prepare(`SELECT * FROM tickets
    WHERE status NOT IN ('resolved','closed')`).all();
  const breachFirst = db.prepare('UPDATE tickets SET sla_first_breached_at = ?, updated_at = ? WHERE id = ?');
  const breachResolve = db.prepare('UPDATE tickets SET sla_resolved_breached_at = ?, updated_at = ? WHERE id = ?');

  for (const t of open) {
    if (!t.first_response_at && t.sla_first_due_at && t.sla_first_due_at < ts && !t.sla_first_breached_at) {
      breachFirst.run(ts, ts, t.id);
      logEvent(db, t.id, null, 'sla_breach', 'first_response', ts);
      breaches.push({ ticket: decorate(getTicketRow(db, t.id)), kind: 'first_response' });
    }
    if (t.sla_resolution_due_at && t.sla_resolution_due_at < ts && !t.sla_resolved_breached_at) {
      breachResolve.run(ts, ts, t.id);
      logEvent(db, t.id, null, 'sla_breach', 'resolution', ts);
      breaches.push({ ticket: decorate(getTicketRow(db, t.id)), kind: 'resolution' });
    }
  }
  return breaches;
}

module.exports = {
  OPEN_STATUSES,
  decorate,
  getTicket,
  getTicketRow,
  listTickets,
  createTicket,
  updateTicket,
  submitCsat,
  getEvents,
  sweepSla,
  pickAgent,
  logEvent,
};
