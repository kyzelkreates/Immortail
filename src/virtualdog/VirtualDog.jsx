/**
 * Immortail™ — Virtual Dog Component
 * Canvas-rendered animated dog with interaction support.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  initRenderer, destroyRenderer,
  setDogState, updateAppearance,
  buildAppearanceFromConfig
} from './dogRenderer.js';
import { DOG_STATES, INTERACTIONS } from '../core/constants.js';

const STATE_DURATION = {
  [DOG_STATES.EXCITED]:  3000,
  [DOG_STATES.HAPPY]:    4000,
  [DOG_STATES.PLAYING]:  5000,
  [DOG_STATES.WAGGING]:  3000,
  [DOG_STATES.LISTENING]:2000,
};

export default function VirtualDog({
  profile,
  dogConfig,
  onInteraction,
  className = '',
  interactive = true,
  presenceStateOverride = null,  // from useEmotionalPresence
}) {
  const canvasRef = useRef(null);
  const stateTimerRef = useRef(null);
  const [currentState, setCurrentState] = useState(DOG_STATES.IDLE);
  const [reaction, setReaction]         = useState('');
  const [showReaction, setShowReaction] = useState(false);

  // ─── Init canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const appearance = buildAppearanceFromConfig(profile, dogConfig);
    initRenderer(canvas, appearance);

    return () => destroyRenderer();
  }, []);

  // ─── Update appearance when config changes ────────────────────────────────
  useEffect(() => {
    const appearance = buildAppearanceFromConfig(profile, dogConfig);
    updateAppearance(appearance);
  }, [profile, dogConfig]);

  // ── Sync presenceStateOverride to renderer ──────────────────────────────
  useEffect(() => {
    if (!presenceStateOverride) return;
    // Only apply when no active user interaction timer
    if (stateTimerRef.current) return;
    setCurrentState(presenceStateOverride);
    setDogState(presenceStateOverride);
  }, [presenceStateOverride]);

  // ─── Transition state ─────────────────────────────────────────────────────
  const transitionTo = useCallback((newState, reactionText = '', duration) => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    setCurrentState(newState);
    setDogState(newState);

    if (reactionText) {
      setReaction(reactionText);
      setShowReaction(true);
      setTimeout(() => setShowReaction(false), 2200);
    }

    const dur = duration || STATE_DURATION[newState];
    if (dur) {
      stateTimerRef.current = setTimeout(() => {
        setCurrentState(DOG_STATES.IDLE);
        setDogState(DOG_STATES.IDLE);
      }, dur);
    }
  }, []);

  // ─── Handle interaction ───────────────────────────────────────────────────
  const handleInteraction = useCallback((type) => {
    if (!interactive) return;
    onInteraction?.(type);

    switch (type) {
      case INTERACTIONS.PET:
        transitionTo(DOG_STATES.HAPPY, '🥰 loves this!');
        break;
      case INTERACTIONS.THROW_TOY:
        transitionTo(DOG_STATES.EXCITED, '🎾 fetch!');
        break;
      case INTERACTIONS.CALL:
        transitionTo(DOG_STATES.LISTENING, '👂 listening…');
        break;
      case INTERACTIONS.REWARD:
        transitionTo(DOG_STATES.EXCITED, '🍖 treat!');
        break;
      case INTERACTIONS.CUDDLE:
        transitionTo(DOG_STATES.HAPPY, '💛 cuddle time!');
        break;
      case INTERACTIONS.BEDTIME:
        transitionTo(DOG_STATES.SLEEPING, '😴 goodnight…', 0);
        break;
      case INTERACTIONS.PLAY:
        transitionTo(DOG_STATES.PLAYING, '🐾 playtime!');
        break;
      default: break;
    }
  }, [interactive, transitionTo, onInteraction]);

  // Tap the dog directly
  const handleCanvasTap = useCallback(() => {
    if (!interactive) return;
    const reactions = [
      { state: DOG_STATES.HAPPY,   text: '🥰' },
      { state: DOG_STATES.WAGGING, text: '🐾 wag!' },
      { state: DOG_STATES.HAPPY,   text: '💛' },
    ];
    const r = reactions[Math.floor(Math.random() * reactions.length)];
    transitionTo(r.state, r.text);
  }, [interactive, transitionTo]);

  useEffect(() => () => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ touchAction: 'none' }}
        onClick={handleCanvasTap}
        onTouchEnd={handleCanvasTap}
        role="img"
        aria-label={`Virtual dog: ${profile?.name || 'your dog'}`}
      />

      {/* Reaction bubble */}
      <AnimatePresence>
        {showReaction && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-immortail-deep/80 backdrop-blur-sm
                       px-4 py-2 rounded-full text-sm font-medium text-immortail-gold border border-immortail-gold/30
                       pointer-events-none whitespace-nowrap"
          >
            {reaction}
          </motion.div>
        )}
      </AnimatePresence>

      {/* State label */}
      {currentState !== DOG_STATES.IDLE && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <span className="text-xs text-immortail-soft/60 bg-black/30 px-2 py-0.5 rounded-full">
            {currentState}
          </span>
        </div>
      )}
    </div>
  );
}
