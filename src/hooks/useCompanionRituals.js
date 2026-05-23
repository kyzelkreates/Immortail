/**
 * Immortail™ — useCompanionRituals  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages repeatable emotional rituals + favourite spot learning.
 * All local. No network. Privacy-safe.
 *
 * Returns:
 *   rituals          — COMPANION_RITUALS array enriched with usage counts
 *   suggestedRitual  — auto-suggested ritual based on time + history
 *   startRitual(id)  — activate a ritual (logs it, applies env + dogState)
 *   activeRitual     — currently active ritual object or null
 *   stopRitual()     — deactivate current ritual
 *   adaptation       — loaded companion adaptation data
 *   logEnv(env)      — record env usage for preference learning
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CompanionAdaptation } from '../core/storage.js';
import { COMPANION_RITUALS, RITUAL_LS_KEY } from '../core/constants.js';

// Auto-suggest a ritual based on current hour + usage history
function suggestRitual(hour, adaptation) {
  const counts = adaptation?.ritualCounts || {};

  // Time-of-day candidates
  const timeSuggestions = COMPANION_RITUALS.filter(r => {
    if (!r.hour) return false;
    return r.hour.includes(hour);
  });

  if (timeSuggestions.length > 0) {
    // Pick the one used most often at this time
    return timeSuggestions.sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0];
  }

  // Fallback: most used ritual overall
  if (Object.keys(counts).length > 0) {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return COMPANION_RITUALS.find(r => r.id === top[0]) || null;
  }

  return null;
}

export function useCompanionRituals(profileId) {
  const [adaptation,     setAdaptation]     = useState(null);
  const [activeRitual,   setActiveRitual]   = useState(null);
  const [suggestedRitual,setSuggestedRitual]= useState(null);
  const ritualTimerRef = useRef(null);
  const loadedRef      = useRef(false);

  // ── Load adaptation data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!profileId || loadedRef.current) return;
    loadedRef.current = true;

    CompanionAdaptation.get(profileId).then(ad => {
      setAdaptation(ad);
      // Suggest ritual based on current hour + history
      const hour = new Date().getHours();
      setSuggestedRitual(suggestRitual(hour, ad));
    }).catch(() => {});
  }, [profileId]);

  // ── Start ritual ────────────────────────────────────────────────────────────
  const startRitual = useCallback(async (ritualId) => {
    const ritual = COMPANION_RITUALS.find(r => r.id === ritualId);
    if (!ritual || !profileId) return null;

    // Cancel any running ritual timer
    if (ritualTimerRef.current) clearTimeout(ritualTimerRef.current);

    setActiveRitual(ritual);

    // Log to IDB (non-fatal)
    try {
      await CompanionAdaptation.logRitual(profileId, ritualId);
      const updated = await CompanionAdaptation.get(profileId);
      setAdaptation(updated);
    } catch {}

    // Persist active ritual to localStorage for quick restore on re-open
    try {
      localStorage.setItem(RITUAL_LS_KEY, JSON.stringify({
        ritualId,
        startedAt: Date.now(),
      }));
    } catch {}

    return ritual;
  }, [profileId]);

  // ── Stop ritual ─────────────────────────────────────────────────────────────
  const stopRitual = useCallback(() => {
    if (ritualTimerRef.current) clearTimeout(ritualTimerRef.current);
    setActiveRitual(null);
    try { localStorage.removeItem(RITUAL_LS_KEY); } catch {}
  }, []);

  // ── Log env usage ───────────────────────────────────────────────────────────
  const logEnv = useCallback(async (env) => {
    if (!profileId || !env) return;
    try {
      await CompanionAdaptation.logEnv(profileId, env);
    } catch {}
  }, [profileId]);

  // ── Enrich rituals with usage counts ───────────────────────────────────────
  const rituals = COMPANION_RITUALS.map(r => ({
    ...r,
    usageCount: adaptation?.ritualCounts?.[r.id] || 0,
  }));

  return {
    rituals,
    suggestedRitual,
    startRitual,
    stopRitual,
    activeRitual,
    adaptation,
    logEnv,
  };
}
