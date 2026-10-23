'use strict';

const { badRequest } = require('../utils/errors');

function range(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from)
    : new Date(to.getTime() - 29 * 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw badRequest('Format tanggal from/to tidak valid (ISO 8601)');
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

function summary(db, query = {}) {
  const { from, to } = range(query);
  const where = 'WHERE t.created_at BETWEEN ? AND ?';

  const totals = db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status IN ('assigned','in_progress','pending') THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count
    FROM tickets t ${where}`).get(from, to);

  const timing = db.prepare(`SELECT
      AVG(CASE WHEN first_response_at IS NOT NULL
        THEN (julianday(first_response_at) - julianday(created_at)) * 86400 END) AS avg_first_response_sec,
      AVG(CASE WHEN resolved_at IS NOT NULL
        THEN (julianday(resolved_at) - julianday(created_at)) * 86400 END) AS avg_resolution_sec,
      AVG(csat_rating) AS avg_csat,
      SUM(CASE WHEN csat_rating IS NOT NULL THEN 1 ELSE 0 END) AS csat_count,
      SUM(CASE WHEN resolved_at IS NOT NULL AND sla_resolution_due_at IS NOT NULL
        AND resolved_at <= sla_resolution_due_at THEN 1 ELSE 0 END) AS sla_met,
      SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) AS resolved_for_sla
    FROM tickets t ${where}`).get(from, to);

  const byPriority = db.prepare(`SELECT priority, COUNT(*) AS total
    FROM tickets t ${where} GROUP BY priority ORDER BY total DESC`).all(from, to);

  const byChannel = db.prepare(`SELECT channel, COUNT(*) AS total
    FROM tickets t ${where} GROUP BY channel`).all(from, to);

  const perAgent = db.prepare(`SELECT u.id, u.name,
      COUNT(t.id) AS assigned,
      SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) AS resolved,
      AVG(t.csat_rating) AS avg_csat
    FROM users u LEFT JOIN tickets t ON t.assignee_id = u.id
      AND t.created_at BETWEEN ? AND ?
    WHERE u.role IN ('agent','supervisor')
    GROUP BY u.id ORDER BY assigned DESC`).all(from, to);

  const volume = db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
    FROM tickets t ${where} GROUP BY day ORDER BY day`).all(from, to);

  return {
    range: { from, to },
    totals,
    timing: {
      ...timing,
      sla_compliance: timing.resolved_for_sla
        ? Math.round((timing.sla_met / timing.resolved_for_sla) * 100) : null,
    },
    byPriority,
    byChannel,
    perAgent,
    volume,
  };
}

module.exports = { summary };
