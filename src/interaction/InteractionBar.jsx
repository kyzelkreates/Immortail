/**
 * Immortail™ — Interaction control bar
 * ─────────────────────────────────────────────────────────────────────────────
 * Enhanced: ripple feedback, haptic vibration, cooldown system,
 * active state glow, emotional colour coding.
 */
import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { INTERACTIONS } from '../core/constants.js';

const ACTIONS = [
  {
    id:      INTERACTIONS.PET,
    emoji:   '🤚',
    label:   'Pet',
    color:   'from-pink-900/50  to-pink-800/30  border-pink-700/40',
    glow:    'shadow-pink-900/30',
    haptic:  [10],
  },
  {
    id:      INTERACTIONS.THROW_TOY,
    emoji:   '🎾',
    label:   'Fetch',
    color:   'from-green-900/50 to-green-800/30 border-green-700/40',
    glow:    'shadow-green-900/30',
    haptic:  [5, 15, 5],
  },
  {
    id:      INTERACTIONS.CALL,
    emoji:   '📣',
    label:   'Call',
    color:   'from-blue-900/50  to-blue-800/30  border-blue-700/40',
    glow:    'shadow-blue-900/30',
    haptic:  [8],
  },
  {
    id:      INTERACTIONS.REWARD,
    emoji:   '🍖',
    label:   'Treat',
    color:   'from-yellow-900/50 to-yellow-800/30 border-yellow-700/40',
    glow:    'shadow-yellow-900/30',
    haptic:  [5, 10],
  },
  {
    id:      INTERACTIONS.CUDDLE,
    emoji:   '🤗',
    label:   'Cuddle',
    color:   'from-purple-900/50 to-purple-800/30 border-purple-700/40',
    glow:    'shadow-purple-900/30',
    haptic:  [15],
  },
  {
    id:      INTERACTIONS.PLAY,
    emoji:   '🐾',
    label:   'Play',
    color:   'from-immortail-gold/15 to-immortail-gold/5 border-immortail-gold/30',
    glow:    'shadow-immortail-gold/20',
    haptic:  [5, 5, 10],
  },
  {
    id:      INTERACTIONS.BEDTIME,
    emoji:   '😴',
    label:   'Bedtime',
    color:   'from-indigo-900/50 to-indigo-800/30 border-indigo-700/40',
    glow:    'shadow-indigo-900/30',
    haptic:  [20],
  },
];

// Cooldown per action (ms) — prevents button-mashing spam
const COOLDOWNS = {
  [INTERACTIONS.PET]:       600,
  [INTERACTIONS.THROW_TOY]: 800,
  [INTERACTIONS.CALL]:      1200,
  [INTERACTIONS.REWARD]:    1500,
  [INTERACTIONS.CUDDLE]:    800,
  [INTERACTIONS.PLAY]:      600,
  [INTERACTIONS.BEDTIME]:   2000,
};

export default function InteractionBar({ onInteraction, disabled }) {
  const [active,   setActive]   = useState(null);
  const [ripples,  setRipples]  = useState({});   // id → ripple key
  const cooldownRef = useRef({});

  const triggerHaptic = useCallback((pattern) => {
    if (!navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch {}
  }, []);

  const handle = useCallback((action, e) => {
    if (disabled) return;

    // Cooldown check
    const now = Date.now();
    const lastAt = cooldownRef.current[action.id] || 0;
    if (now - lastAt < COOLDOWNS[action.id]) return;
    cooldownRef.current[action.id] = now;

    // Ripple origin from pointer position
    const rect   = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    const clientY = e.touches ? e.touches[0]?.clientY : e.clientY;
    const rx = (clientX ?? rect.left + rect.width / 2)  - rect.left;
    const ry = (clientY ?? rect.top  + rect.height / 2) - rect.top;

    // Trigger haptic
    triggerHaptic(action.haptic || [10]);

    // Ripple
    const rippleKey = Date.now();
    setRipples(prev => ({ ...prev, [action.id]: { x: rx, y: ry, key: rippleKey } }));
    setTimeout(() => setRipples(prev => {
      const n = { ...prev };
      if (n[action.id]?.key === rippleKey) delete n[action.id];
      return n;
    }), 600);

    // Active state
    setActive(action.id);
    setTimeout(() => setActive(null), COOLDOWNS[action.id] * 0.8);

    onInteraction?.(action.id);
  }, [disabled, onInteraction, triggerHaptic]);

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-0.5 pb-1 pt-0.5">
      {ACTIONS.map(a => {
        const isActive  = active === a.id;
        const ripple    = ripples[a.id];

        return (
          <motion.button
            key={a.id}
            whileTap={{ scale: 0.84, transition: { duration: 0.1 } }}
            whileHover={{ scale: 1.04, transition: { duration: 0.15 } }}
            onPointerDown={(e) => handle(a, e)}
            disabled={disabled}
            className={`
              relative flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl
              border bg-gradient-to-b shrink-0 min-w-[56px]
              transition-all duration-200 overflow-hidden select-none
              ${isActive
                ? `${a.color} shadow-lg ${a.glow}`
                : 'glass-card border-white/10 hover:border-white/20'}
              ${disabled ? 'opacity-35 pointer-events-none' : ''}
            `}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {/* Ripple */}
            <AnimatePresence>
              {ripple && (
                <motion.span
                  key={ripple.key}
                  className="absolute rounded-full bg-white/20 pointer-events-none"
                  style={{ left: ripple.x - 20, top: ripple.y - 20, width: 40, height: 40 }}
                  initial={{ scale: 0, opacity: 0.6 }}
                  animate={{ scale: 3.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                />
              )}
            </AnimatePresence>

            {/* Emoji — slight scale pop on activation */}
            <motion.span
              className="text-xl leading-none relative z-10"
              animate={isActive ? { scale: [1, 1.3, 1] } : { scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {a.emoji}
            </motion.span>

            {/* Label */}
            <span className={`text-[10px] whitespace-nowrap relative z-10 transition-colors duration-200 ${
              isActive ? 'text-immortail-cream' : 'text-immortail-soft'
            }`}>
              {a.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
