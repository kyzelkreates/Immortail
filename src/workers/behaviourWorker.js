/**
 * Immortail™ — Local AI Behaviour Orchestrator Worker  v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs entirely in a Web Worker — zero UI thread cost.
 *
 * MULTI-AGENT ARCHITECTURE (all in one worker, no extra workers):
 *   Agent 1  — Behaviour Orchestrator      (master coordinator, conflict resolver)
 *   Agent 2  — Emotional State Agent       (mood system, 8 states)
 *   Agent 3  — Procedural Movement Agent   (walk/stretch/reposition/posture)
 *   Agent 4  — Sound Reaction Agent        (ear/gaze triggers from sound events)
 *   Agent 5  — Personality Memory Agent    (local learning, privacy-safe)
 *   Agent 6  — Environment Response Agent  (env → behaviour coupling)
 *   Agent 7  — Memory Interpretation Agent (memory → emotional moments)
 *   Agent 8  — Attention & Gaze Agent      (believable eye/head tracking)
 *   Agent 9  — Performance Governor Agent  (throttling, battery safety)
 *   Agent 10 — Companion Presence Agent    (micro-behaviours, ambient feel)
 *
 * Message protocol:
 *   IN:  { type, id, payload }
 *   OUT: { type, id, result }
 *
 * All agents communicate through the orchestrator's shared state object.
 * No agent writes to shared state directly — they return proposals.
 * Orchestrator resolves conflicts via priority weighting.
 *
 * PRESERVED:
 *   - All existing message types (INIT, TICK, INTERACTION, SOUND_PLAYED,
 *     MEMORY_MOMENT, GET_STATE, GET_PERSONALITY)
 *   - All existing result shapes
 *   - All existing personality storage keys
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ── SHARED CONSTANTS ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

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

// Maps emotional state → dog renderer state
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

// Procedural movement states the renderer understands
const MOVEMENT_STATES = {
  IDLE:        'idle',
  WALKING:     'walking',
  SITTING:     'sitting',
  STRETCHING:  'stretching',
  REPOSITION:  'repositioning',
  WAGGING:     'wagging',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── ORCHESTRATOR SHARED STATE ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const state = {
  // Agent 2 — Emotional
  emotionalState:    EMOTIONAL_STATES.RELAXED,
  stateEnteredAt:    Date.now(),
  pendingReaction:   null,   // { state, duration, reason, priority }

  // Agent 3 — Procedural Movement
  movementState:     MOVEMENT_STATES.IDLE,
  movementEnteredAt: Date.now(),
  nextMovementAt:    Date.now() + randomBetween(12000, 35000),
  posXTarget:        0,     // -1..+1 horizontal wander

  // Agent 4 — Sound Reaction
  soundReactionActive: false,
  soundReactionAt:     0,
  soundReactionDir:    0,   // -1 left, 0 centre, +1 right

  // Agent 5 — Personality Memory
  personality: {
    playfulness:  0.5,
    calmness:     0.5,
    affection:    0.5,
    curiosity:    0.5,
    alertness:    0.4,
    petCount:     0,
    playCount:    0,
    bedtimeCount: 0,
    soundCount:   0,
    callCount:    0,
  },

  // Agent 6 — Environment
  currentEnv:    'day',
  envEnteredAt:  Date.now(),

  // Agent 7 — Memory Interpretation
  lastMemoryAt:  0,
  memoryTags:    [],   // from dogConfig

  // Agent 8 — Gaze
  gazeTarget:    { x: 0, y: 0 },   // -1..+1 normalised
  gazeShiftAt:   Date.now(),
  gazeHoldMs:    0,

  // Agent 9 — Performance
  throttleLevel: 0,   // 0=full, 1=medium, 2=low
  tickCount:     0,

  // Agent 10 — Companion Presence
  presenceMicroAt:  0,    // last micro-behaviour timestamp
  breathRhythm:     1.0,  // 0.4=calm, 1.0=normal, 1.8=excited
  idleFidgetAt:     0,

  // Shared timing
  hourOfDay:     new Date().getHours(),
  lastInteractAt: Date.now(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── MESSAGE HANDLER (ORCHESTRATOR ENTRY POINT) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

self.onmessage = (e) => {
  const { type, id, payload } = e.data;
  try {
    switch (type) {

      case 'INIT': {
        const { config, storedPersonality, hour, env } = payload || {};
        if (hour !== undefined) state.hourOfDay = hour;
        if (env)                agentEnvironment.setEnv(env);

        // Agent 5: restore learned personality
        if (storedPersonality) {
          Object.assign(state.personality, storedPersonality);
        }
        // Apply config personality hints
        if (config?.personality) agentPersonality.applyConfig(config.personality);
        // Agent 7: load memory tags
        if (config?.memoryTags)  state.memoryTags = config.memoryTags;

        // Agent 2: initial emotional state
        state.emotionalState  = agentEmotion.deriveInitial(state.hourOfDay, state.personality);
        state.stateEnteredAt  = Date.now();

        // Agent 8: reset gaze
        agentGaze.scheduleShift();

        self.postMessage({ type: 'INIT_DONE', id, result: getSnapshot() });
        break;
      }

      case 'TICK': {
        state.tickCount++;
        state.hourOfDay = new Date().getHours();

        // Performance governor — skip heavy agents on throttle
        const skip = agentPerformance.shouldSkip(state.tickCount, state.throttleLevel);

        const inactiveMs = Date.now() - state.lastInteractAt;
        const now        = Date.now();

        // ── Agent proposals (order = priority) ──────────────────────────────
        let proposal = null;

        // Agent 4: sound reaction (highest temporal priority)
        if (!skip.soundReaction && state.soundReactionActive) {
          const p = agentSound.tick(now);
          if (p) proposal = p;
          if (now - state.soundReactionAt > 3000) state.soundReactionActive = false;
        }

        // Agent 2: emotional state machine
        if (!proposal) {
          proposal = agentEmotion.tick(inactiveMs, now);
        }

        // Agent 3: procedural movement (low-priority, non-conflicting)
        if (!skip.movement) agentMovement.tick(now, state.emotionalState);

        // Agent 8: gaze shifts
        if (!skip.gaze) agentGaze.tick(now);

        // Agent 10: companion presence micro-behaviours
        if (!skip.presence) agentPresence.tick(now, state.emotionalState);

        // Apply emotional proposal
        if (proposal) {
          state.emotionalState = proposal.state;
          state.stateEnteredAt = now;
        }

        self.postMessage({ type: 'TICK_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'INTERACTION': {
        const { interactionType, timestamp, pointerX, pointerY } = payload || {};
        state.lastInteractAt = timestamp || Date.now();

        // Agent 8: gaze toward interaction point
        if (pointerX !== undefined) {
          agentGaze.focusPoint(pointerX, pointerY || 0);
        }

        // Agent 2: emotional reaction
        const reaction = agentEmotion.handleInteraction(interactionType);
        state.pendingReaction = reaction;

        // Agent 5: learning
        agentPersonality.learn(interactionType);

        // Agent 3: movement response (wag on pet/reward)
        agentMovement.reactToInteraction(interactionType);

        self.postMessage({ type: 'INTERACTION_RESULT', id, result: {
          newState:    reaction?.state || state.emotionalState,
          personality: getPersonalitySnapshot(),
          dogState:    EMOTIONAL_TO_DOG_STATE[reaction?.state] || 'idle',
          gazeTarget:  state.gazeTarget,
        }});
        break;
      }

      case 'SOUND_PLAYED': {
        const { timestamp, direction } = payload || {};
        state.soundReactionActive = true;
        state.soundReactionAt     = timestamp || Date.now();
        state.soundReactionDir    = direction ?? (Math.random() > 0.5 ? 0.3 : -0.3);

        // Agent 4: trigger reaction
        state.pendingReaction = agentSound.handleSoundPlayed();
        agentPersonality.learn('sound');

        self.postMessage({ type: 'SOUND_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'MEMORY_MOMENT': {
        // Agent 7: memory surfaced
        const { memoryType, emotionalTags } = payload || {};
        state.lastMemoryAt    = Date.now();
        state.pendingReaction = agentMemory.handleMoment(memoryType, emotionalTags);

        self.postMessage({ type: 'MEMORY_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'ENV_CHANGE': {
        // Agent 6: environment changed
        const { env } = payload || {};
        if (env) {
          agentEnvironment.setEnv(env);
          const envProposal = agentEnvironment.getBehaviourProposal();
          if (envProposal) state.pendingReaction = envProposal;
        }
        self.postMessage({ type: 'ENV_RESULT', id, result: getSnapshot() });
        break;
      }

      case 'POINTER_MOVE': {
        // Agent 8: pointer position for gaze tracking (throttled)
        const { x, y } = payload || {};
        agentGaze.trackPointer(x, y);
        // No postMessage — fire-and-forget, no reply needed
        break;
      }

      case 'PERFORMANCE_UPDATE': {
        // Agent 9: external FPS report
        const { fps, isLowPower } = payload || {};
        state.throttleLevel = agentPerformance.updateThrottle(fps, isLowPower);
        self.postMessage({ type: 'PERF_RESULT', id, result: { throttleLevel: state.throttleLevel } });
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

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 2 — EMOTIONAL STATE AGENT ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentEmotion = {

  deriveInitial(hour, p) {
    const night   = hour >= 21 || hour < 7;
    const morning = hour >= 7  && hour < 10;
    if (night)   return weightedRandom([
      { v: EMOTIONAL_STATES.SLEEPY,   w: 0.55 + p.calmness * 0.2 },
      { v: EMOTIONAL_STATES.PEACEFUL, w: 0.3  + p.calmness * 0.1 },
      { v: EMOTIONAL_STATES.RELAXED,  w: 0.15 },
    ]);
    if (morning) return weightedRandom([
      { v: EMOTIONAL_STATES.CURIOUS,      w: 0.35 + p.curiosity   * 0.2 },
      { v: EMOTIONAL_STATES.PLAYFUL,      w: 0.25 + p.playfulness * 0.2 },
      { v: EMOTIONAL_STATES.AFFECTIONATE, w: 0.2  + p.affection   * 0.1 },
      { v: EMOTIONAL_STATES.RELAXED,      w: 0.2 },
    ]);
    return EMOTIONAL_STATES.RELAXED;
  },

  tick(inactiveMs, now) {
    const inState = now - state.stateEnteredAt;

    // Pending reaction takes priority
    if (state.pendingReaction) {
      const r = state.pendingReaction;
      state.pendingReaction = null;
      return { state: r.state };
    }

    // Inactivity ladder
    if (inactiveMs > 10 * 60 * 1000) {
      if (state.emotionalState !== EMOTIONAL_STATES.SLEEPY)
        return { state: EMOTIONAL_STATES.SLEEPY };
      return null;
    }
    if (inactiveMs > 3 * 60 * 1000 && state.emotionalState === EMOTIONAL_STATES.EXCITED)
      return { state: EMOTIONAL_STATES.RELAXED };

    // Nighttime bias
    const night = state.hourOfDay >= 21 || state.hourOfDay < 7;
    if (night && inState > STATE_MIN_DURATION[state.emotionalState] * 1.5) {
      const calmStates = [EMOTIONAL_STATES.SLEEPY, EMOTIONAL_STATES.PEACEFUL, EMOTIONAL_STATES.RELAXED];
      if (!calmStates.includes(state.emotionalState)) {
        return { state: this.selectNextState() };
      }
    }

    // Minimum duration guard
    if (inState < STATE_MIN_DURATION[state.emotionalState]) return null;

    return { state: this.selectNextState() };
  },

  selectNextState() {
    const p     = state.personality;
    const h     = state.hourOfDay;
    const night = h >= 21 || h < 7;
    const eve   = h >= 17 && h < 21;
    const morn  = h >= 7  && h < 12;

    // Environment modulator from Agent 6
    const envMod = agentEnvironment.getEmotionModifier();

    const candidates = [
      { v: EMOTIONAL_STATES.RELAXED,      w: (p.calmness    * 0.8 + 0.2) * envMod.relaxed },
      { v: EMOTIONAL_STATES.CURIOUS,      w: (p.curiosity   * 0.7 + (morn ? 0.15 : 0)) * envMod.curious },
      { v: EMOTIONAL_STATES.PLAYFUL,      w: (p.playfulness * 0.6 + (morn ? 0.1 : 0)) * envMod.playful },
      { v: EMOTIONAL_STATES.AFFECTIONATE, w: p.affection    * 0.5 * envMod.affectionate },
      { v: EMOTIONAL_STATES.PEACEFUL,     w: (p.calmness    * 0.4 + (eve ? 0.2 : 0)) * envMod.peaceful },
      { v: EMOTIONAL_STATES.SLEEPY,       w: (night ? 0.5 : p.calmness * 0.1) * envMod.sleepy },
      { v: EMOTIONAL_STATES.ALERT,        w: p.alertness    * 0.2 },
    ];

    const filtered = candidates.filter(c => c.v !== state.emotionalState);
    filtered.forEach(c => { c.w += Math.random() * 0.08; }); // organic noise
    return weightedRandom(filtered) || EMOTIONAL_STATES.RELAXED;
  },

  handleInteraction(type) {
    const p = state.personality;
    const reactions = {
      pet:       { state: EMOTIONAL_STATES.AFFECTIONATE, duration: 5000, priority: 8 },
      throw_toy: { state: EMOTIONAL_STATES.EXCITED,      duration: 4000, priority: 9 },
      call:      { state: EMOTIONAL_STATES.ALERT,        duration: 3000, priority: 7 },
      reward:    { state: EMOTIONAL_STATES.EXCITED,      duration: 4000, priority: 9 },
      cuddle:    { state: EMOTIONAL_STATES.AFFECTIONATE, duration: 6000, priority: 8 },
      bedtime:   { state: EMOTIONAL_STATES.SLEEPY,       duration: 0,    priority: 6 },
      play:      { state: EMOTIONAL_STATES.PLAYFUL,      duration: 5000, priority: 8 },
      tap:       {
        state: p.affection > 0.6
          ? EMOTIONAL_STATES.AFFECTIONATE
          : EMOTIONAL_STATES.CURIOUS,
        duration: 3000, priority: 5,
      },
    };
    return reactions[type] || { state: EMOTIONAL_STATES.CURIOUS, duration: 2500, priority: 4 };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 3 — PROCEDURAL MOVEMENT AGENT ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentMovement = {

  tick(now, emotionalState) {
    // Only trigger new movement if we're past the scheduled time
    if (now < state.nextMovementAt) return;
    if (state.soundReactionActive)  return; // sound agent has priority

    // Choose next procedural movement based on emotional state
    const move = this.selectMovement(emotionalState);
    state.movementState    = move.type;
    state.movementEnteredAt= now;

    // Schedule horizontal wander (posX drift)
    if (move.type === MOVEMENT_STATES.WALKING || move.type === MOVEMENT_STATES.REPOSITION) {
      state.posXTarget = (Math.random() * 2 - 1) * 0.55; // -0.55 to +0.55
    }

    // Schedule next movement
    const minGap = this.getMovementInterval(emotionalState);
    state.nextMovementAt = now + minGap + randomBetween(0, minGap * 0.6);
  },

  selectMovement(emotionalState) {
    // Movement candidates weighted by emotional state
    const candidates = {
      relaxed:      [
        { type: MOVEMENT_STATES.IDLE,       w: 0.45 },
        { type: MOVEMENT_STATES.SITTING,    w: 0.25 },
        { type: MOVEMENT_STATES.STRETCHING, w: 0.15 },
        { type: MOVEMENT_STATES.REPOSITION, w: 0.15 },
      ],
      playful:      [
        { type: MOVEMENT_STATES.WALKING,    w: 0.35 },
        { type: MOVEMENT_STATES.WAGGING,    w: 0.30 },
        { type: MOVEMENT_STATES.REPOSITION, w: 0.20 },
        { type: MOVEMENT_STATES.IDLE,       w: 0.15 },
      ],
      sleepy:       [
        { type: MOVEMENT_STATES.IDLE,       w: 0.55 },
        { type: MOVEMENT_STATES.SITTING,    w: 0.30 },
        { type: MOVEMENT_STATES.STRETCHING, w: 0.15 },
      ],
      excited:      [
        { type: MOVEMENT_STATES.WALKING,    w: 0.40 },
        { type: MOVEMENT_STATES.WAGGING,    w: 0.35 },
        { type: MOVEMENT_STATES.REPOSITION, w: 0.25 },
      ],
      curious:      [
        { type: MOVEMENT_STATES.IDLE,       w: 0.30 },
        { type: MOVEMENT_STATES.REPOSITION, w: 0.35 },
        { type: MOVEMENT_STATES.SITTING,    w: 0.20 },
        { type: MOVEMENT_STATES.STRETCHING, w: 0.15 },
      ],
      affectionate: [
        { type: MOVEMENT_STATES.SITTING,    w: 0.40 },
        { type: MOVEMENT_STATES.IDLE,       w: 0.30 },
        { type: MOVEMENT_STATES.WAGGING,    w: 0.30 },
      ],
      alert:        [
        { type: MOVEMENT_STATES.IDLE,       w: 0.50 },
        { type: MOVEMENT_STATES.REPOSITION, w: 0.30 },
        { type: MOVEMENT_STATES.SITTING,    w: 0.20 },
      ],
      peaceful:     [
        { type: MOVEMENT_STATES.SITTING,    w: 0.45 },
        { type: MOVEMENT_STATES.IDLE,       w: 0.35 },
        { type: MOVEMENT_STATES.STRETCHING, w: 0.20 },
      ],
    };

    const set = candidates[emotionalState] || candidates.relaxed;
    // Add small noise to prevent lock-in
    set.forEach(c => { c.w += Math.random() * 0.05; });
    return weightedRandom(set) || { type: MOVEMENT_STATES.IDLE };
  },

  getMovementInterval(emotionalState) {
    const intervals = {
      relaxed:      18000,
      playful:      8000,
      sleepy:       30000,
      excited:      6000,
      curious:      10000,
      affectionate: 14000,
      alert:        8000,
      peaceful:     22000,
    };
    return intervals[emotionalState] || 15000;
  },

  reactToInteraction(type) {
    const now = Date.now();
    if (type === 'pet' || type === 'reward') {
      state.movementState     = MOVEMENT_STATES.WAGGING;
      state.movementEnteredAt = now;
      state.nextMovementAt    = now + 3500;
    } else if (type === 'throw_toy' || type === 'play') {
      state.movementState     = MOVEMENT_STATES.WALKING;
      state.posXTarget        = (Math.random() * 2 - 1) * 0.5;
      state.movementEnteredAt = now;
      state.nextMovementAt    = now + 4500;
    } else if (type === 'call') {
      state.movementState     = MOVEMENT_STATES.IDLE;
      state.posXTarget        = 0; // come to centre
      state.movementEnteredAt = now;
      state.nextMovementAt    = now + 2500;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 4 — SOUND REACTION AGENT ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentSound = {

  handleSoundPlayed() {
    // Ear lift + gaze toward sound direction
    agentGaze.focusPoint(state.soundReactionDir, -0.1);
    return {
      state:    EMOTIONAL_STATES.ALERT,
      duration: 2800,
      reason:   'sound',
      priority: 8,
    };
  },

  tick(now) {
    // Decay sound reaction after 2.5s
    if (now - state.soundReactionAt > 2500) {
      state.soundReactionActive = false;
      // Gentle return to curiosity after alert
      if (state.emotionalState === EMOTIONAL_STATES.ALERT) {
        return { state: EMOTIONAL_STATES.CURIOUS };
      }
    }
    return null;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 5 — PERSONALITY MEMORY AGENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentPersonality = {

  applyConfig(cfg) {
    const LEARN_RATE = 0.06; // one-time config influence
    const clamp = v => Math.min(0.95, Math.max(0.1, v));
    if (cfg.tailWagSpeed === 'fast')  state.personality.playfulness = clamp(state.personality.playfulness + LEARN_RATE);
    if (cfg.tailWagSpeed === 'slow')  state.personality.calmness    = clamp(state.personality.calmness    + LEARN_RATE);
    if (cfg.cuddleResponse === 'strong') state.personality.affection= clamp(state.personality.affection   + LEARN_RATE);
    if (cfg.alertResponse  === 'strong') state.personality.alertness= clamp(state.personality.alertness   + LEARN_RATE);
    if (cfg.alertResponse  === 'curious')state.personality.curiosity= clamp(state.personality.curiosity   + LEARN_RATE);
  },

  learn(type) {
    const RATE = 0.018; // subtle — no rapid swings
    const MAX  = 0.95;
    const MIN  = 0.10;
    const clamp = v => Math.min(MAX, Math.max(MIN, v));
    const p = state.personality;

    switch (type) {
      case 'pet':
      case 'cuddle':
        p.affection    = clamp(p.affection    + RATE);
        p.calmness     = clamp(p.calmness     + RATE * 0.5);
        p.petCount     = (p.petCount   || 0) + 1;
        break;
      case 'play':
      case 'throw_toy':
        p.playfulness  = clamp(p.playfulness  + RATE);
        p.curiosity    = clamp(p.curiosity    + RATE * 0.3);
        p.playCount    = (p.playCount  || 0) + 1;
        break;
      case 'call':
        p.alertness    = clamp(p.alertness    + RATE * 0.5);
        p.curiosity    = clamp(p.curiosity    + RATE * 0.3);
        p.callCount    = (p.callCount  || 0) + 1;
        break;
      case 'bedtime':
        p.calmness     = clamp(p.calmness     + RATE);
        p.bedtimeCount = (p.bedtimeCount || 0) + 1;
        break;
      case 'reward':
        p.affection    = clamp(p.affection    + RATE * 0.5);
        p.playfulness  = clamp(p.playfulness  + RATE * 0.3);
        break;
      case 'sound':
        p.curiosity    = clamp(p.curiosity    + RATE * 0.4);
        p.alertness    = clamp(p.alertness    + RATE * 0.2);
        p.soundCount   = (p.soundCount || 0) + 1;
        break;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 6 — ENVIRONMENT RESPONSE AGENT ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentEnvironment = {

  // Emotion weight modifiers per environment (1.0 = neutral)
  ENV_MODIFIERS: {
    day:       { relaxed: 1.0, curious: 1.2, playful: 1.1, affectionate: 1.0, peaceful: 0.9, sleepy: 0.7,  alert: 1.0 },
    golden:    { relaxed: 1.1, curious: 1.0, playful: 1.0, affectionate: 1.3, peaceful: 1.1, sleepy: 0.8,  alert: 0.8 },
    sunset:    { relaxed: 1.2, curious: 0.9, playful: 0.8, affectionate: 1.2, peaceful: 1.3, sleepy: 1.0,  alert: 0.7 },
    dusk:      { relaxed: 1.1, curious: 0.8, playful: 0.7, affectionate: 1.1, peaceful: 1.4, sleepy: 1.2,  alert: 0.6 },
    night:     { relaxed: 1.0, curious: 0.6, playful: 0.4, affectionate: 0.9, peaceful: 1.2, sleepy: 1.8,  alert: 0.5 },
    rain:      { relaxed: 1.3, curious: 0.7, playful: 0.5, affectionate: 1.4, peaceful: 1.5, sleepy: 1.3,  alert: 0.6 },
    fireplace: { relaxed: 1.4, curious: 0.6, playful: 0.4, affectionate: 1.5, peaceful: 1.6, sleepy: 1.5,  alert: 0.4 },
    snow:      { relaxed: 1.0, curious: 1.3, playful: 1.2, affectionate: 1.0, peaceful: 1.0, sleepy: 0.9,  alert: 1.1 },
    woodland:  { relaxed: 1.0, curious: 1.4, playful: 1.1, affectionate: 0.9, peaceful: 1.1, sleepy: 0.8,  alert: 1.2 },
    beach:     { relaxed: 1.0, curious: 1.2, playful: 1.4, affectionate: 1.1, peaceful: 1.0, sleepy: 0.7,  alert: 0.9 },
  },

  setEnv(env) {
    state.currentEnv   = env;
    state.envEnteredAt = Date.now();
    // Also adjust breath rhythm for ambience
    const breathMap = {
      night: 0.5, fireplace: 0.45, rain: 0.55, dusk: 0.65, sunset: 0.7,
      golden: 0.85, day: 1.0, beach: 1.1, snow: 0.9, woodland: 0.95,
    };
    state.breathRhythm = breathMap[env] || 1.0;
  },

  getEmotionModifier() {
    return this.ENV_MODIFIERS[state.currentEnv] || this.ENV_MODIFIERS.day;
  },

  getBehaviourProposal() {
    // On env change, nudge toward an appropriate emotional state
    const envProposals = {
      fireplace: { state: EMOTIONAL_STATES.PEACEFUL,     duration: 0, reason: 'env' },
      night:     { state: EMOTIONAL_STATES.SLEEPY,       duration: 0, reason: 'env' },
      rain:      { state: EMOTIONAL_STATES.RELAXED,      duration: 0, reason: 'env' },
      beach:     { state: EMOTIONAL_STATES.PLAYFUL,      duration: 8000, reason: 'env' },
      snow:      { state: EMOTIONAL_STATES.CURIOUS,      duration: 5000, reason: 'env' },
      woodland:  { state: EMOTIONAL_STATES.CURIOUS,      duration: 5000, reason: 'env' },
      golden:    { state: EMOTIONAL_STATES.AFFECTIONATE, duration: 6000, reason: 'env' },
      sunset:    { state: EMOTIONAL_STATES.PEACEFUL,     duration: 0, reason: 'env' },
      dusk:      { state: EMOTIONAL_STATES.PEACEFUL,     duration: 0, reason: 'env' },
    };
    return envProposals[state.currentEnv] || null;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 7 — MEMORY INTERPRETATION AGENT ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentMemory = {

  handleMoment(memoryType, emotionalTags) {
    state.lastMemoryAt = Date.now();

    // Tags can bias the emotional response
    const tags  = (emotionalTags || []).concat(state.memoryTags);
    const p     = state.personality;

    // Determine emotional weight from tags
    const joyful  = tags.some(t => ['play','beach','walk','park','fetch'].includes(t));
    const cosy    = tags.some(t => ['snuggle','cuddle','sofa','bed','fireplace'].includes(t));

    if (joyful) {
      return {
        state:    p.playfulness > 0.55 ? EMOTIONAL_STATES.EXCITED : EMOTIONAL_STATES.PLAYFUL,
        duration: 8000, reason: 'memory-joy', priority: 7,
      };
    }
    if (cosy) {
      return {
        state:    EMOTIONAL_STATES.AFFECTIONATE,
        duration: 9000, reason: 'memory-cosy', priority: 7,
      };
    }
    // Default: calm, affectionate
    return {
      state:    p.calmness > 0.6 ? EMOTIONAL_STATES.PEACEFUL : EMOTIONAL_STATES.AFFECTIONATE,
      duration: 7000, reason: 'memory', priority: 6,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 8 — ATTENTION & GAZE AGENT ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentGaze = {

  tick(now) {
    if (now < state.gazeShiftAt + state.gazeHoldMs) return; // hold current gaze

    // Natural gaze drift — organic, not robotic
    const drifts = [
      { x:  0.0, y:  0.0 },  // centre (most common)
      { x:  0.0, y:  0.0 },
      { x:  0.12, y: -0.05 }, // slight right
      { x: -0.12, y: -0.05 }, // slight left
      { x:  0.0, y: -0.15 },  // look up briefly
      { x:  0.18, y:  0.08 }, // down-right
      { x: -0.18, y:  0.08 }, // down-left
    ];

    const drift = drifts[Math.floor(Math.random() * drifts.length)];
    state.gazeTarget = drift;

    this.scheduleShift();
  },

  scheduleShift() {
    const emotional = state.emotionalState;
    // Curious/alert = more frequent gaze shifts; sleepy = rare
    const base = {
      relaxed: 5000, curious: 2500, alert: 1800, sleepy: 12000,
      playful: 3000, affectionate: 6000, peaceful: 8000, excited: 2000,
    }[emotional] || 5000;

    state.gazeShiftAt = Date.now();
    state.gazeHoldMs  = base + randomBetween(-1000, 2000);
  },

  focusPoint(x, y) {
    // Soft focus toward a point (from sound/interaction)
    state.gazeTarget = {
      x: Math.max(-0.8, Math.min(0.8, (x || 0) * 0.6)),
      y: Math.max(-0.8, Math.min(0.8, (y || 0) * 0.4)),
    };
    state.gazeShiftAt = Date.now();
    state.gazeHoldMs  = 2500; // hold on interaction target
  },

  trackPointer(x, y) {
    // Gentle follow — only if curious/alert, else ignore
    const reactive = [EMOTIONAL_STATES.CURIOUS, EMOTIONAL_STATES.ALERT, EMOTIONAL_STATES.EXCITED];
    if (!reactive.includes(state.emotionalState)) return;

    // Soft lerp toward pointer (not exact tracking — feels natural)
    const strength = 0.3;
    state.gazeTarget = {
      x: state.gazeTarget.x + (x * 0.5 - state.gazeTarget.x) * strength,
      y: state.gazeTarget.y + (y * 0.3 - state.gazeTarget.y) * strength,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 9 — PERFORMANCE GOVERNOR AGENT ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentPerformance = {

  // Returns which sub-agents to skip based on throttle level
  shouldSkip(tickCount, throttleLevel) {
    if (throttleLevel === 0) return {};             // full quality — skip nothing
    if (throttleLevel === 1) return {               // medium — reduce gaze frequency
      gaze: tickCount % 3 !== 0,
    };
    return {                                        // low — skip most non-critical
      gaze:        true,
      presence:    tickCount % 4 !== 0,
      movement:    tickCount % 3 !== 0,
      soundReaction: false,                         // sound always responsive
    };
  },

  updateThrottle(fps, isLowPower) {
    if (isLowPower || fps < 18) return 2;           // low quality
    if (fps < 28)               return 1;           // medium
    return 0;                                       // full
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT 10 — COMPANION PRESENCE AGENT ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const agentPresence = {

  tick(now, emotionalState) {
    // Micro-behaviour frequency (ms between ambient presence updates)
    const freqMap = {
      relaxed:      20000,
      sleepy:       35000,
      peaceful:     25000,
      playful:      10000,
      excited:      8000,
      curious:      12000,
      affectionate: 18000,
      alert:        15000,
    };
    const freq = freqMap[emotionalState] || 20000;
    if (now - state.presenceMicroAt < freq) return;

    state.presenceMicroAt = now;

    // Micro-behaviours: subtle non-verbal expressions
    // These adjust breath rhythm and posX nudge only — no state transitions
    const micros = {
      sleepy:       () => { state.breathRhythm = 0.4 + Math.random() * 0.1; },
      peaceful:     () => { state.breathRhythm = 0.55 + Math.random() * 0.1; },
      relaxed:      () => { state.breathRhythm = 0.8  + Math.random() * 0.15; },
      excited:      () => { state.breathRhythm = 1.6  + Math.random() * 0.3; },
      playful:      () => { state.breathRhythm = 1.4  + Math.random() * 0.2; },
      curious:      () => {
        // Tiny head tilt / posX shift to show interest
        state.posXTarget = state.posXTarget + (Math.random() * 0.1 - 0.05);
        state.breathRhythm = 1.0 + Math.random() * 0.15;
      },
      affectionate: () => {
        state.breathRhythm = 0.75 + Math.random() * 0.15;
      },
      alert:        () => {
        state.breathRhythm = 1.3 + Math.random() * 0.2;
      },
    };

    const micro = micros[emotionalState];
    if (micro) micro();

    // Occasional idle fidget — natural restlessness
    if (Math.random() < 0.2 && state.movementState === MOVEMENT_STATES.IDLE) {
      state.idleFidgetAt = now;
      state.posXTarget   = state.posXTarget + (Math.random() * 0.06 - 0.03);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── SNAPSHOT HELPERS ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function getSnapshot() {
  return {
    emotionalState: state.emotionalState,
    dogState:       EMOTIONAL_TO_DOG_STATE[state.emotionalState] || 'idle',
    movementState:  state.movementState,
    posXTarget:     state.posXTarget,
    gazeTarget:     state.gazeTarget,
    breathRhythm:   state.breathRhythm,
    soundReactionDir: state.soundReactionDir,
    soundReactionActive: state.soundReactionActive,
    personality:    getPersonalitySnapshot(),
    throttleLevel:  state.throttleLevel,
    env:            state.currentEnv,
  };
}

function getPersonalitySnapshot() {
  const p = state.personality;
  return {
    playfulness:  p.playfulness,
    calmness:     p.calmness,
    affection:    p.affection,
    curiosity:    p.curiosity,
    alertness:    p.alertness,
    petCount:     p.petCount,
    playCount:    p.playCount,
    bedtimeCount: p.bedtimeCount,
    soundCount:   p.soundCount,
    callCount:    p.callCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── UTILITIES ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function weightedRandom(candidates) {
  const total = candidates.reduce((s, c) => s + (c.w || 0), 0);
  if (total <= 0) return candidates[0]?.v || null;
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.w || 0;
    if (r <= 0) return c.v || c.type || null;
  }
  return candidates[candidates.length - 1]?.v || candidates[candidates.length - 1]?.type || null;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
