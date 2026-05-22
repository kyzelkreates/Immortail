/**
 * Immortail™ — Loading Screen
 * Cinematic, warm, unhurried.
 * The first thing someone sees after tapping the icon.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LOADING_PHRASES = [
  "Bringing them home…",
  "Gathering their memories…",
  "Almost there…",
  "Preparing their space…",
];

export default function LoadingScreen({ message }) {
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % LOADING_PHRASES.length), 1800);
    return () => clearInterval(t);
  }, []);

  const phrase = message || LOADING_PHRASES[phraseIdx];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 bg-immortail-deep flex flex-col items-center justify-center z-50"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-64 h-64"
             style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />
      </div>

      {/* Ambient particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${15 + i * 10}%`,
            top:  `${30 + (i % 4) * 12}%`,
            width: 2, height: 2,
            background: 'rgba(201,168,76,0.3)',
          }}
          animate={{ y: [-8, 8, -8], opacity: [0.1, 0.4, 0.1] }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}

      {/* Paw icon — the centrepiece */}
      <div className="relative mb-8">
        <motion.div
          animate={{
            scale:   [1, 1.08, 1],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl"
        >
          🐾
        </motion.div>
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 -m-4 rounded-full border border-immortail-gold/20"
          animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
        />
      </div>

      {/* Brand */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="font-display text-3xl text-immortail-gold mb-2 tracking-wide"
      >
        Immortail™
      </motion.h1>

      {/* Rotating loading phrase */}
      <div className="h-5 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={phrase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-immortail-soft/60 text-sm tracking-wide text-center"
          >
            {phrase}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
