'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

/**
 * Open (and migrate) a helpdesk database.
 * @param {string} file absolute path or ':memory:'
 */
function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
