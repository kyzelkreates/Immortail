/**
 * Immortail™ — Virtual Dog Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas-rendered emotional companion with:
 *   - Local AI behaviour engine (behaviourWorker.js)
 *   - Pointer/touch head tracking
 *   - Cinematic introduction sequence
 *   - Adaptive quality from performance governor
 *   - Smooth state blending (no hard cuts)
 *
 * Props:
 *   profile              — dog profile object
 *   dogConfig            — AI-generated dog config
 *   onInteraction        — callback(type) when user interacts
 *   className            — CSS class
 *   interactive          — enable/disable touch
 *   presenceStateOverride— from useEmotionalPresence (idle sequence)
 *   quality              — 'low' | 'medium' | 'high' from performance governor
 *   onReady              — called when intro sequence completes
 *   showIntro            — trigger cinematic intro (e.g. after reconstruction)
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  initRenderer, destroyRenderer,
  setDogState, updateAppearance,
  buildAppearanceFromConfig,
  setQuality, setPointerPosition, clearPointer,
  playIntroduction,
} from './dogRenderer.js';
import { useBehaviourEngine } from '../hooks/useBehaviourEngine.js';
import { DOG_STATES, INTERACTIONS } from '../core/constants.js';

// Timed states that return to idle
const STATE_DURATION = {
  [DOG_STATES.EXCITED]:   3500,
  [DOG_STATES.HAPPY]:     4500,
  [DOG_STATES.PLAYING]:   5500,
  [DOG_STATES.WAGGING]:   3000,
  [DOG_STATES.LISTENING]: 2500,
  [DOG_STATES.RUNNING]:   3000,
};

// Maps behaviour engine dog state → renderer DOG_STATE constant
const DOGSTATE_MAP = {
  idle:      DOG_STATES.IDLE,
  happy:     DOG_STATES.HAPPY,
  excited:   DOG_STATES.EXCITED,
  sleeping:  DOG_STATES.SLEEPING,
  sitting:   DOG_STATES.SITTING,
  listening: DOG_STATES.LISTENING,
  playing:   DOG_STATES.PLAYING,
  wagging:   DOG_STATES.WAGGING,
  walking:   DOG_STATES.WALKING,
  running:   DOG_STATES.RUNNING,
};

export default function VirtualDog({
  profile,
  dogConfig,
  onInteraction,
  className        = '',
  interactive      = true,
  presenceStateOverride = null,
  quality          = 'high',
  onReady          = null,
  showIntro        = false,
  onNotifyRef      = null,
}) {
  const canvasRef      = useRef(null);
  const stateTimerRef  = useRef(null);
  const pointerActive  = useRef(false);
  const [currentState, setCurrentState] = useState(DOG_STATES.IDLE);
  const [reaction,     setReaction]     = useState('');
  const [showReaction, setShowReaction] = useState(false);
  const [introComplete,setIntroComplete]= useState(false);

  // ── Behaviour engine (local AI worker) ─────────────────────────────────────
  const {
    dogState: behaviourDogState,
    notifyInteraction,
    notifySoundPlayed,
    notifyMemoryMoment,
    ready: behaviourReady,
  } = useBehaviourEngine(dogConfig, profile?.id);

  // ─── Init canvas ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // DPR-aware sizing
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const appearance = buildAppearanceFromConfig(profile, dogConfig);
    initRenderer(canvas, appearance);
    setQuality(quality);

    return () => destroyRenderer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quality changes ────────────────────────────────────────────────────────
  useEffect(() => { setQuality(quality); }, [quality]);

  // ── Appearance updates ─────────────────────────────────────────────────────
  useEffect(() => {
    const appearance = buildAppearanceFromConfig(profile, dogConfig);
    updateAppearance(appearance);
  }, [profile, dogConfig]);

  // ── Cinematic intro ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showIntro) return;
    playIntroduction();
    const t = setTimeout(() => {
      setIntroComplete(true);
      onReady?.();
    }, 2500);
    return () => clearTimeout(t);
  }, [showIntro, onReady]);

  // ── Behaviour engine → renderer sync ──────────────────────────────────────
  // Only applies when no user interaction timer is active
  useEffect(() => {
    if (!behaviourReady || !behaviourDogState) return;
    if (stateTimerRef.current) return; // user interaction takes priority
    const mapped = DOGSTATE_MAP[behaviourDogState] || DOG_STATES.IDLE;
    setCurrentState(mapped);
    setDogState(mapped);
  }, [behaviourDogState, behaviourReady]);

  // ── Presence override (idle sequence from useEmotionalPresence) ────────────
  // Lower priority than behaviour engine — only applies if no active interaction
  useEffect(() => {
    if (!presenceStateOverride) return;
    if (stateTimerRef.current) return;
    // Presence hook gives us DOG_STATES strings directly
    setCurrentState(presenceStateOverride);
    setDogState(presenceStateOverride);
  }, [presenceStateOverride]);

  // ─── Transition to state (user-triggered — highest priority) ──────────────
  const transitionTo = useCallback((newState, reactionText = '', duration) => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    setCurrentState(newState);
    setDogState(newState);

    if (reactionText) {
      setReaction(reactionText);
      setShowReaction(true);
      setTimeout(() => setShowReaction(false), 2400);
    }

    const dur = duration !== undefined ? duration : STATE_DURATION[newState];
    if (dur) {
      stateTimerRef.current = setTimeout(() => {
        stateTimerRef.current = null;
        // Return to behaviour-engine-driven state
        const mapped = DOGSTATE_MAP[behaviourDogState] || DOG_STATES.IDLE;
        setCurrentState(mapped);
        setDogState(mapped);
      }, dur);
    }
  }, [behaviourDogState]);

  // ─── Interaction handler ──────────────────────────────────────────────────
  const handleInteraction = useCallback((type) => {
    if (!interactive) return;
    onInteraction?.(type);
    notifyInteraction(type);

    switch (type) {
      case INTERACTIONS.PET:
        transitionTo(DOG_STATES.HAPPY, '🥰'); break;
      case INTERACTIONS.THROW_TOY:
        transitionTo(DOG_STATES.EXCITED, '🎾 fetch!'); break;
      case INTERACTIONS.CALL:
        transitionTo(DOG_STATES.LISTENING, '👂'); break;
      case INTERACTIONS.REWARD:
        transitionTo(DOG_STATES.EXCITED, '🍖'); break;
      case INTERACTIONS.CUDDLE:
        transitionTo(DOG_STATES.HAPPY, '💛'); break;
      case INTERACTIONS.BEDTIME:
        transitionTo(DOG_STATES.SLEEPING, '😴', 0); break;
      case INTERACTIONS.PLAY:
        transitionTo(DOG_STATES.PLAYING, '🐾'); break;
      default: break;
    }
  }, [interactive, transitionTo, onInteraction, notifyInteraction]);

  // ─── Canvas tap ───────────────────────────────────────────────────────────
  const handleCanvasTap = useCallback((e) => {
    if (!interactive) return;
    e.preventDefault();
    notifyInteraction('tap');

    const tapReactions = [
      { state: DOG_STATES.HAPPY,   text: '🥰' },
      { state: DOG_STATES.WAGGING, text: '🐾' },
      { state: DOG_STATES.HAPPY,   text: '💛' },
      { state: DOG_STATES.LISTENING, text: '👀' },
    ];
    const r = tapReactions[Math.floor(Math.random() * tapReactions.length)];
    transitionTo(r.state, r.text);
  }, [interactive, transitionTo, notifyInteraction]);

  // ─── Pointer/touch tracking (head follow) ────────────────────────────────
  const handlePointerMove = useCallback((e) => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x    = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y    = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    setPointerPosition(x, y);
    pointerActive.current = true;
  }, [interactive]);

  const handlePointerLeave = useCallback(() => {
    clearPointer();
    pointerActive.current = false;
  }, []);

  // Expose notify functions to parent via onNotifyRef callback
  useEffect(() => {
    onNotifyRef?.({ notifySoundPlayed, notifyMemoryMoment });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifySoundPlayed, notifyMemoryMoment]);

  // Cleanup
  useEffect(() => () => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer select-none"
        style={{ touchAction: 'none' }}
        onClick={handleCanvasTap}
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        onTouchEnd={(e) => { handleCanvasTap(e); handlePointerLeave(); }}
        role="img"
        aria-label={`${profile?.name || 'Your dog'}'s virtual companion`}
      />

      {/* Reaction bubble */}
      <AnimatePresence>
        {showReaction && (
          <motion.div
            key="reaction"
            initial={{ opacity: 0, y: 12, scale: 0.75 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -8, scale: 0.9  }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="absolute top-3 left-1/2 -translate-x-1/2
                       bg-immortail-deep/85 backdrop-blur-sm
                       px-4 py-2 rounded-full text-sm font-medium
                       text-immortail-gold border border-immortail-gold/25
                       pointer-events-none whitespace-nowrap shadow-lg"
          >
            {reaction}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtle state indicator — only for non-idle states */}
      <AnimatePresence>
        {currentState !== DOG_STATES.IDLE && currentState !== DOG_STATES.SITTING && (
          <motion.div
            key={currentState}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0        }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none"
          >
            <span className="text-[10px] text-immortail-soft/50 bg-black/20 px-2 py-0.5 rounded-full tracking-wide">
              {currentState}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Re-export notify functions for parent components to call
// (via a forwarded ref or by passing as props — see ImmorTailPage)
export function createDogInteractionProxy(virtualDogRef) {
  return {
    notifySoundPlayed:  () => virtualDogRef.current?.notifySoundPlayed?.(),
    notifyMemoryMoment: () => virtualDogRef.current?.notifyMemoryMoment?.(),
  };
}
