/**
 * Immortail™ — Interaction control bar
 * Buttons for: pet, throw toy, call, reward, cuddle, bedtime, play
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { INTERACTIONS } from '../core/constants.js';

const ACTIONS = [
  { id: INTERACTIONS.PET,       emoji: '🤚', label: 'Pet',      color: 'bg-pink-900/40 border-pink-700/50' },
  { id: INTERACTIONS.THROW_TOY, emoji: '🎾', label: 'Fetch',    color: 'bg-green-900/40 border-green-700/50' },
  { id: INTERACTIONS.CALL,      emoji: '📣', label: 'Call',     color: 'bg-blue-900/40 border-blue-700/50' },
  { id: INTERACTIONS.REWARD,    emoji: '🍖', label: 'Treat',    color: 'bg-yellow-900/40 border-yellow-700/50' },
  { id: INTERACTIONS.CUDDLE,    emoji: '🤗', label: 'Cuddle',   color: 'bg-purple-900/40 border-purple-700/50' },
  { id: INTERACTIONS.PLAY,      emoji: '🐾', label: 'Play',     color: 'bg-immortail-gold/10 border-immortail-gold/30' },
  { id: INTERACTIONS.BEDTIME,   emoji: '😴', label: 'Bedtime',  color: 'bg-indigo-900/40 border-indigo-700/50' },
];

export default function InteractionBar({ onInteraction, disabled }) {
  const [lastUsed, setLastUsed] = useState(null);

  const handle = (id) => {
    if (disabled) return;
    setLastUsed(id);
    onInteraction?.(id);
    setTimeout(() => setLastUsed(null), 600);
  };

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1">
      {ACTIONS.map(a => (
        <motion.button
          key={a.id}
          whileTap={{ scale: 0.88 }}
          onClick={() => handle(a.id)}
          disabled={disabled}
          className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl border shrink-0
                      transition-all min-w-[56px]
                      ${lastUsed === a.id ? 'scale-95 ' + a.color : 'glass-card hover:border-white/20'}
                      ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
        >
          <span className="text-xl leading-none">{a.emoji}</span>
          <span className="text-[10px] text-immortail-soft whitespace-nowrap">{a.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
