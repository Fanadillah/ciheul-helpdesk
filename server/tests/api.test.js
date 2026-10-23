'use strict';

process.env.NODE_ENV = 'test';
process.env.AI_AUTO_REPLY = 'false';
process.env.JWT_SECRET = 'helpdesk-test-secret';

const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { buildServer } = require('../src/server');

let server;
let app;
let baseUrl;
let tokens;
let agentId;
let categoryId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.token;
}

function authed(token) {
  return { Authorization: `Bearer ${token}` };
}

async function smokeTicket(token, subject = 'Tes tiket otomatis') {
  const res = await request(app)
    .post('/api/tickets')
    .set(authed(token))
    .send({
      subject,
      description: 'Dibuat oleh pengujian integrasi.',
      category_id: categoryId,
      channel: 'mobile',
    })
    .expect(201);
  return res.body.ticket;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  server = buildServer({ dbPath: ':memory:', seed: true, sla: false });
  app = server.app;
  const port = await server.listen(0);
  baseUrl = `http://127.0.0.1:${port}`;

  tokens = {
    admin: await login('admin@helpdesk.test', 'Admin123!'),
    supervisor: await login('supervisor@helpdesk.test', 'Super123!'),
    agent: await login('agent@helpdesk.test', 'Agent123!'),
    customer: await login('customer@helpdesk.test', 'Cust123!'),
  };

  const me = await request(app).get('/api/auth/me').set(authed(tokens.agent)).expect(200);
  agentId = me.body.user.id;

  const categories = await request(app).get('/api/public/categories').expect(200);
  categoryId = categories.body.categories[0].id;
});

afterAll(async () => {
  if (server) await server.close();
});

describe('health and auth', () => {
  it('reports health and protects private endpoints', async () => {
    const health = await request(app).get('/health').expect(200);
    expect(health.body.status).toBe('ok');

    await request(app).get('/api/auth/me').expect(401);
    const me = await request(app).get('/api/auth/me').set(authed(tokens.customer)).expect(200);
    expect(me.body.user.email).toBe('customer@helpdesk.test');
    expect(me.body.user.password_hash).toBeUndefined();
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@helpdesk.test', password: 'salah' })
      .expect(401);
    expect(res.body.error.message).toMatch(/salah/i);
  });
});

describe('public widget session', () => {
  it('creates a guest and reuses the same guest on repeat', async () => {
    const first = await request(app)
      .post('/api/public/session')
      .send({ name: 'Guest QA', email: 'guest-qa@example.com' })
      .expect(201);
    expect(first.body.token).toBeTruthy();
    expect(first.body.user.role).toBe('customer');

    const second = await request(app)
      .post('/api/public/session')
      .send({ name: 'Guest QA', email: 'guest-qa@example.com' })
      .expect(201);
    expect(second.body.user.id).toBe(first.body.user.id);

    const conflict = await request(app)
      .post('/api/public/session')
      .send({ name: 'Customer', email: 'customer@helpdesk.test' })
      .expect(409);
    expect(conflict.body.error.message).toMatch(/login/i);
  });
});

describe('ticket lifecycle over REST', () => {
  it('creates, assigns, converses, resolves, rates, and reopens a ticket', async () => {
    const ticket = await smokeTicket(tokens.customer, 'Tidak bisa login ke portal');
    expect(['new', 'assigned']).toContain(ticket.status);
    expect(ticket.code).toMatch(/^HD-/);

    const list = await request(app)
      .get('/api/tickets')
      .set(authed(tokens.customer))
      .expect(200);
    expect(list.body.tickets.some((t) => t.id === ticket.id)).toBe(true);

    // customers may not change staff-only fields
    await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .set(authed(tokens.customer))
      .send({ status: 'resolved' })
      .expect(403);

    // the agent opens the ticket and claims it
    const detail = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set(authed(tokens.agent))
      .expect(200);
    expect(detail.body.ticket.subject).toBe('Tidak bisa login ke portal');

    const assigned = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .set(authed(tokens.agent))
      .send({ assignee_id: agentId, status: 'assigned' })
      .expect(200);
    expect(assigned.body.ticket.assignee_id).toBe(agentId);
    expect(assigned.body.ticket.status).toBe('assigned');

    // duplicate client ids must not create duplicate messages
    const clientMessageId = 'test-client-message-1';
    const first = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set(authed(tokens.agent))
      .send({ body: 'Halo, kami cek dulu ya.', client_message_id: clientMessageId })
      .expect(201);
    const second = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set(authed(tokens.agent))
      .send({ body: 'Halo, kami cek dulu ya.', client_message_id: clientMessageId })
      .expect(201);
    expect(second.body.message.id).toBe(first.body.message.id);

    const afterReply = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set(authed(tokens.agent))
      .expect(200);
    expect(afterReply.body.ticket.status).toBe('in_progress');
    expect(afterReply.body.ticket.first_response_at).toBeTruthy();

    // internal notes are hidden from the customer
    const internal = await request(app)
      .post(`/api/tickets/${ticket.id}/messages`)
      .set(authed(tokens.agent))
      .send({ body: 'Catatan internal: cek log server.', is_internal: true })
      .expect(201);
    expect(internal.body.message.is_internal).toBe(true);

    const customerMessages = await request(app)
      .get(`/api/tickets/${ticket.id}/messages`)
      .set(authed(tokens.customer))
      .expect(200);
    const customerBodies = customerMessages.body.messages.map((m) => m.body);
    expect(customerBodies).toContain('Halo, kami cek dulu ya.');
    expect(customerBodies).not.toContain('Catatan internal: cek log server.');

    // duplicate message replay still returns the customer's view intact
    const agentMessages = await request(app)
      .get(`/api/tickets/${ticket.id}/messages`)
      .set(authed(tokens.agent))
      .expect(200);
    expect(agentMessages.body.messages.map((m) => m.body)).toContain('Catatan internal: cek log server.');

    const resolved = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .set(authed(tokens.agent))
      .send({ status: 'resolved' })
      .expect(200);
    expect(resolved.body.ticket.status).toBe('resolved');
    expect(resolved.body.ticket.resolved_at).toBeTruthy();

    const csat = await request(app)
      .post(`/api/tickets/${ticket.id}/csat`)
      .set(authed(tokens.customer))
      .send({ rating: 5, comment: 'Cepat dan ramah' })
      .expect(200);
    expect(csat.body.ticket.csat_rating).toBe(5);

    const reopened = await request(app)
      .post(`/api/tickets/${ticket.id}/reopen`)
      .set(authed(tokens.customer))
      .expect(200);
    expect(reopened.body.ticket.status).toBe('in_progress');
  });

  it('enforces reports permissions', async () => {
    await request(app)
      .get('/api/reports/summary')
      .set(authed(tokens.customer))
      .expect(403);

    const summary = await request(app)
      .get('/api/reports/summary')
      .set(authed(tokens.supervisor))
      .expect(200);
    expect(summary.body.totals).toBeTruthy();
    expect(summary.body.totals.total).toBeGreaterThan(0);

    await request(app)
      .patch(`/api/users/${agentId}`)
      .set(authed(tokens.agent))
      .send({ name: 'Nama Baru' })
      .expect(403);

    const users = await request(app)
      .get('/api/users')
      .set(authed(tokens.agent))
      .expect(200);
    expect(users.body.users.length).toBeGreaterThan(0);
  });
});

describe('realtime socket contract', () => {
  it('syncs room messages, idempotent retries, and internal notes', async () => {
    const ticket = await smokeTicket(tokens.customer, 'Realtime socket test');
    const customerSocket = await connectSocket(tokens.customer);
    const agentSocket = await connectSocket(tokens.agent);
    const agentMessages = [];
    const customerMessages = [];
    agentSocket.on('message:new', (m) => agentMessages.push(m));
    customerSocket.on('message:new', (m) => customerMessages.push(m));

    try {
      const customerJoin = await emitAck(customerSocket, 'ticket:join', {
        ticket_id: ticket.id,
        last_seq: 0,
      });
      expect(customerJoin.ok).toBe(true);
      expect(customerJoin.ticket.id).toBe(ticket.id);

      const agentJoin = await emitAck(agentSocket, 'ticket:join', {
        ticket_id: ticket.id,
        last_seq: 0,
      });
      expect(agentJoin.ok).toBe(true);

      const receiveAgent = once(agentSocket, 'message:new');
      const receiveCustomer = once(customerSocket, 'message:new');
      const ack = await emitAck(customerSocket, 'message:send', {
        ticket_id: ticket.id,
        body: 'Halo dari pelanggan',
        client_message_id: 'socket-client-message-1',
      });
      expect(ack.ok).toBe(true);
      expect(ack.duplicate).toBe(false);
      expect(ack.message_id).toBeTruthy();

      const [agentEvent, customerEvent] = await Promise.all([receiveAgent, receiveCustomer]);
      expect(agentEvent.body).toBe('Halo dari pelanggan');
      expect(customerEvent.client_message_id).toBe('socket-client-message-1');

      // retry with the same client id must acknowledge the same message without a new event
      const agentCount = agentMessages.length;
      const duplicateAck = await emitAck(customerSocket, 'message:send', {
        ticket_id: ticket.id,
        body: 'Halo dari pelanggan',
        client_message_id: 'socket-client-message-1',
      });
      expect(duplicateAck.ok).toBe(true);
      expect(duplicateAck.duplicate).toBe(true);
      expect(duplicateAck.message_id).toBe(ack.message_id);
      await sleep(350);
      expect(agentMessages.length).toBe(agentCount);

      // internal notes go to the staff room only
      const agentNote = once(agentSocket, 'message:new');
      const ticketUpdate = once(agentSocket, 'ticket:update');
      const noteAck = await emitAck(agentSocket, 'message:send', {
        ticket_id: ticket.id,
        body: 'Catatan internal realtime',
        is_internal: true,
      });
      expect(noteAck.ok).toBe(true);
      const noteEvent = await agentNote;
      expect(noteEvent.is_internal).toBe(true);
      const updated = await ticketUpdate;
      expect(updated.id).toBe(ticket.id);
      expect(updated.status).toBe('in_progress');
      await sleep(350);
      expect(customerMessages.some((m) => m.body === 'Catatan internal realtime')).toBe(false);
    } finally {
      customerSocket.disconnect();
      agentSocket.disconnect();
    }
  });
});
