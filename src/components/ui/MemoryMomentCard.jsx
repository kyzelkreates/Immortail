/**
 * Immortail™ — MemoryMomentCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Gentle, non-invasive card that surfaces a memory moment.
 * Appears as a soft overlay at the bottom of the screen.
 * Auto-dismisses after 12 seconds. No notification spam.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { playBlob } from '../../audio/audioEngine.js';

const AUTO_DISMISS_MS = 12000;

export default function MemoryMomentCard({ moment, onDismiss, soundEnabled = true }) {
  const [blobUrl,   setBlobUrl]   = useState(null);
  const [playing,   setPlaying]   = useState(false);
  const timerRef                  = useRef(null);

  // Build object URL for photo blob
  useEffect(() => {
    if (moment?.blob instanceof Blob) {
      const url = URL.createObjectURL(moment.blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl(null);
  }, [moment?.blob]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!moment) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onDismiss?.(), AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
  }, [moment, onDismiss]);

  const handlePlay = useCallback(async () => {
    if (!moment?.blob || playing || !soundEnabled) return;
    setPlaying(true);
    try {
      await playBlob(moment.blob, { volume: 0.7 });
    } catch (_) {}
    setPlaying(false);
  }, [moment, playing, soundEnabled]);

  const fmtDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <AnimatePresence>
      {moment && (
        <motion.div
          key={moment.id}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 200 }}
          className="fixed bottom-24 left-4 right-4 z-40 pointer-events-auto"
        >
          <div className="glass-card-warm rounded-2xl p-4 shadow-2xl border border-immortail-gold/20 max-w-sm mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{moment.emoji}</span>
                <span className="text-xs text-immortail-gold/80 font-medium tracking-wide uppercase">
                  {moment.prompt}
                </span>
              </div>
              <button
                onClick={onDismiss}
                className="text-immortail-soft/50 hover:text-immortail-soft transition-colors text-sm leading-none"
                aria-label="Dismiss"
              >✕</button>
            </div>

            {/* Photo preview */}
            {blobUrl && moment.type === 'photo' && (
              <div className="rounded-xl overflow-hidden mb-3 h-28 bg-black/20">
                <img
                  src={blobUrl}
                  alt={moment.title}
                  className="w-full h-full object-cover opacity-90"
                  loading="lazy"
                />
              </div>
            )}

            {/* Content */}
            <p className="text-sm font-medium text-immortail-cream line-clamp-1">{moment.title}</p>
            {moment.body && (
              <p className="text-xs text-immortail-soft mt-1 line-clamp-2 leading-relaxed">
                {moment.body}
              </p>
            )}
            {moment.date && (
              <p className="text-xs text-immortail-gold/50 mt-1.5">{fmtDate(moment.date)}</p>
            )}

            {/* Sound play button */}
            {moment.type === 'sound' && moment.blob && (
              <button
                onClick={handlePlay}
                disabled={playing}
                className="mt-3 flex items-center gap-2 text-xs text-immortail-gold hover:text-immortail-cream transition-colors"
              >
                <span>{playing ? '⏸' : '▶'}</span>
                <span>{playing ? 'Playing…' : 'Play sound'}</span>
              </button>
            )}

            {/* Progress bar */}
            <div className="mt-3 h-px bg-white/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-immortail-gold/30 rounded-full"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
