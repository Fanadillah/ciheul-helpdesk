'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');
const { asyncHandler, badRequest, forbidden, notFound } = require('../utils/errors');
const { requireFields, oneOf, text, PRIORITIES } = require('../utils/validate');
const { uuid, now } = require('../utils/ids');
const { isStaff, assertTicketAccess } = require('../services/access');
const tickets = require('../services/tickets');
const messages = require('../services/messages');
const { emitTicket, notifyUser } = require('../realtime/events');
const { generateFirstReply } = require('../services/ai');

module.exports = function ticketRoutes(db, io) {
  const router = express.Router();
  const uploadDir = config.uploadDir;
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname).slice(0, 10)}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/;
      if (!allowed.test(file.mimetype)) return cb(badRequest('Tipe file tidak diizinkan'));
      return cb(null, true);
    },
  });

  // Cek akses sebelum Multer menulis file.
  const ticketMember = (req, res, next) => {
    try {
      assertTicketAccess(db, req.user, req.params.id);
      next();
    } catch (err) {
      next(err);
    }
  };

  router.get('/', (req, res) => {
    res.json({ tickets: tickets.listTickets(db, req.user, req.query) });
  });

  router.post('/', asyncHandler(async (req, res) => {
    requireFields(req.body, ['subject', 'description', 'category_id']);
    const ticket = tickets.createTicket(db, {
      customerId: req.user.id,
      subject: text(req.body.subject, 160),
      description: text(req.body.description, 4000),
      categoryId: req.body.category_id,
      priority: req.body.priority,
      channel: req.body.channel,
      clientMessageId: req.body.client_message_id,
    });

    io.to('staff').emit('ticket:created', ticket);
    notifyUser(io, db, ticket.assignee_id, 'ticket_assigned',
      `Tiket baru: ${ticket.subject}`, { ticket_id: ticket.id });

    if (config.aiAutoReply) {
      setTimeout(async () => {
        try {
          const current = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
          // Jangan kirim balasan AI kalau agent sudah membalas.
          if (!current || current.first_response_at || ['resolved', 'closed'].includes(current.status)) return;
          const history = messages.listMessages(db, ticket.id, { includeInternal: false })
            .slice(-6)
            .map((m) => ({ role: m.sender_type === 'customer' ? 'user' : 'assistant', content: m.body }));
          const reply = await generateFirstReply(db, current, history);
          const { message } = messages.appendMessage(db, {
            ticketId: ticket.id, sender: null, senderType: 'ai', body: reply.text,
          });
          io.to(`ticket:${ticket.id}`).emit('message:new', message);
          emitTicket(io, tickets.decorate(tickets.getTicketRow(db, ticket.id)));
        } catch (err) {
          console.error('[ai] first reply failed', err);
        }
      }, 1200);
    }

    res.status(201).json({ ticket });
  }));

  router.get('/:id', (req, res) => {
    const ticket = tickets.getTicket(db, req.params.id, req.user);
    res.json({ ticket });
  });

  router.patch('/:id', asyncHandler(async (req, res) => {
    if (!isStaff(req.user)) throw forbidden('Hanya agent yang dapat mengubah tiket');
    const before = assertTicketAccess(db, req.user, req.params.id);
    const patch = {};
    if (req.body.status !== undefined) patch.status = req.body.status;
    if (req.body.priority !== undefined) patch.priority = oneOf(req.body.priority, PRIORITIES, 'priority');
    if (req.body.assignee_id !== undefined) patch.assignee_id = req.body.assignee_id || null;
    if (req.body.category_id !== undefined) patch.category_id = req.body.category_id;
    if (req.body.note !== undefined) patch.note = text(req.body.note, 500);

    const ticket = tickets.updateTicket(db, before.id, patch, req.user);
    emitTicket(io, ticket);

    if (patch.status && ['resolved', 'closed'].includes(patch.status)) {
      notifyUser(io, db, ticket.customer_id, 'ticket_status',
        `Tiket ${ticket.code} ${patch.status}`, { ticket_id: ticket.id, status: patch.status });
    }
    if (patch.assignee_id && patch.assignee_id !== before.assignee_id) {
      notifyUser(io, db, patch.assignee_id, 'ticket_assigned',
        `Tiket ditugaskan: ${ticket.subject}`, { ticket_id: ticket.id });
    }
    res.json({ ticket });
  }));

  router.post('/:id/reopen', asyncHandler(async (req, res) => {
    const ticket = assertTicketAccess(db, req.user, req.params.id);
    if (!['resolved', 'closed'].includes(ticket.status)) {
      throw badRequest('Hanya tiket resolved/closed yang dapat dibuka kembali');
    }
    const stamp = ticket.closed_at || ticket.resolved_at;
    const days = (Date.now() - new Date(stamp).getTime()) / 86400000;
    if (days > 7) throw badRequest('Batas reopen 7 hari sudah terlewat');
    const updated = tickets.updateTicket(db, ticket.id, { status: 'in_progress' }, req.user);
    emitTicket(io, updated);
    res.json({ ticket: updated });
  }));

  router.post('/:id/csat', asyncHandler(async (req, res) => {
    requireFields(req.body, ['rating']);
    const ticket = tickets.submitCsat(db, req.params.id, req.user, req.body.rating,
      text(req.body.comment || '', 500));
    emitTicket(io, ticket);
    res.json({ ticket });
  }));

  router.get('/:id/messages', (req, res) => {
    assertTicketAccess(db, req.user, req.params.id);
    const list = messages.listMessages(db, req.params.id, {
      afterSeq: req.query.after_seq,
      includeInternal: isStaff(req.user),
    });
    res.json({ messages: list });
  });

  router.post('/:id/messages', asyncHandler(async (req, res) => {
    const ticket = assertTicketAccess(db, req.user, req.params.id);
    const { message } = messages.appendMessage(db, {
      ticketId: ticket.id,
      sender: req.user,
      body: req.body.body,
      clientMessageId: req.body.client_message_id || null,
      isInternal: Boolean(req.body.is_internal),
      attachmentIds: req.body.attachment_ids || [],
    });
    const room = message.is_internal ? `ticket:${ticket.id}:staff` : `ticket:${ticket.id}`;
    io.to(room).emit('message:new', message);
    emitTicket(io, tickets.decorate(tickets.getTicketRow(db, ticket.id)));
    res.status(201).json({ message });
  }));

  router.post('/:id/read', asyncHandler(async (req, res) => {
    assertTicketAccess(db, req.user, req.params.id);
    const id = messages.markRead(db, req.params.id, req.user.id, req.body.message_id);
    io.to(`ticket:${req.params.id}`).emit('message:read',
      { ticket_id: req.params.id, message_id: id, user_id: req.user.id });
    res.json({ ok: true, message_id: id });
  }));

  router.get('/:id/events', (req, res) => {
    if (!isStaff(req.user)) throw forbidden();
    assertTicketAccess(db, req.user, req.params.id);
    res.json({ events: tickets.getEvents(db, req.params.id) });
  });

  router.post('/:id/attachments', ticketMember, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('File wajib diunggah');
    const id = uuid();
    try {
      db.prepare(`INSERT INTO attachments
        (id, ticket_id, uploader_id, stored_name, original_name, mime, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.params.id, req.user.id, req.file.filename,
          req.file.originalname, req.file.mimetype, req.file.size, now());
    } catch (err) {
      // Hapus file kalau insert metadata gagal.
      fs.unlink(req.file.path, () => {});
      throw err;
    }
    res.status(201).json({
      attachment: {
        id, original_name: req.file.originalname, mime: req.file.mimetype, size: req.file.size,
      },
    });
  }));

  router.post('/:id/ai-reply', asyncHandler(async (req, res) => {
    if (!isStaff(req.user)) throw forbidden();
    const ticket = assertTicketAccess(db, req.user, req.params.id);
    const history = messages.listMessages(db, ticket.id, { includeInternal: false })
      .slice(-6)
      .map((m) => ({ role: m.sender_type === 'customer' ? 'user' : 'assistant', content: m.body }));
    const reply = await generateFirstReply(db, ticket, history);
    const { message } = messages.appendMessage(db, {
      ticketId: ticket.id, sender: null, senderType: 'ai', body: reply.text,
    });
    io.to(`ticket:${ticket.id}`).emit('message:new', message);
    emitTicket(io, tickets.decorate(tickets.getTicketRow(db, ticket.id)));
    res.status(201).json({ message, meta: reply });
  }));

  return router;
};

module.exports.attachmentDownload = function attachmentDownload(db) {
  return (req, res) => {
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('Lampiran tidak ditemukan');
    assertTicketAccess(db, req.user, row.ticket_id);
    res.type(row.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.original_name)}"`);
    res.sendFile(path.join(config.uploadDir, row.stored_name));
  };
};
