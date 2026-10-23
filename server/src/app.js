'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const { rateLimit } = require('./utils/rateLimit');
const { errorMiddleware } = require('./utils/errors');
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');

function registerMiddleware(app, db) {
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
      }
    });
    next();
  });

  app.get('/health', (req, res) => {
    const tickets = db.prepare('SELECT COUNT(*) AS total FROM tickets').get().total;
    res.json({ status: 'ok', tickets, uptime: Math.round(process.uptime()) });
  });
}

function registerRoutes(app, db, io) {
  const loginLimiter = rateLimit({ windowMs: 60_000, max: 15 });
  const guestLimiter = rateLimit({ windowMs: 60_000, max: 20 });

  app.use('/api/auth', loginLimiter, authRoutes(db));
  app.use('/api/public', guestLimiter, publicRoutes(db));

  app.use('/api', requireAuth(db));

  app.use('/api/tickets', ticketRoutes(db, io));
  app.get('/api/attachments/:id', requireAuth(db), ticketRoutes.attachmentDownload(db));
  app.use('/api', adminRoutes(db));
  app.use('/api/reports', reportRoutes(db));
  app.use('/api/notifications', notificationRoutes(db));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan` } });
  });

  // static assets: widget + web app (single origin, no CORS for the demo)
  app.use('/widget', express.static(config.widgetDir));
  app.use(express.static(config.webDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(config.webDir, 'index.html'));
  });

  app.use(errorMiddleware);
}

module.exports = { registerMiddleware, registerRoutes };
