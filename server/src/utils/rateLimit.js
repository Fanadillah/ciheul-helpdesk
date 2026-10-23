'use strict';

/** Minimal in-memory sliding-window rate limiter (no external dependency). */
function rateLimit({ windowMs = 60000, max = 30, keyFn } = {}) {
  const hits = new Map();
  const key = keyFn || ((req) => req.ip);
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      return res.status(429).json({ error: { message: 'Terlalu banyak permintaan, coba lagi nanti' } });
    }
    list.push(now);
    hits.set(k, list);
    if (hits.size > 5000) hits.clear();
    return next();
  };
}

module.exports = { rateLimit };
