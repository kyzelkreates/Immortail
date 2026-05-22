/**
 * Immortail™ — useBehaviourEngine
 * ─────────────────────────────────────────────────────────────────────────────
 * React interface to the behaviourWorker.js Web Worker.
 * Provides:
 *   - emotionalState       (string)  — current emotional state
 *   - dogState             (string)  — mapped renderer state
 *   - personality          (object)  — learned personality weights
 *   - notifyInteraction    (fn)      — call when user interacts
 *   - notifySoundPlayed    (fn)      — call when a sound plays
 *   - notifyMemoryMoment   (fn)      — call when a memory surfaces
 *
 * Additive only — does NOT touch storage, routing, or other hooks.
 * Persists personality weights to localStorage (privacy-safe, local-only).
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const PERSONALITY_LS_KEY = 'immortail:personality';
const TICK_INTERVAL_MS   = 800;  // behaviour ticks — light, no RAF

export function useBehaviourEngine(dogConfig, activeProfileId) {
  const workerRef       = useRef(null);
  const msgIdRef        = useRef(0);
  const pendingRef      = useRef({});
  const tickIntervalRef = useRef(null);

  const [emotionalState, setEmotionalState] = useState('relaxed');
  const [dogState,       setDogState]       = useState('idle');
  const [personality,    setPersonality]    = useState({});
  const [ready,          setReady]          = useState(false);

  // ── Worker messaging ────────────────────────────────────────────────────────
  const send = useCallback((type, payload = {}) => {
    return new Promise((resolve) => {
      if (!workerRef.current) { resolve(null); return; }
      const id = ++msgIdRef.current;
      pendingRef.current[id] = resolve;
      workerRef.current.postMessage({ type, id, payload });
      // Timeout safety — resolve null after 3s to prevent leaks
      setTimeout(() => {
        if (pendingRef.current[id]) {
          delete pendingRef.current[id];
          resolve(null);
        }
      }, 3000);
    });
  }, []);

  // ── Apply result to state ───────────────────────────────────────────────────
  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    if (snapshot.emotionalState) setEmotionalState(snapshot.emotionalState);
    if (snapshot.dogState)       setDogState(snapshot.dogState);
    if (snapshot.personality)   {
      setPersonality(snapshot.personality);
      // Persist learned personality
      try {
        localStorage.setItem(PERSONALITY_LS_KEY, JSON.stringify(snapshot.personality));
      } catch {}
    }
  }, []);

  // ── Init worker ─────────────────────────────────────────────────────────────
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
      // Also update state for tick results
      if (type === 'TICK_RESULT' || type === 'INIT_DONE') {
        if (!cancelled) applySnapshot(result);
      }
      if (type === 'INTERACTION_RESULT' && !cancelled) {
        applySnapshot({ emotionalState: result?.newState, personality: result?.personality });
        if (result?.dogState) setDogState(result.dogState);
      }
    };
    worker.onerror = (err) => {
      console.warn('[Immortail] BehaviourWorker error:', err.message);
    };

    // Load stored personality
    let storedPersonality = null;
    try {
      const raw = localStorage.getItem(PERSONALITY_LS_KEY);
      if (raw) storedPersonality = JSON.parse(raw);
    } catch {}

    // Init
    send('INIT', {
      config:           dogConfig,
      storedPersonality,
      hour:             new Date().getHours(),
    }).then(result => {
      if (!cancelled) {
        applySnapshot(result);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  // Only re-init if profile changes — not on every dogConfig update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  // ── Update config when it changes (without re-initing) ────────────────────
  useEffect(() => {
    if (!ready || !dogConfig) return;
    send('INIT', {
      config:           dogConfig,
      storedPersonality: null, // don't overwrite learned personality
      hour:             new Date().getHours(),
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

  // ── Public API ──────────────────────────────────────────────────────────────
  const notifyInteraction = useCallback((interactionType) => {
    send('INTERACTION', { interactionType, timestamp: Date.now() });
  }, [send]);

  const notifySoundPlayed = useCallback(() => {
    send('SOUND_PLAYED', { timestamp: Date.now() });
  }, [send]);

  const notifyMemoryMoment = useCallback(() => {
    send('MEMORY_MOMENT', { timestamp: Date.now() });
  }, [send]);

  return {
    emotionalState,
    dogState,
    personality,
    ready,
    notifyInteraction,
    notifySoundPlayed,
    notifyMemoryMoment,
  };
}
