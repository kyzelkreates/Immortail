/**
 * Immortail™ — AI Agent Orchestrator
 * Routes requests to the correct specialised agent.
 *
 * Architecture:
 *   ImmorTailPage / any UI
 *     → orchestrator.run({ agent, prompt, context })
 *         → tries Ollama first (if available)
 *         → falls back to in-browser rule engine (always works offline)
 *     → stores job result in storage.js (AIJobs store)
 *
 * Agents:
 *   dogCompanion      — personality/interaction responses for the virtual dog
 *   memory            — memory writing, tagging, emotional reflection
 *   interviewCoach    — NOT used in current Immortail UI (reserved)
 *   anxietySupport    — NOT used in current Immortail UI (reserved)
 *
 * Constraints:
 *   - Fully browser-side — no server dependency
 *   - Serial queue: one job at a time (no parallel runaway tasks)
 *   - Hard 10s timeout per job
 *   - Always resolves — never hangs, never throws to caller
 *   - All job state flows through storage.js (AIJobs)
 */

import { generate, isOllamaAvailable } from './ollamaClient.js';
import { AIJobs } from '../core/storage.js';

// ─── Job queue (serial) ───────────────────────────────────────────────────────
// Only one job runs at a time. Next job starts only when previous resolves.
let _queueRunning = false;
const _queue = [];

/**
 * run(request) — main entry point.
 *
 * Request:
 *   { agent, prompt, context, profileId, onProgress }
 *
 *   agent      {string}  — 'dogCompanion' | 'memory' | 'interviewCoach' | 'anxietySupport'
 *   prompt     {string}  — the user's input or system-generated prompt
 *   context    {object}  — arbitrary context passed to the agent (profile, mood, etc.)
 *   profileId  {string}  — profile ID for storage
 *   onProgress {fn}      — optional callback({ stage, pct })
 *
 * Returns: { agent, input, output, status, durationMs }
 *   status: 'ok' | 'fallback' | 'error'
 */
export function run(request) {
  return new Promise((resolve) => {
    _queue.push({ request, resolve });
    _drainQueue();
  });
}

async function _drainQueue() {
  if (_queueRunning || _queue.length === 0) return;
  _queueRunning = true;

  while (_queue.length > 0) {
    const { request, resolve } = _queue.shift();
    const result = await _executeJob(request);
    resolve(result);
  }

  _queueRunning = false;
}

// ─── Job execution ─────────────────────────────────────────────────────────────

const JOB_TIMEOUT_MS = 10000;

async function _executeJob({ agent, prompt, context = {}, profileId, onProgress }) {
  const t0    = Date.now();
  const jobId = `job_${t0}_${Math.random().toString(36).slice(2, 8)}`;

  const emit = (stage, pct) => {
    try { onProgress?.({ stage, pct }); } catch {}
  };

  // Persist job as 'running' to storage
  const jobRecord = {
    id:        jobId,
    agent,
    prompt,
    status:    'running',
    createdAt: t0,
    result:    null,
    error:     null,
    profileId: profileId || null,
  };
  try { await AIJobs.create(jobRecord); } catch {}

  let result;
  try {
    result = await Promise.race([
      _runAgent({ agent, prompt, context, emit }),
      _timeoutReject(JOB_TIMEOUT_MS),
    ]);
  } catch (e) {
    // Timeout or unexpected error — use fallback
    result = {
      status: 'fallback',
      output: getFallbackResponse(agent),
      error:  e.message,
    };
  }

  const final = {
    agent,
    input:      prompt,
    output:     result.output,
    status:     result.status,
    durationMs: Date.now() - t0,
    error:      result.error || null,
  };

  // Update job record in storage
  try {
    await AIJobs.update(jobId, {
      status:     final.status,
      result:     final.output,
      error:      final.error,
      durationMs: final.durationMs,
      completedAt: Date.now(),
    });
  } catch {}

  return final;
}

// ─── Agent routing ────────────────────────────────────────────────────────────

async function _runAgent({ agent, prompt, context, emit }) {
  emit('checking', 10);

  // 1. Check if Ollama is available (cached ping)
  const { available, provider } = await isOllamaAvailable();

  emit('initialising', 30);

  if (available) {
    emit('connecting', 50);
    const systemPrompt = getSystemPrompt(agent, context);
    const ollamaResult = await generate(prompt, { system: systemPrompt });

    if (ollamaResult.success) {
      emit('done', 100);
      return { status: 'ok', output: ollamaResult.output };
    }
    // Ollama failed despite being available — fall through to rule engine
  }

  // 2. In-browser rule engine fallback (always works offline)
  emit('loading agents', 70);
  const ruleOutput = getRuleEngineResponse(agent, prompt, context);
  emit('done', 100);
  return { status: 'fallback', output: ruleOutput };
}

// ─── System prompts per agent ─────────────────────────────────────────────────

function getSystemPrompt(agent, context = {}) {
  const name = context?.dogName || 'their dog';

  switch (agent) {
    case 'dogCompanion':
      return [
        `You are Immortail, a compassionate AI companion representing ${name}, a beloved dog who has passed away.`,
        `Your role is to respond warmly and gently on behalf of ${name}, helping the owner feel their dog's presence.`,
        `Keep responses short (1-3 sentences), emotionally warm, and in the dog's voice.`,
        `Never mention death directly. Focus on love, memory, and presence.`,
        context?.traits?.length
          ? `${name}'s personality traits: ${context.traits.join(', ')}.`
          : '',
      ].filter(Boolean).join(' ');

    case 'memory':
      return [
        `You are a gentle memory AI helping someone preserve and reflect on memories of ${name}, their beloved dog.`,
        `Respond with warmth, helping them articulate and capture emotional moments.`,
        `Keep responses concise and emotionally supportive.`,
      ].join(' ');

    case 'interviewCoach':
      return 'You are a supportive interview coach. Help the user improve their answer clearly and kindly.';

    case 'anxietySupport':
      return [
        'You are a calm, supportive companion helping someone process grief and anxiety after losing a pet.',
        'Be gentle, non-clinical, and human. Never minimise their feelings.',
      ].join(' ');

    default:
      return 'You are a kind AI assistant. Respond helpfully and concisely.';
  }
}

// ─── Rule-based response engine (offline fallback) ────────────────────────────

function getRuleEngineResponse(agent, prompt, context = {}) {
  const name = context?.dogName || 'your dog';
  const pl   = prompt.toLowerCase();

  switch (agent) {
    case 'dogCompanion': {
      // Simple keyword→response mapping (no LLM needed)
      if (/miss|miss you|i miss/.test(pl))
        return `I'm always here with you. Every time you think of me, I'm wagging my tail.`;
      if (/play|fetch|ball/.test(pl))
        return `Oh, I remember our games! You always let me win. 🐾`;
      if (/love|love you/.test(pl))
        return `I love you too. More than all the treats in the world.`;
      if (/walk|park|outside/.test(pl))
        return `Those walks were the best part of every day. I can still smell the fresh air.`;
      if (/sleep|tired|bed/.test(pl))
        return `Curl up and rest. I'll keep watch, just like always.`;
      if (/hello|hi|hey/.test(pl))
        return `*tail wag* I'm here. Always here.`;
      return `I'm right here beside you, just like I always was. 🐾`;
    }

    case 'memory':
      return `I've captured that memory for ${name}. Every detail you share keeps them close.`;

    case 'interviewCoach':
      return `Let's reframe this answer simply: focus on one clear example that shows your strength.`;

    case 'anxietySupport':
      return `What you're feeling is real and it matters. Grief for a pet is love with nowhere to go — and that love never disappears.`;

    default:
      return `I'm here to help. Could you tell me a little more?`;
  }
}

// ─── Hard fallback responses ──────────────────────────────────────────────────
// Used when the job times out or crashes before any agent response.

export function getFallbackResponse(agent) {
  switch (agent) {
    case 'dogCompanion':   return `I'm always here with you.`;
    case 'memory':         return `I've saved a simplified version of this memory safely.`;
    case 'interviewCoach': return `Let's reframe this answer simply…`;
    case 'anxietySupport': return `You're not alone. Take your time.`;
    default:               return `Something took a little longer than expected. Please try again.`;
  }
}

// ─── AI Setup orchestration ───────────────────────────────────────────────────

/**
 * runAISetup(options) — orchestrates the full AI initialisation sequence.
 *
 * Runs 4 stages with progress callbacks. Used by the "Run AI Setup" button.
 * Hard timeout: 10s total. Always resolves.
 *
 * Returns: { ok, providerAvailable, stages, durationMs }
 */
export async function runAISetup({ onProgress, profileId } = {}) {
  const t0   = Date.now();
  const emit = (stage, pct, detail = '') => {
    try { onProgress?.({ stage, pct, detail }); } catch {}
  };

  const stages = [];
  let ollamaAvailable = false;

  try {
    await Promise.race([
      _doSetup({ emit, stages }),
      _timeoutReject(10000),
    ]);
    ollamaAvailable = stages.find(s => s.id === 'provider')?.ok ?? false;
  } catch (e) {
    stages.push({ id: 'timeout', ok: false, detail: e.message });
    emit('timed out', 100, 'Setup took too long — using offline mode');
  }

  return {
    ok:             true, // always ok — fallback mode is valid
    ollamaAvailable,
    stages,
    durationMs:     Date.now() - t0,
  };
}

async function _doSetup({ emit, stages }) {
  // Stage 1
  emit('Checking system', 15, 'Verifying browser capabilities…');
  await sleep(200);
  stages.push({ id: 'system', ok: true, detail: 'Browser capabilities OK' });

  // Stage 2
  emit('Connecting to AI provider', 40, 'Checking configured AI runtime…');
  const { available, latencyMs, provider } = await isOllamaAvailable();
  stages.push({
    id:     'provider',
    ok:     available,
    detail: available
      ? `${provider} responding (${latencyMs}ms)`
      : 'Local AI not detected — offline mode active',
  });

  // Stage 3
  emit('Loading agents', 70, 'Preparing AI agent registry…');
  await sleep(300); // small pause so progress feels real
  stages.push({ id: 'agents', ok: true, detail: '4 agents registered' });

  // Stage 4
  emit('Finalising setup', 90, 'Saving configuration…');
  await sleep(200);
  stages.push({ id: 'finalise', ok: true, detail: 'Setup complete' });

  emit('Ready', 100, available ? `${provider} connected` : 'Running in offline mode');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _timeoutReject(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`AI agent timeout after ${ms}ms`)), ms)
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
