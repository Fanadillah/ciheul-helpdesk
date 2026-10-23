'use strict';

require('dotenv').config();
const path = require('path');

const root = path.join(__dirname, '..');

module.exports = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'helpdesk-dev-secret-change-me',
  tokenTtl: process.env.JWT_TTL || '12h',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'helpdesk.db'),
  uploadDir: process.env.UPLOAD_DIR || path.join(root, 'uploads'),
  webDir: path.join(root, '..', 'web'),
  widgetDir: path.join(root, '..', 'widget'),
  slaTickMs: Number(process.env.SLA_TICK_MS || 30000),
  aiAutoReply: process.env.AI_AUTO_REPLY !== 'false',
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 12000),
    get enabled() {
      return Boolean(process.env.AI_API_KEY);
    },
  },
};
