'use strict';

const crypto = require('crypto');

const now = () => new Date().toISOString();

function uuid() {
  return crypto.randomUUID();
}

function ticketCode(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HD-${y}${m}${d}-${rand}`;
}

module.exports = { uuid, now, ticketCode };
