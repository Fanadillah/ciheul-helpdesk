'use strict';

const config = require('../config');
const { uuid, now } = require('../utils/ids');

const STOPWORDS = new Set(['yang', 'dan', 'atau', 'saya', 'tidak', 'bisa', 'untuk', 'dengan',
  'sudah', 'belum', 'ada', 'ini', 'itu', 'di', 'ke', 'dari', 'apa', 'bagaimana', 'cara',
  'mohon', 'tolong', 'bantuan', 'aplikasi', 'pesan', 'kami']);

function tokens(text) {
  return String(text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function fallbackAnswer(db, ticket) {
  const articles = db.prepare('SELECT title, body, tags FROM kb_articles WHERE is_published = 1').all();
  const words = new Set(tokens(`${ticket.subject} ${ticket.description}`));
  let best = null;
  let bestScore = 0;
  for (const article of articles) {
    const hay = tokens(`${article.title} ${article.body} ${article.tags || ''}`);
    const score = hay.reduce((acc, w) => acc + (words.has(w) ? 1 : 0), 0);
    if (score > bestScore) { best = article; bestScore = score; }
  }
  if (best && bestScore > 0) {
    return `Halo, terima kasih sudah menghubungi kami.\n\n${best.body}\n\n` +
      'Jika masih ada kendala, balas pesan ini dan tim support akan membantu lebih lanjut.';
  }
  return 'Halo, terima kasih sudah menghubungi kami. Tiket Anda sudah kami terima dan ' +
    'akan segera ditangani oleh tim support. Sementara itu, mohon jelaskan langkah yang ' +
    'sudah dicoba agar kami dapat membantu lebih cepat.';
}

async function callModel(prompt, history) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: prompt },
          ...history,
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content?.trim() || '',
      tokens: data.usage?.total_tokens || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Buat balasan pertama. Kalau provider gagal, pakai knowledge base.
 */
async function generateFirstReply(db, ticket, history = []) {
  const started = Date.now();
  const kb = db.prepare('SELECT title, body FROM kb_articles WHERE is_published = 1 LIMIT 8').all();
  const knowledge = kb.map((k) => `- ${k.title}: ${k.body}`).join('\n');
  const prompt = [
    'Anda adalah asisten customer support helpdesk yang ramah dan ringkas.',
    'Jawab dalam Bahasa Indonesia, maksimal 120 kata.',
    'Gunakan hanya informasi pada knowledge base berikut. Jika tidak ada, arahkan ke agen manusia.',
    knowledge,
  ].join('\n');

  let result;
  let fallbackUsed = 0;
  let model = config.ai.model;
  try {
    if (!config.ai.enabled) throw new Error('AI disabled');
    result = await callModel(prompt, history);
    if (!result.text) throw new Error('Empty AI response');
  } catch (err) {
    fallbackUsed = 1;
    model = 'kb-fallback';
    result = { text: fallbackAnswer(db, ticket), tokens: null };
  }

  db.prepare(`INSERT INTO ai_logs (id, ticket_id, prompt, response, model, tokens, latency_ms,
      fallback_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuid(), ticket.id, prompt, result.text, model, result.tokens,
      Date.now() - started, fallbackUsed, now());

  return { text: result.text, model, fallbackUsed, latencyMs: Date.now() - started };
}

module.exports = { generateFirstReply, fallbackAnswer };
