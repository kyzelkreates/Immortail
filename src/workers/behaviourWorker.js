/**
 * Immortail™ — Local AI Behaviour Orchestrator Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs entirely in a Web Worker — zero UI thread cost.
 * Drives the dog's emotional state machine, personality memory,
 * and behaviour scheduling. No cloud. No external APIs.
 *
 * Message protocol:
 *   IN:  { type, id, payload }
 *   OUT: { type, id, result }
 *
 * Supported types:
 *   INIT            — initialise with personality config + stored memory
 *   TICK            — advance behaviour clock (call ~every 500ms)
 *   INTERACTION     — user performed an interaction
 *   SOUND_PLAYED    — a sound was played (ear/head reaction)
 *   MEMORY_MOMENT   — a memory moment surfaced
 *   GET_STATE       — get current emotional state snapshot
 *   GET_PERSONALITY — get current learned personality weights
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const EMOTIONAL_STATES = {
  RELAXED:      'relaxed',
  PLAYFUL:      'playful',
  SLEEPY:       'sleepy',
  EXCITED:      'excited',
  CURIOUS:      'curious',
  AFFECTIONATE: 'affectionate',
  ALERT:        'alert',
  PEACEFUL:     'peaceful',
};

// Maps emotional state → dog renderer state (for VirtualDog)
const EMOTIONAL_TO_DOG_STATE = {
  relaxed:      'idle',
  playful:      'playing',
  sleepy:       'sleeping',
  excited:      'excited',
  curious:      'listening',
  affectionate: 'happy',
  alert:        'listening',
  peaceful:     'sitting',
};

// How long (ms) to stay in a state before reconsidering
const STATE_MIN_DURATION = {
  relaxed:      8000,
  playful:      5000,
  sleepy:       15000,
  excited:      3000,
  curious:      4000,
  affectionate: 6000,
  alert:        3000,
  peaceful:     10000,
};

// ─── Behaviour engine state ────────────────────────────────────────────────────
let personality = {
  // Weights 0–1, updated by interaction history
  playfulness:   0.5,
  calmness:      0.5,
  affection:     0.5,
  curiosity:     0.5,
  alertness:     0.4,
  // Interaction counts (raw)
  petCount:      0,
  playCount:     0,
  bedtimeCount:  0,
  soundCount:    0,
  callCount:     0,
};

let emotionalState = EMOTIONAL_STATES.RELAXED;
let stateEnteredAt = Date.now();
let lastInteractAt = Date.now();
let tickCount      = 0;
let hourOfDay      = new Date().getHours();

// Weighted candidates for next state selection
let pendingReaction = null; // { state, duration, reason } — set by interactions

// ─── Message handler ───────────────────────────────────────────────────────────
self.onmessage = (e) => {
  const { type, id, payload } = e.data;

  try {
    switch (type) {
      case 'INIT': {
        const { config, storedPersonality, hour } = payload || {};
        if (hour !== undefined) hourOfDay = hour;

        // Restore stored personality weights
        if (storedPersonality) {
          Object.assign(personality, storedPersonality);
        }
        // Apply personality config from dogConfig
        if (config?.personality) {
          applyConfigPersonality(config.personality);
        }
        // Set initial emotional state based on time
        emotionalState = deriveInitialState(hourOfDay, personality);
        stateEnteredAt = Date.now();

        self.postMessage({ type: 'INIT_DONE', id, result: getSnapshot() });
        break;
      }

      case 'TICK': {
        tickCount++;
        hourOfDay = new Date().getHours();
        const inactiveMs = Date.now() - lastInteractAt;
        const snapshot = advanceBehaviour(inactiveMs);
        self.postMessage({ type: 'TICK_RESULT', id, result: snapshot });
        break;
      }

      case 'INTERACTION': {
        const { interactionType, timestamp } = payload;
        lastInteractAt = timestamp || Date.now();
        pendingReaction = handleInteraction(interactionType);
        // Update personality learning
        learnFromInteraction(interactionType);
        self.postMessage({ type: 'INTERACTION_RESULT', id, result: {
          newState: pendingReaction?.state || emotionalState,
          personality: getPersonalitySnapshot(),
        }});
        break;
      }

      case 'SOUND_PLAYED': {
        // Dog hears a sound → alert/curious
        pendingReaction = {
          state:    EMOTIONAL_STATES.ALERT,
          duration: 2500,
          reason:   'sound',
        };
        personality.soundCount = (personality.soundCount || 0) + 1;
        learnFromInteraction('sound');
        self.postMessage({ type: 'SOUND_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'MEMORY_MOMENT': {
        // A memory surfaced → affectionate/peaceful
        pendingReaction = {
          state:    personality.calmness > 0.6
            ? EMOTIONAL_STATES.PEACEFUL
            : EMOTIONAL_STATES.AFFECTIONATE,
          duration: 7000,
          reason:   'memory',
        };
        self.postMessage({ type: 'MEMORY_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'GET_STATE': {
        self.postMessage({ type: 'STATE_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'GET_PERSONALITY': {
        self.postMessage({ type: 'PERSONALITY_RESULT', id, result: getPersonalitySnapshot() });
        break;
      }

      default:
        self.postMessage({ type: 'ERROR', id, error: `Unknown: ${type}` });
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', id, error: err.message });
  }
};

// ─── Core behaviour advancement ────────────────────────────────────────────────
function advanceBehaviour(inactiveMs) {
  const now     = Date.now();
  const inState = now - stateEnteredAt;

  // If a pending reaction is queued, apply it
  if (pendingReaction) {
    const r = pendingReaction;
    pendingReaction = null;
    emotionalState = r.state;
    stateEnteredAt = now;
    return getSnapshot();
  }

  // Inactivity progression
  if (inactiveMs > 10 * 60 * 1000) {
    // 10 min → sleepy
    if (emotionalState !== EMOTIONAL_STATES.SLEEPY) {
      emotionalState = EMOTIONAL_STATES.SLEEPY;
      stateEnteredAt = now;
    }
    return getSnapshot();
  }
  if (inactiveMs > 3 * 60 * 1000 && emotionalState === EMOTIONAL_STATES.EXCITED) {
    emotionalState = EMOTIONAL_STATES.RELAXED;
    stateEnteredAt = now;
    return getSnapshot();
  }

  // Time-of-day baseline
  const nighttime = hourOfDay >= 21 || hourOfDay < 7;
  if (nighttime && inState > STATE_MIN_DURATION[emotionalState] * 1.5) {
    const nightStates = [EMOTIONAL_STATES.SLEEPY, EMOTIONAL_STATES.PEACEFUL, EMOTIONAL_STATES.RELAXED];
    if (!nightStates.includes(emotionalState)) {
      emotionalState = weightedRandom([
        { v: EMOTIONAL_STATES.SLEEPY,   w: personality.calmness      * 0.6 },
        { v: EMOTIONAL_STATES.PEACEFUL, w: personality.calmness      * 0.3 },
        { v: EMOTIONAL_STATES.RELAXED,  w: 0.2 },
      ]);
      stateEnteredAt = now;
      return getSnapshot();
    }
  }

  // Minimum state duration not met — stay in state
  if (inState < STATE_MIN_DURATION[emotionalState]) {
    return getSnapshot();
  }

  // Organic state selection based on personality weights
  emotionalState = selectNextState(emotionalState, personality, hourOfDay);
  stateEnteredAt = now;
  return getSnapshot();
}

// ─── State selection ───────────────────────────────────────────────────────────
function selectNextState(current, p, hour) {
  const morning  = hour >= 7  && hour < 12;
  const evening  = hour >= 17 && hour < 21;
  const night    = hour >= 21 || hour < 7;

  // Weighted candidates — personality-driven
  const candidates = [
    { v: EMOTIONAL_STATES.RELAXED,      w: p.calmness      * 0.8 + 0.2 },
    { v: EMOTIONAL_STATES.CURIOUS,      w: p.curiosity     * 0.7 + (morning ? 0.15 : 0) },
    { v: EMOTIONAL_STATES.PLAYFUL,      w: p.playfulness   * 0.6 + (morning ? 0.1 : 0) },
    { v: EMOTIONAL_STATES.AFFECTIONATE, w: p.affection     * 0.5 },
    { v: EMOTIONAL_STATES.PEACEFUL,     w: p.calmness      * 0.4 + (evening ? 0.2 : 0) },
    { v: EMOTIONAL_STATES.SLEEPY,       w: night ? 0.5 : (p.calmness * 0.1) },
    { v: EMOTIONAL_STATES.ALERT,        w: p.alertness     * 0.2 },
  ];

  // Prevent immediate repetition
  const filtered = candidates.filter(c => c.v !== current);
  // Add small random noise for organic variety
  filtered.forEach(c => { c.w += Math.random() * 0.08; });
  return weightedRandom(filtered) || EMOTIONAL_STATES.RELAXED;
}

// ─── Interaction handlers ──────────────────────────────────────────────────────
function handleInteraction(type) {
  const reactions = {
    pet:       { state: EMOTIONAL_STATES.AFFECTIONATE, duration: 5000 },
    throw_toy: { state: EMOTIONAL_STATES.EXCITED,      duration: 4000 },
    call:      { state: EMOTIONAL_STATES.ALERT,        duration: 3000 },
    reward:    { state: EMOTIONAL_STATES.EXCITED,      duration: 4000 },
    cuddle:    { state: EMOTIONAL_STATES.AFFECTIONATE, duration: 6000 },
    bedtime:   { state: EMOTIONAL_STATES.SLEEPY,       duration: 0    },
    play:      { state: EMOTIONAL_STATES.PLAYFUL,      duration: 5000 },
    tap:       {
      state: personality.affection > 0.6
        ? EMOTIONAL_STATES.AFFECTIONATE
        : EMOTIONAL_STATES.CURIOUS,
      duration: 3000,
    },
  };
  return reactions[type] || { state: EMOTIONAL_STATES.CURIOUS, duration: 2500 };
}

// ─── Personality learning ──────────────────────────────────────────────────────
function learnFromInteraction(type) {
  const LEARN_RATE = 0.02; // subtle — prevents rapid personality swings
  const MAX_W      = 0.95;
  const MIN_W      = 0.1;

  const clamp = (v) => Math.min(MAX_W, Math.max(MIN_W, v));

  switch (type) {
    case 'pet':
    case 'cuddle':
      personality.affection  = clamp(personality.affection  + LEARN_RATE);
      personality.calmness   = clamp(personality.calmness   + LEARN_RATE * 0.5);
      personality.petCount   = (personality.petCount || 0) + 1;
      break;
    case 'play':
    case 'throw_toy':
      personality.playfulness = clamp(personality.playfulness + LEARN_RATE);
      personality.alertness   = clamp(personality.alertness   + LEARN_RATE * 0.5);
      personality.playCount   = (personality.playCount || 0) + 1;
      break;
    case 'bedtime':
      personality.calmness    = clamp(personality.calmness   + LEARN_RATE);
      personality.bedtimeCount= (personality.bedtimeCount || 0) + 1;
      break;
    case 'call':
      personality.alertness   = clamp(personality.alertness  + LEARN_RATE);
      personality.curiosity   = clamp(personality.curiosity  + LEARN_RATE * 0.5);
      personality.callCount   = (personality.callCount || 0) + 1;
      break;
    case 'sound':
      personality.alertness   = clamp(personality.alertness  + LEARN_RATE * 0.3);
      personality.soundCount  = (personality.soundCount || 0) + 1;
      break;
    case 'reward':
      personality.affection   = clamp(personality.affection  + LEARN_RATE * 0.5);
      personality.playfulness = clamp(personality.playfulness+ LEARN_RATE * 0.5);
      break;
  }

  // Natural drift back toward 0.5 for unused traits (very slow)
  const DRIFT = 0.001;
  Object.keys(personality).forEach(k => {
    if (typeof personality[k] === 'number' && k !== 'petCount' &&
        !k.endsWith('Count')) {
      if (personality[k] > 0.5) personality[k] = Math.max(0.5, personality[k] - DRIFT);
      else personality[k] = Math.min(0.5, personality[k] + DRIFT);
    }
  });
}

// ─── Initial state from time + personality ─────────────────────────────────────
function deriveInitialState(hour, p) {
  if (hour >= 21 || hour < 6)  return EMOTIONAL_STATES.SLEEPY;
  if (hour >= 6  && hour < 9)  return p.playfulness > 0.5 ? EMOTIONAL_STATES.PLAYFUL : EMOTIONAL_STATES.CURIOUS;
  if (hour >= 9  && hour < 17) return EMOTIONAL_STATES.RELAXED;
  if (hour >= 17 && hour < 21) return p.affection > 0.5 ? EMOTIONAL_STATES.AFFECTIONATE : EMOTIONAL_STATES.PEACEFUL;
  return EMOTIONAL_STATES.RELAXED;
}

// ─── Config application ────────────────────────────────────────────────────────
function applyConfigPersonality(config) {
  const map = {
    'fast':   { playfulness: 0.7, alertness: 0.6 },
    'slow':   { calmness:    0.7, playfulness: 0.3 },
    'high':   { playfulness: 0.75, curiosity:  0.65 },
    'low':    { calmness:    0.75, playfulness: 0.25 },
    'strong': { affection:   0.8  },
    'curious':{ curiosity:   0.75, alertness:  0.55 },
  };
  const ws = config.tailWagSpeed    || 'medium';
  const ef = config.excitementFreq  || 'medium';
  const cr = config.cuddleResponse  || 'normal';
  const ar = config.alertResponse   || 'normal';
  [map[ws], map[ef], map[cr], map[ar]].forEach(patch => {
    if (patch) Object.assign(personality, patch);
  });
}

// ─── Snapshots ─────────────────────────────────────────────────────────────────
function getSnapshot() {
  return {
    emotionalState,
    dogState: EMOTIONAL_TO_DOG_STATE[emotionalState] || 'idle',
    personality: getPersonalitySnapshot(),
    tickCount,
    timestamp: Date.now(),
  };
}

function getPersonalitySnapshot() {
  return { ...personality };
}

// ─── Weighted random ───────────────────────────────────────────────────────────
function weightedRandom(items) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.w, 0);
  if (total <= 0) return items[0].v;
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.w;
    if (rand <= 0) return item.v;
  }
  return items[items.length - 1].v;
}
