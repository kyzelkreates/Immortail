/**
 * Immortail™ — useBehaviourEngine  v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * React bridge to the 10-agent behaviourWorker.js orchestrator.
 *
 * New in v2.0:
 *   - notifyEnvChange(env)     — Agent 6: env → behaviour coupling
 *   - notifyPointerMove(x,y)   — Agent 8: gaze tracks pointer (throttled)
 *   - notifyPerformance(fps, isLowPower) — Agent 9: FPS feedback
 *   - gazeTarget               — { x, y } for dogRenderer
 *   - movementState            — procedural movement hint for renderer
 *   - breathRhythm             — 0.4=slow .. 1.8=fast
 *   - soundReactionActive      — for ear-lift animation
 *   - soundReactionDir         — which way ears/head turn on sound
 *
 * PRESERVED (all existing callers unbroken):
 *   - emotionalState, dogState, personality
 *   - notifyInteraction, notifySoundPlayed, notifyMemoryMoment
 *   - ready flag
 *
 * Additive only — does NOT touch storage, routing, or other hooks.
 * Personality weights persisted to localStorage (privacy-safe, local-only).
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const PERSONALITY_LS_KEY  = 'immortail:personality';
const TICK_INTERVAL_MS    = 800;   // 800ms ticks — lightweight
const POINTER_THROTTLE_MS = 200;   // don't spam worker with pointer events

export function useBehaviourEngine(dogConfig, activeProfileId, currentEnv) {
  const workerRef        = useRef(null);
  const msgIdRef         = useRef(0);
  const pendingRef       = useRef({});
  const tickIntervalRef  = useRef(null);
  const lastPointerSend  = useRef(0);
  const lastEnvRef       = useRef(null);

  const [emotionalState,       setEmotionalState]       = useState('relaxed');
  const [dogState,             setDogState]             = useState('idle');
  const [movementState,        setMovementState]        = useState('idle');
  const [gazeTarget,           setGazeTarget]           = useState({ x: 0, y: 0 });
  const [breathRhythm,         setBreathRhythm]         = useState(1.0);
  const [soundReactionActive,  setSoundReactionActive]  = useState(false);
  const [soundReactionDir,     setSoundReactionDir]     = useState(0);
  const [personality,          setPersonality]          = useState({});
  const [ready,                setReady]                = useState(false);

  // ── Worker messaging ────────────────────────────────────────────────────────
  const send = useCallback((type, payload = {}) => {
    return new Promise((resolve) => {
      if (!workerRef.current) { resolve(null); return; }
      const id = ++msgIdRef.current;
      pendingRef.current[id] = resolve;
      workerRef.current.postMessage({ type, id, payload });
      // 3s timeout — prevents promise leaks on worker restart
      setTimeout(() => {
        if (pendingRef.current[id]) {
          delete pendingRef.current[id];
          resolve(null);
        }
      }, 3000);
    });
  }, []);

  // Fire-and-forget (no response needed — saves roundtrip overhead)
  const fire = useCallback((type, payload = {}) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type, id: 0, payload });
  }, []);

  // ── Apply snapshot to React state ───────────────────────────────────────────
  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    if (snapshot.emotionalState)  setEmotionalState(snapshot.emotionalState);
    if (snapshot.dogState)        setDogState(snapshot.dogState);
    if (snapshot.movementState)   setMovementState(snapshot.movementState);
    if (snapshot.gazeTarget)      setGazeTarget(snapshot.gazeTarget);
    if (snapshot.breathRhythm !== undefined) setBreathRhythm(snapshot.breathRhythm);
    if (snapshot.soundReactionActive !== undefined) setSoundReactionActive(snapshot.soundReactionActive);
    if (snapshot.soundReactionDir !== undefined)    setSoundReactionDir(snapshot.soundReactionDir);
    if (snapshot.personality) {
      setPersonality(snapshot.personality);
      try {
        localStorage.setItem(PERSONALITY_LS_KEY, JSON.stringify(snapshot.personality));
      } catch {}
    }
  }, []);

  // ── Init worker (once per profile) ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const worker = new Worker(
      new URL('../workers/behaviourWorker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, id, result } = e.data;
      // Resolve pending promise
      if (id && pendingRef.current[id]) {
        pendingRef.current[id](result);
        delete pendingRef.current[id];
      }
      // Update state for async push messages
      if ((type === 'TICK_RESULT' || type === 'INIT_DONE') && !cancelled) {
        applySnapshot(result);
      }
      if (type === 'INTERACTION_RESULT' && !cancelled) {
        applySnapshot({
          emotionalState: result?.newState,
          personality:    result?.personality,
          gazeTarget:     result?.gazeTarget,
          dogState:       result?.dogState,
        });
      }
      if ((type === 'SOUND_RESULT' || type === 'MEMORY_RESULT' || type === 'ENV_RESULT') && !cancelled) {
        applySnapshot(result);
      }
    };

    worker.onerror = (err) => {
      console.warn('[Immortail] BehaviourWorker error:', err.message);
    };

    // Restore stored personality
    let storedPersonality = null;
    try {
      const raw = localStorage.getItem(PERSONALITY_LS_KEY);
      if (raw) storedPersonality = JSON.parse(raw);
    } catch {}

    // Init all agents
    send('INIT', {
      config:            dogConfig,
      storedPersonality,
      hour:              new Date().getHours(),
      env:               currentEnv || 'day',
    }).then(result => {
      if (!cancelled) {
        applySnapshot(result);
        setReady(true);
        lastEnvRef.current = currentEnv;
      }
    });

    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  // Re-init only on profile change — NOT on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  // ── Update dogConfig without re-initing ────────────────────────────────────
  useEffect(() => {
    if (!ready || !dogConfig) return;
    send('INIT', {
      config:            dogConfig,
      storedPersonality: null, // preserve learned personality
      hour:              new Date().getHours(),
      env:               currentEnv || 'day',
    }).then(applySnapshot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogConfig, ready]);

  // ── Behaviour tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    tickIntervalRef.current = setInterval(() => {
      send('TICK').then(applySnapshot);
    }, TICK_INTERVAL_MS);
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [ready, send, applySnapshot]);

  // ── Env change → Agent 6 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !currentEnv) return;
    if (currentEnv === lastEnvRef.current) return; // no-op on same env
    lastEnvRef.current = currentEnv;
    send('ENV_CHANGE', { env: currentEnv }).then(applySnapshot);
  }, [currentEnv, ready, send, applySnapshot]);

  // ── Public API ──────────────────────────────────────────────────────────────

  // Agent 2/3/5: interaction
  const notifyInteraction = useCallback((interactionType, pointerX, pointerY) => {
    send('INTERACTION', {
      interactionType,
      timestamp: Date.now(),
      pointerX,
      pointerY,
    }).then(result => {
      if (!result) return;
      applySnapshot({
        emotionalState: result.newState,
        personality:    result.personality,
        gazeTarget:     result.gazeTarget,
        dogState:       result.dogState,
      });
    });
  }, [send, applySnapshot]);

  // Agent 4: sound played
  const notifySoundPlayed = useCallback((direction) => {
    send('SOUND_PLAYED', {
      timestamp: Date.now(),
      direction: direction ?? (Math.random() > 0.5 ? 0.35 : -0.35),
    }).then(applySnapshot);
  }, [send, applySnapshot]);

  // Agent 7: memory moment surfaced
  const notifyMemoryMoment = useCallback((memoryType, emotionalTags) => {
    send('MEMORY_MOMENT', {
      timestamp:    Date.now(),
      memoryType,
      emotionalTags,
    }).then(applySnapshot);
  }, [send, applySnapshot]);

  // Agent 6: environment changed (explicit call from ImmorTailPage)
  const notifyEnvChange = useCallback((env) => {
    if (env === lastEnvRef.current) return;
    lastEnvRef.current = env;
    send('ENV_CHANGE', { env }).then(applySnapshot);
  }, [send, applySnapshot]);

  // Agent 8: pointer position (gaze tracking — throttled)
  const notifyPointerMove = useCallback((normX, normY) => {
    const now = Date.now();
    if (now - lastPointerSend.current < POINTER_THROTTLE_MS) return;
    lastPointerSend.current = now;
    fire('POINTER_MOVE', { x: normX, y: normY });
  }, [fire]);

  // Agent 9: FPS/performance feedback
  const notifyPerformance = useCallback((fps, isLowPower) => {
    send('PERFORMANCE_UPDATE', { fps, isLowPower }).then(result => {
      if (result?.throttleLevel !== undefined) {
        // throttleLevel is tracked inside the worker; no React state needed
      }
    });
  }, [send]);

  return {
    // ── Existing API (preserved) ──────────────────────────────────────────
    emotionalState,
    dogState,
    personality,
    ready,
    notifyInteraction,
    notifySoundPlayed,
    notifyMemoryMoment,
    // ── New agent outputs ─────────────────────────────────────────────────
    movementState,
    gazeTarget,
    breathRhythm,
    soundReactionActive,
    soundReactionDir,
    notifyEnvChange,
    notifyPointerMove,
    notifyPerformance,
  };
}
