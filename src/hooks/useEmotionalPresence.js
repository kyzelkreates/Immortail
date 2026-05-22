/**
 * Immortail™ — useEmotionalPresence
 * ─────────────────────────────────────────────────────────────────────────────
 * Drives time-aware, naturally varied emotional behaviour for the virtual dog.
 * No loops. No robotic repetition. Fully additive — no storage changes.
 *
 * Returns:
 *   presenceState   — the computed emotional state to pass to VirtualDog
 *   greeting        — one-time greeting message (inactivity / time-based)
 *   isNight         — boolean
 *   suggestedEnv    — suggested ENV_MODE based on time
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DOG_STATES, ENV_MODES, getAutoEnvMode, isNightTime } from '../core/constants.js';

const LAST_VISIT_KEY = 'immortail:lastVisitAt';

// How long absent before "excited greeting" (ms)
const EXCITED_ABSENCE_MS   = 2  * 60 * 60 * 1000; // 2 hours
const INACTIVITY_LAY_MS    = 3  * 60 * 1000;       // 3 min no interaction → lay down
const INACTIVITY_SLEEP_MS  = 10 * 60 * 1000;       // 10 min → sleep

// Greeting messages by absence duration
function buildGreeting(absenceMs, dogName, isNight) {
  if (!absenceMs) return null;
  const hours = absenceMs / (1000 * 60 * 60);

  if (isNight && hours < 1)   return `💛 ${dogName} is resting…`;
  if (hours >= 24)             return `🐾 ${dogName} missed you so much!`;
  if (hours >= 8)              return `🐾 ${dogName} has been waiting all day…`;
  if (hours >= 2)              return `🐾 ${dogName} perks up — you're back!`;
  if (hours >= 0.5)            return `🥰 ${dogName} wags their tail`;
  return null;
}

// Natural idle state variance — prevents robotic loops
// Returns a sequence of states with random durations
function buildIdleSequence(isNight) {
  if (isNight) {
    return [
      { state: DOG_STATES.IDLE,     dur: 8000  + Math.random() * 5000  },
      { state: DOG_STATES.SLEEPING, dur: 15000 + Math.random() * 10000 },
      { state: DOG_STATES.IDLE,     dur: 4000  + Math.random() * 3000  },
    ];
  }
  return [
    { state: DOG_STATES.IDLE,     dur: 6000  + Math.random() * 4000  },
    { state: DOG_STATES.SITTING,  dur: 5000  + Math.random() * 3000  },
    { state: DOG_STATES.IDLE,     dur: 8000  + Math.random() * 5000  },
    { state: DOG_STATES.WAGGING,  dur: 2500  + Math.random() * 1500  },
    { state: DOG_STATES.IDLE,     dur: 7000  + Math.random() * 6000  },
  ];
}

export function useEmotionalPresence(dogName, activeInteraction) {
  const night = isNightTime();

  const [presenceState, setPresenceState]   = useState(DOG_STATES.IDLE);
  const [greeting, setGreeting]             = useState(null);
  const [greetingShown, setGreetingShown]   = useState(false);
  const [suggestedEnv]                      = useState(() => getAutoEnvMode());

  const idleSeqRef       = useRef(null);
  const idleSeqIdxRef    = useRef(0);
  const idleTimerRef     = useRef(null);
  const inactivityRef    = useRef(null);
  const lastInteractRef  = useRef(Date.now());
  const isActiveRef      = useRef(false); // true when external interaction is controlling state

  // ── On mount: compute absence + show greeting ──────────────────────────────
  useEffect(() => {
    const lastVisit = parseInt(localStorage.getItem(LAST_VISIT_KEY) || '0', 10);
    const absence   = lastVisit ? Date.now() - lastVisit : 0;

    if (absence >= EXCITED_ABSENCE_MS && dogName) {
      // Show excited greeting
      setPresenceState(DOG_STATES.EXCITED);
      const msg = buildGreeting(absence, dogName, night);
      if (msg) {
        setGreeting(msg);
        setGreetingShown(true);
        // Clear greeting after 4s
        setTimeout(() => setGreeting(null), 4500);
        // Return to idle after excitement
        setTimeout(() => {
          if (!isActiveRef.current) setPresenceState(DOG_STATES.IDLE);
        }, 3500);
      }
    } else if (absence > 0 && dogName) {
      const msg = buildGreeting(absence, dogName, night);
      if (msg) {
        setGreeting(msg);
        setTimeout(() => setGreeting(null), 3500);
      }
    }

    // Record visit
    localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Idle animation sequence (non-robotic) ─────────────────────────────────
  const startIdleSequence = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    const seq = buildIdleSequence(night);
    idleSeqRef.current    = seq;
    idleSeqIdxRef.current = 0;

    const advance = () => {
      if (isActiveRef.current) return; // paused while user is interacting
      const idx   = idleSeqIdxRef.current;
      const entry = idleSeqRef.current?.[idx];
      if (!entry) return;
      setPresenceState(entry.state);
      idleSeqIdxRef.current = (idx + 1) % idleSeqRef.current.length;
      // Randomise duration slightly to avoid mechanical feel
      const jitter = (Math.random() - 0.5) * 800;
      idleTimerRef.current = setTimeout(advance, entry.dur + jitter);
    };
    advance();
  }, [night]);

  // ── Inactivity detection → lay down → sleep ───────────────────────────────
  const resetInactivity = useCallback(() => {
    lastInteractRef.current = Date.now();
    if (inactivityRef.current) clearTimeout(inactivityRef.current);

    inactivityRef.current = setTimeout(() => {
      if (!isActiveRef.current) {
        setPresenceState(DOG_STATES.SITTING);
        // Then sleep
        inactivityRef.current = setTimeout(() => {
          if (!isActiveRef.current) setPresenceState(DOG_STATES.SLEEPING);
        }, INACTIVITY_SLEEP_MS - INACTIVITY_LAY_MS);
      }
    }, INACTIVITY_LAY_MS);
  }, []);

  // ── External interaction override ──────────────────────────────────────────
  useEffect(() => {
    if (!activeInteraction) {
      // Interaction ended — resume idle sequence after brief pause
      isActiveRef.current = false;
      const t = setTimeout(() => {
        startIdleSequence();
        resetInactivity();
      }, 3500);
      return () => clearTimeout(t);
    } else {
      isActiveRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    }
  }, [activeInteraction, startIdleSequence, resetInactivity]);

  // ── Start idle sequence on mount ───────────────────────────────────────────
  useEffect(() => {
    // Small delay to allow greeting animation to play first
    const t = setTimeout(() => {
      if (!isActiveRef.current) startIdleSequence();
      resetInactivity();
    }, greeting ? 4000 : 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (idleTimerRef.current)    clearTimeout(idleTimerRef.current);
      if (inactivityRef.current)   clearTimeout(inactivityRef.current);
    };
  }, []);

  return {
    presenceState,
    greeting,
    isNight: night,
    suggestedEnv,
  };
}
