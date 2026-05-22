/**
 * Immortail™ — Live microphone recorder
 */
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startRecording } from '../../audio/audioEngine.js';

export default function SoundRecorder({ onRecorded, disabled }) {
  const [recording, setRecording]   = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const [error, setError]           = useState('');
  const stopFnRef  = useRef(null);
  const timerRef   = useRef(null);

  const handleStart = useCallback(async () => {
    setError('');
    try {
      const { stop } = await startRecording();
      stopFnRef.current = stop;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch (e) {
      setError('Microphone access denied. Please allow microphone in browser settings.');
    }
  }, []);

  const handleStop = useCallback(async () => {
    clearInterval(timerRef.current);
    setRecording(false);
    if (!stopFnRef.current) return;
    const blob = await stopFnRef.current();
    stopFnRef.current = null;
    setElapsed(0);
    if (blob && blob.size > 0) onRecorded(blob);
  }, [onRecorded]);

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">
        {!recording ? (
          <motion.button
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleStart}
            disabled={disabled}
            className="w-full glass-card border-dashed border-white/20 p-4 flex items-center justify-center gap-3
                       text-immortail-soft hover:text-immortail-cream hover:border-red-400/30 transition-all rounded-2xl
                       disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
              🎙️
            </span>
            <span className="text-sm">Record a sound</span>
          </motion.button>
        ) : (
          <motion.div
            key="recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card border-red-500/30 p-4 flex items-center gap-4 rounded-2xl"
          >
            {/* Pulse indicator */}
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-3 h-3 rounded-full bg-red-500 shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-immortail-cream">Recording…</p>
              <p className="text-xs text-immortail-soft">{fmtTime(elapsed)}</p>
            </div>
            <button
              onClick={handleStop}
              className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/50
                         flex items-center justify-center text-red-300 hover:bg-red-500/30 transition-colors"
            >
              ⏹
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="text-red-400 text-xs px-1">{error}</p>
      )}
    </div>
  );
}
