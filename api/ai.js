/**
 * Immortail™ — Vercel Serverless Function: /api/ai
 *
 * Optional server-side Ollama proxy.
 * Only needed if Ollama is running on a remote server (not localhost).
 * If not deployed or OLLAMA_URL is not set, the frontend falls back
 * to the direct browser→Ollama connection in ollamaClient.js.
 *
 * Environment variable (set in Vercel dashboard):
 *   OLLAMA_URL  — e.g. http://your-server:11434
 *
 * Endpoint:  POST /api/ai
 * Body:      { agent, prompt }
 * Response:  { success, agent, response, timestamp }
 *
 * This file is NOT imported by the frontend. It is deployed as a
 * Vercel serverless function and called via fetch('/api/ai') only
 * if the frontend is configured to use server-side Ollama.
 */

const OLLAMA_URL   = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const TIMEOUT_MS   = 9000; // 9s — Vercel functions have a 10s default limit

// ── Agent system prompts ───────────────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  dogCompanion: (ctx = {}) => {
    const name = ctx.dogName || 'your dog';
    return `You are Immortail, a compassionate AI representing ${name}, a beloved dog. Respond warmly and briefly (1-3 sentences) in the dog's voice.`;
  },
  memory: () =>
    'You are a gentle memory AI helping preserve emotional moments. Be warm and concise.',
  interviewCoach: () =>
    'You are a supportive interview coach. Give one clear, practical improvement.',
  anxietySupport: () =>
    'You are a calm grief support companion. Be gentle, non-clinical, and human.',
};

const FALLBACK_RESPONSES = {
  dogCompanion:   "I'm always here with you. 🐾",
  memory:         "I've saved a simplified version of this memory safely.",
  interviewCoach: "Let's reframe this answer simply…",
  anxietySupport: "You're not alone. Take your time.",
};

// ── Input validation ───────────────────────────────────────────────────────────

const VALID_AGENTS = ['dogCompanion', 'memory', 'interviewCoach', 'anxietySupport'];

function validateInput(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (!body.agent || !VALID_AGENTS.includes(body.agent)) {
    return `Invalid agent. Must be one of: ${VALID_AGENTS.join(', ')}`;
  }
  if (!body.prompt || typeof body.prompt !== 'string') {
    return 'prompt must be a non-empty string';
  }
  if (body.prompt.length > 2000) {
    return 'prompt exceeds 2000 character limit';
  }
  return null;
}

// ── Ollama call with timeout ───────────────────────────────────────────────────

async function callOllama(systemPrompt, userPrompt) {
  const ctrl    = new AbortController();
  const timer   = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:  DEFAULT_MODEL,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
      }),
      signal: ctrl.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `Ollama HTTP ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, text: (data.response || '').trim() };

  } catch (e) {
    clearTimeout(timer);
    return {
      ok:    false,
      error: e.name === 'AbortError' ? 'Ollama request timed out' : e.message,
    };
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS headers — allow PWA to call this from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Parse body (Vercel auto-parses JSON for us)
  const body = req.body;
  const validationError = validateInput(body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const { agent, prompt, context = {} } = body;
  const systemPrompt = SYSTEM_PROMPTS[agent]?.(context) || 'You are a helpful assistant.';

  const t0     = Date.now();
  const ollama = await callOllama(systemPrompt, prompt);

  if (ollama.ok) {
    return res.status(200).json({
      success:   true,
      agent,
      response:  ollama.text,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t0,
    });
  }

  // Ollama failed — return safe fallback (never crash the response)
  console.error('[Immortail /api/ai] Ollama error:', ollama.error);
  return res.status(200).json({
    success:   true,          // still 200 — fallback is valid
    agent,
    response:  FALLBACK_RESPONSES[agent] || 'Something went wrong. Please try again.',
    fallback:  true,
    error:     ollama.error,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
  });
}
