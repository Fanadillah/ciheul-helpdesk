'use strict';

const { badRequest } = require('./errors');

const ROLES = ['customer', 'agent', 'supervisor', 'admin'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'];

// allowed status transitions for the ticket lifecycle
const TRANSITIONS = {
  new: ['assigned', 'in_progress'],
  assigned: ['in_progress', 'pending', 'resolved'],
  in_progress: ['pending', 'resolved'],
  pending: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
};

function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length) throw badRequest(`Field wajib belum diisi: ${missing.join(', ')}`);
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw badRequest(`${field} harus salah satu dari: ${allowed.join(', ')}`);
  }
  return value;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));
}

function email(value) {
  if (!isEmail(value)) throw badRequest('Format email tidak valid');
  return String(value).toLowerCase().trim();
}

function text(value, max = 2000) {
  const s = String(value ?? '').trim();
  if (s.length > max) throw badRequest(`Teks maksimal ${max} karakter`);
  return s;
}

function positiveInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${field} harus bilangan bulat positif`);
  return n;
}

function canTransition(from, to) {
  return from === to || (TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  ROLES, PRIORITIES, STATUSES, TRANSITIONS,
  requireFields, oneOf, isEmail, email, text, positiveInt, canTransition,
};
