-- Helpdesk database schema (SQLite, PostgreSQL-friendly naming)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL CHECK (role IN ('customer','agent','supervisor','admin')),
  is_guest      INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  description         TEXT,
  default_priority    TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN ('low','medium','high','urgent')),
  first_response_min  INTEGER NOT NULL DEFAULT 30,
  resolution_min      INTEGER NOT NULL DEFAULT 1440,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id                     TEXT PRIMARY KEY,
  code                   TEXT NOT NULL UNIQUE,
  subject                TEXT NOT NULL,
  description            TEXT NOT NULL,
  category_id            TEXT REFERENCES categories(id),
  priority               TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
  status                 TEXT NOT NULL CHECK (status IN ('new','assigned','in_progress','pending','resolved','closed')),
  channel                TEXT NOT NULL CHECK (channel IN ('widget','web','mobile')),
  customer_id            TEXT NOT NULL REFERENCES users(id),
  assignee_id            TEXT REFERENCES users(id),
  sla_first_due_at       TEXT,
  sla_resolution_due_at  TEXT,
  sla_first_breached_at  TEXT,
  sla_resolved_breached_at TEXT,
  first_response_at      TEXT,
  resolved_at            TEXT,
  closed_at              TEXT,
  csat_rating            INTEGER CHECK (csat_rating BETWEEN 1 AND 5),
  csat_comment           TEXT,
  reopen_count           INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id                TEXT PRIMARY KEY,
  ticket_id         TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id         TEXT REFERENCES users(id),
  sender_type       TEXT NOT NULL CHECK (sender_type IN ('customer','agent','supervisor','admin','ai','system')),
  body              TEXT NOT NULL,
  is_internal       INTEGER NOT NULL DEFAULT 0,
  client_message_id TEXT UNIQUE,
  seq               INTEGER NOT NULL,
  created_at        TEXT NOT NULL,
  UNIQUE (ticket_id, seq)
);

CREATE TABLE IF NOT EXISTS message_receipts (
  message_id   TEXT NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TEXT,
  read_at      TEXT,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id),
  type       TEXT NOT NULL,
  from_value TEXT,
  to_value   TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  ticket_id     TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message_id    TEXT REFERENCES ticket_messages(id) ON DELETE SET NULL,
  uploader_id   TEXT REFERENCES users(id),
  stored_name   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canned_responses (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  tags         TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  push_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  payload    TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES ticket_messages(id) ON DELETE SET NULL,
  prompt       TEXT,
  response     TEXT,
  model        TEXT,
  tokens       INTEGER,
  latency_ms   INTEGER,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee    ON tickets(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_customer    ON tickets(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_first   ON tickets(sla_first_due_at);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_resolve ON tickets(sla_resolution_due_at);
CREATE INDEX IF NOT EXISTS idx_messages_ticket     ON ticket_messages(ticket_id, seq);
CREATE INDEX IF NOT EXISTS idx_messages_client     ON ticket_messages(client_message_id);
CREATE INDEX IF NOT EXISTS idx_events_ticket       ON ticket_events(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications(user_id, created_at DESC);
