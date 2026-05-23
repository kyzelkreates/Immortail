/**
 * Immortail™ — Live Microphone Recorder
 *
 * FIX v1.3.2:
 *   - handleStop is now properly async with try/catch — errors no longer
 *     leave the component stuck in a "recording" state
 *   - stopFnRef is cleared BEFORE calling onRecorded to prevent re-entrant calls
 *   - Empty blob guard: silently discards zero-byte recordings instead of
 *     passing them upstream where they cause IDB write failures
 *   - Stale-closure guard: if component unmounts mid-recording, stop is
 *     called and blob is discarded (no orphaned MediaRecorder instances)
 *   - UI: "Saving…" state shown between Stop tap and onRecorded completion
 *     so the user knows something is happening on slow mobile audio
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { startRecording } from '../../audio/audioEngine.js';

export default function SoundRecorder({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [saving,    setSaving]    = useState(false);   // between stop tap + onRecorded
  const [elapsed,   setElapsed]   = useState(0);
  const [error,     setError]     = useState('');

  const stopFnRef    = useRef(null);
  const timerRef     = useRef(null);
  const mountedRef   = useRef(true);

  // Track mount state so we don't set state after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // If recording when unmounted, stop cleanly to release microphone
      if (stopFnRef.current) {
        stopFnRef.current().catch(() => {});
        stopFnRef.current = null;
      }
      clearInterval(timerRef.current);
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (recording || saving) return;
    setError('');
    try {
      const { stop } = await startRecording();
      if (!mountedRef.current) {
        // Component unmounted while waiting for mic permission
        stop().catch(() => {});
        return;
      }
      stopFnRef.current = stop;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        if (mountedRef.current) setElapsed(e => e + 1);
      }, 1000);
    } catch (e) {
      if (mountedRef.current) {
        setError('Microphone access denied. Please allow microphone in browser settings.');
      }
    }
  }, [recording, saving]);

  const handleStop = useCallback(async () => {
    // Clear timer immediately so elapsed stops ticking
    clearInterval(timerRef.current);

    // Snapshot and clear the stop function before awaiting
    // This prevents double-stop if the button is tapped twice
    const stopFn = stopFnRef.current;
    stopFnRef.current = null;

    if (mountedRef.current) {
      setRecording(false);
      setSaving(true);   // show "saving" state while blob is processed
      setElapsed(0);
    }

    if (!stopFn) {
      if (mountedRef.current) setSaving(false);
      return;
    }

    try {
      const blob = await stopFn();

      // Guard: discard empty/null blobs — don't pass garbage upstream
      if (!blob || blob.size === 0) {
        console.warn('[SoundRecorder] Recording produced empty blob — discarded.');
        if (mountedRef.current) {
          setSaving(false);
          setError('Recording was empty. Please try again.');
        }
        return;
      }

      // Pass blob to parent — the parent's async handler owns the rest
      if (mountedRef.current) {
        onRecorded(blob);
      }
    } catch (e) {
      console.error('[SoundRecorder] Stop/encode failed:', e);
      if (mountedRef.current) {
        setError('Recording failed. Please try again.');
      }
    } finally {
      // Always clear saving state — parent will show its own uploading indicator
      if (mountedRef.current) setSaving(false);
    }
  }, [onRecorded]);

  const fmtTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="wait">

        {/* ── Idle: tap to record ──────────────────────────────────────── */}
        {!recording && !saving && (
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
        )}

        {/* ── Active: recording in progress ───────────────────────────── */}
        {recording && (
          <motion.div
            key="recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card border-red-500/30 p-4 flex items-center gap-4 rounded-2xl"
          >
            {/* Pulse dot */}
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
              aria-label="Stop recording"
            >
              ⏹
            </button>
          </motion.div>
        )}

        {/* ── Saving: between stop and onRecorded completing ──────────── */}
        {saving && (
          <motion.div
            key="saving"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card border-white/10 p-4 flex items-center gap-4 rounded-2xl"
          >
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="text-xl inline-block"
            >
              🐾
            </motion.span>
            <p className="text-sm text-immortail-soft">Saving recording…</p>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Error ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-400 text-xs px-1"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
