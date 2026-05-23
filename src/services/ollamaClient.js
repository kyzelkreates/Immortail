/**
 * Immortail™ — Ollama Client
 * Browser-side interface to a locally running Ollama instance.
 *
 * Also supports any OpenAI-compatible endpoint (LM Studio, GPT4All, Jan, etc.)
 * via the generate() / generateOpenAI() split.
 *
 * Architecture:
 *   Browser → fetch → Local AI runtime (Ollama / LM Studio / GPT4All / Jan / Open WebUI)
 *
 * Constraints:
 *   - No server required — runs entirely in the browser
 *   - Max 2 retries per request
 *   - Hard 8 second timeout per attempt
 *   - Never throws — always returns { success, output, error }
 *   - All config is read from AppSettings (storage.js)
 */

import { AppSettings } from '../core/storage.js';

// ─── Config readers (read from settings, not hardcoded) ───────────────────────

const TIMEOUT_MS  = 8000;
const MAX_RETRIES = 2;

/** Get the base URL for the currently active provider. */
function getProviderConfig() {
  const s = AppSettings.get();
  const provider = s.aiProvider || 'offline';
  const model    = s.aiModel || '';

  switch (provider) {
    case 'ollama':     return { type: 'ollama',    base: s.ollamaUrl    || 'http://localhost:11434', model: model || 'llama3',     apiKey: '' };
    case 'lmstudio':   return { type: 'openai',    base: s.lmstudioUrl  || 'http://localhost:1234/v1',  model: model || 'local-model', apiKey: '' };
    case 'gpt4all':    return { type: 'openai',    base: s.gpt4allUrl   || 'http://localhost:4891/v1',  model: model || 'mistral-7b-instruct', apiKey: '' };
    case 'jan':        return { type: 'openai',    base: s.janUrl       || 'http://localhost:1337/v1',  model: model || 'mistral-ins-7b-q4', apiKey: '' };
    case 'openwebui':  return { type: 'ollama',    base: s.openwebuiUrl || 'http://localhost:3000',     model: model || 'llama3',     apiKey: '' };
    case 'custom':     return { type: 'openai',    base: s.customAiUrl  || '',                          model: model || 'local-model', apiKey: s.customAiKey || '' };
    default:           return { type: 'offline',   base: '',                                            model: '',                   apiKey: '' };
  }
}

// ─── Connectivity check ───────────────────────────────────────────────────────

let _pingCache = {};          // { [base]: { ok, ts } }
const PING_TTL = 30000;

/**
 * isProviderAvailable() — lightweight connectivity probe for current provider.
 * Returns { available: boolean, latencyMs: number, provider: string }.
 */
export async function isProviderAvailable() {
  const { type, base, model } = getProviderConfig();

  if (type === 'offline' || !base) {
    return { available: false, latencyMs: 0, provider: 'offline' };
  }

  const now = Date.now();
  const cached = _pingCache[base];
  if (cached && now - cached.ts < PING_TTL) {
    return { available: cached.ok, latencyMs: 0, provider: type };
  }

  const t0 = performance.now();
  try {
    // Ollama: GET /api/tags  |  OpenAI-compat: GET /models
    const pingUrl = type === 'ollama' ? `${base}/api/tags` : `${base}/models`;
    const res     = await fetchWithTimeout(pingUrl, {}, 3000);
    const ok      = res.ok;
    _pingCache[base] = { ok, ts: Date.now() };
    return { available: ok, latencyMs: Math.round(performance.now() - t0), provider: type };
  } catch {
    _pingCache[base] = { ok: false, ts: Date.now() };
    return { available: false, latencyMs: 0, provider: type };
  }
}

// Keep backward-compat alias used by agentOrchestrator.js
export const isOllamaAvailable = isProviderAvailable;

/** Invalidate ping cache (call after user changes provider/URL in settings). */
export function resetOllamaCache() {
  _pingCache = {};
}

// ─── List available models for current provider ───────────────────────────────

/**
 * listModels() — returns installed model names for the current provider.
 * Returns [] if provider is offline or unreachable.
 */
export async function listModels() {
  const { type, base, apiKey } = getProviderConfig();
  if (type === 'offline' || !base) return [];

  try {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const url     = type === 'ollama' ? `${base}/api/tags` : `${base}/models`;
    const res     = await fetchWithTimeout(url, { headers }, TIMEOUT_MS);
    if (!res.ok) return [];
    const data = await res.json();

    if (type === 'ollama') {
      return (data.models || []).map(m => m.name);
    }
    // OpenAI-compat
    return (data.data || []).map(m => m.id);
  } catch {
    return [];
  }
}

// ─── Core generate ────────────────────────────────────────────────────────────

/**
 * generate(prompt, options) — send a prompt to the configured provider.
 *
 * Options:
 *   system  {string}  — system prompt
 *   model   {string}  — override model (else uses settings.aiModel or provider default)
 *
 * Returns: { success, output, model, provider, durationMs, error }
 */
export async function generate(prompt, { system = '', model: modelOverride = '' } = {}) {
  const cfg = getProviderConfig();

  if (cfg.type === 'offline' || !cfg.base) {
    return offline();
  }

  const model = modelOverride || cfg.model;
  const t0    = performance.now();

  if (cfg.type === 'ollama') {
    return generateOllama({ base: cfg.base, model, prompt, system, t0 });
  } else {
    return generateOpenAI({ base: cfg.base, model, prompt, system, apiKey: cfg.apiKey, t0 });
  }
}

// ─── Ollama generate ──────────────────────────────────────────────────────────

async function generateOllama({ base, model, prompt, system, t0 }) {
  const body = JSON.stringify({
    model,
    prompt: system ? `${system}\n\n${prompt}` : prompt,
    stream: false,
  });

  let lastError = 'Unknown error';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${base}/api/generate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
        TIMEOUT_MS,
      );
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
      const data   = await res.json();
      return ok(data.response?.trim() || '', model, 'ollama', t0);
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'Request timed out' : e.message;
      if (attempt < MAX_RETRIES) await sleep(500 * (attempt + 1));
    }
  }
  return err(lastError, model, 'ollama', t0);
}

// ─── OpenAI-compatible generate (LM Studio, GPT4All, Jan, Custom) ─────────────

async function generateOpenAI({ base, model, prompt, system, apiKey, t0 }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body    = JSON.stringify({ model, messages, stream: false });
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let lastError = 'Unknown error';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${base}/chat/completions`,
        { method: 'POST', headers, body },
        TIMEOUT_MS,
      );
      if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      return ok(text, model, 'openai-compat', t0);
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'Request timed out' : e.message;
      if (attempt < MAX_RETRIES) await sleep(500 * (attempt + 1));
    }
  }
  return err(lastError, model, 'openai-compat', t0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function offline() {
  return { success: false, output: null, model: null, provider: 'offline', durationMs: 0, error: 'Provider set to offline' };
}
function ok(output, model, provider, t0) {
  return { success: true, output, model, provider, durationMs: Math.round(performance.now() - t0), error: null };
}
function err(error, model, provider, t0) {
  return { success: false, output: null, model, provider, durationMs: Math.round(performance.now() - t0), error };
}
function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
