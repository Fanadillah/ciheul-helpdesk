'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const { openDb } = require('./db');
const { seed } = require('./db/seed');
const { registerMiddleware, registerRoutes } = require('./app');
const attachRealtime = require('./realtime/socket');
const { emitTicket, notifyUser } = require('./realtime/events');
const tickets = require('./services/tickets');

function startMaintenance(db, io) {
  const timer = setInterval(() => {
    try {
      for (const { ticket, kind } of tickets.sweepSla(db)) {
        const title = kind === 'first_response'
          ? `SLA first response terlampaui: ${ticket.code}`
          : `SLA resolusi terlampaui: ${ticket.code}`;
        const payload = { ticket_id: ticket.id, kind };
        const staff = db.prepare(`SELECT id FROM users
          WHERE is_active = 1 AND role IN ('supervisor','agent')`).all();
        for (const row of staff) {
          notifyUser(io, db, row.id, 'sla_breach', title, payload);
        }
        io.to('staff').emit('sla:breach', { ticket, kind });
        emitTicket(io, ticket);
      }

      if (config.autoCloseEnabled) {
        for (const ticket of tickets.autoCloseResolved(db, config.autoCloseDays)) {
          emitTicket(io, ticket);
          notifyUser(io, db, ticket.customer_id, 'ticket_status',
            `Tiket ${ticket.code} ditutup otomatis`, { ticket_id: ticket.id, status: 'closed' });
        }
      }
    } catch (err) {
      console.error('[maintenance] scheduled job failed', err);
    }
  }, config.slaTickMs);
  timer.unref();
  return timer;
}

function buildServer(options = {}) {
  const db = openDb(options.dbPath || config.dbPath);
  const empty = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  if (options.seed === true || (options.seed !== false && empty)) seed(db);

  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 20_000,
    pingTimeout: 15_000,
  });
  app.set('io', io);

  registerMiddleware(app, db);
  registerRoutes(app, db, io);
  attachRealtime(io, db);
  const maintenanceTimer = options.sla === false ? null : startMaintenance(db, io);

  return {
    app,
    db,
    io,
    httpServer,
    async listen(port = 0) {
      await new Promise((resolve) => httpServer.listen(port, resolve));
      return httpServer.address().port;
    },
    async close() {
      if (maintenanceTimer) clearInterval(maintenanceTimer);
      await new Promise((resolve) => io.close(resolve));
      db.close();
    },
  };
}

module.exports = { buildServer };

if (require.main === module) {
  const server = buildServer();
  server.listen(config.port).then((port) => {
    console.log(`Helpdesk server running on http://localhost:${port}`);
    console.log(`  Web app     : http://localhost:${port}/`);
    console.log(`  Widget demo : http://localhost:${port}/widget/demo.html`);
    console.log(`  Health      : http://localhost:${port}/health`);
  });
}
