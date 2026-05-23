/**
 * Immortail™ — useQuietCompanion  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages Quiet Companion Mode — a peaceful ambient state where the dog
 * rests without any interaction pressure, prompts, or excessive movement.
 *
 * Returns:
 *   quietMode          — boolean, true when active
 *   activateQuiet()    — enter quiet mode manually
 *   deactivateQuiet()  — exit quiet mode
 *   quietDuration      — seconds spent in quiet mode this session
 *
 * When quietMode is true, the caller should:
 *   - hide interaction panels
 *   - suppress notifications
 *   - apply 'sleeping' or 'sitting' dog state
 *   - use fireplace or night environment
 *   - suppress memory moment cards
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const QUIET_LS_KEY = 'immortail:quietMode';

export function useQuietCompanion({ onActivate, onDeactivate } = {}) {
  // Restore from localStorage (persists across app reopens)
  const [quietMode, setQuietMode] = useState(() => {
    try {
      return localStorage.getItem(QUIET_LS_KEY) === '1';
    } catch { return false; }
  });

  const [quietDuration, setQuietDuration] = useState(0);
  const startTimeRef = useRef(quietMode ? Date.now() : null);
  const timerRef     = useRef(null);

  // ── Duration counter ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quietMode) {
      clearInterval(timerRef.current);
      setQuietDuration(0);
      return;
    }
    startTimeRef.current = startTimeRef.current || Date.now();
    timerRef.current = setInterval(() => {
      setQuietDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 5000); // update every 5s — no need for precise second-counting
    return () => clearInterval(timerRef.current);
  }, [quietMode]);

  const activateQuiet = useCallback(() => {
    startTimeRef.current = Date.now();
    setQuietMode(true);
    try { localStorage.setItem(QUIET_LS_KEY, '1'); } catch {}
    onActivate?.();
  }, [onActivate]);

  const deactivateQuiet = useCallback(() => {
    setQuietMode(false);
    startTimeRef.current = null;
    setQuietDuration(0);
    try { localStorage.removeItem(QUIET_LS_KEY); } catch {}
    onDeactivate?.();
  }, [onDeactivate]);

  // Format duration for display
  const formatDuration = useCallback((secs) => {
    if (secs < 60)   return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  }, []);

  return {
    quietMode,
    activateQuiet,
    deactivateQuiet,
    quietDuration,
    quietDurationLabel: formatDuration(quietDuration),
  };
}
