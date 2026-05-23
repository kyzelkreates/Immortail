/**
 * Immortail™ — Ollama Client
 * Browser-side interface to a locally running Ollama instance.
 *
 * Architecture:
 *   Browser → fetch → Ollama (localhost:11434)
 *
 * This is OPTIONAL. If Ollama is not running, every call resolves to
 * { success: false, output: null, error: 'Ollama not available' }
 * and the caller falls back to the in-browser AI engine (aiEngine.js).
 *
 * Constraints:
 *   - No server required — runs entirely in the browser
 *   - Max 2 retries per request
 *   - Hard 8 second timeout per attempt
 *   - Never throws — always returns { success, output, error }
 *   - Fully local-first: storage.js is the only persistence layer
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const OLLAMA_BASE  = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3';
const TIMEOUT_MS   = 8000;
const MAX_RETRIES  = 2;

// ─── Connectivity check ───────────────────────────────────────────────────────

let _lastPingMs   = 0;
let _lastPingOk   = null;
const PING_TTL_MS = 30000; // re-check at most every 30s

/**
 * isOllamaAvailable() — lightweight connectivity probe.
 * Uses a short-TTL cache so it is not called on every request.
 * Returns { available: boolean, latencyMs: number }.
 */
export async function isOllamaAvailable() {
  const now = Date.now();
  if (_lastPingOk !== null && now - _lastPingMs < PING_TTL_MS) {
    return { available: _lastPingOk, latencyMs: 0 };
  }

  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(`${OLLAMA_BASE}/api/tags`, {}, 3000);
    const ok  = res.ok;
    _lastPingMs  = Date.now();
    _lastPingOk  = ok;
    return { available: ok, latencyMs: Math.round(performance.now() - t0) };
  } catch {
    _lastPingMs  = Date.now();
    _lastPingOk  = false;
    return { available: false, latencyMs: 0 };
  }
}

/**
 * Invalidate the ping cache (call after a user-triggered "retry Ollama").
 */
export function resetOllamaCache() {
  _lastPingMs = 0;
  _lastPingOk = null;
}

// ─── Core request ─────────────────────────────────────────────────────────────

/**
 * generate(prompt, options) — send a prompt to Ollama and get text back.
 *
 * Options:
 *   model     {string}  — default: 'llama3'
 *   system    {string}  — system prompt injected before user prompt
 *   stream    {boolean} — not supported (always false for simplicity)
 *
 * Returns: { success, output, model, durationMs, error }
 */
export async function generate(prompt, {
  model  = DEFAULT_MODEL,
  system = '',
} = {}) {
  const body = JSON.stringify({
    model,
    prompt: system ? `${system}\n\n${prompt}` : prompt,
    stream: false,
  });

  let lastError = 'Unknown error';
  const t0 = performance.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${OLLAMA_BASE}/api/generate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
        TIMEOUT_MS,
      );

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue; // retry
      }

      const data   = await res.json();
      const output = (data.response || '').trim();

      return {
        success:    true,
        output,
        model,
        durationMs: Math.round(performance.now() - t0),
        error:      null,
      };

    } catch (e) {
      lastError = e.name === 'AbortError' ? 'Request timed out' : e.message;
      if (attempt < MAX_RETRIES) {
        // Brief pause before retry
        await sleep(500 * (attempt + 1));
      }
    }
  }

  return {
    success:    false,
    output:     null,
    model,
    durationMs: Math.round(performance.now() - t0),
    error:      lastError,
  };
}

// ─── List available models ────────────────────────────────────────────────────

/**
 * listModels() — returns array of installed Ollama model names.
 * Returns [] if Ollama is not available.
 */
export async function listModels() {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_BASE}/api/tags`, {}, TIMEOUT_MS);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
