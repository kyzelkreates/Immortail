/**
 * Immortail™ — useMemoryMoments
 * ─────────────────────────────────────────────────────────────────────────────
 * Gently surfaces memory moments from the user's stored data.
 * Non-invasive. Fully local. No spam.
 *
 * Returns:
 *   moment          — current moment to show (or null)
 *   dismissMoment() — dismiss and surface next after delay
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Photos, MemoryEntries, Sounds, Timeline } from '../core/storage.js';

const MOMENT_INTERVAL_MS = 8 * 60 * 1000;   // surface a moment every 8 min max
const MIN_SESSION_MS     = 90 * 1000;        // wait 90s after opening before first moment
const LAST_MOMENT_KEY    = 'immortail:lastMomentAt';

// Build a moment object from raw data
function buildMoment(type, data, dogName) {
  switch (type) {
    case 'memory': return {
      id:      data.id,
      type:    'memory',
      emoji:   '💭',
      title:   data.title,
      body:    data.text?.slice(0, 120) + (data.text?.length > 120 ? '…' : ''),
      date:    data.date,
      prompt:  `A memory of ${dogName}`,
      data,
    };
    case 'photo': return {
      id:      data.id,
      type:    'photo',
      emoji:   '📷',
      title:   data.metadata?.name || `A photo of ${dogName}`,
      body:    null,
      blob:    data.thumbnail || data.blob,
      date:    data.createdAt,
      prompt:  'Remember this moment?',
      data,
    };
    case 'sound': return {
      id:      data.id,
      type:    'sound',
      emoji:   '🎵',
      title:   data.metadata?.name || `${dogName}'s sound`,
      body:    `A ${data.type || 'sound'} you saved`,
      date:    data.createdAt,
      blob:    data.blob,
      prompt:  `Listen to ${dogName}`,
      data,
    };
    case 'anniversary': return {
      id:      data.id + '_anniv',
      type:    'anniversary',
      emoji:   '⭐',
      title:   data.title,
      body:    buildAnniversaryText(data),
      date:    data.date,
      prompt:  'One year ago today',
      data,
    };
    default: return null;
  }
}

function buildAnniversaryText(event) {
  const date  = new Date(event.date);
  const years = Math.round((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (years === 1) return '1 year ago today';
  if (years > 1)   return `${years} years ago today`;
  const months = Math.round((Date.now() - date.getTime()) / (30 * 24 * 3600 * 1000));
  return months > 0 ? `${months} months ago today` : 'Around this time';
}

function isAnniversaryToday(eventDate) {
  const d   = new Date(eventDate);
  const now = new Date();
  // Within ±2 days and at least 6 months old
  const diffDays = Math.abs(
    (now.getMonth() * 30 + now.getDate()) - (d.getMonth() * 30 + d.getDate())
  );
  const ageMs = Date.now() - d.getTime();
  return diffDays <= 2 && ageMs > 180 * 24 * 3600 * 1000;
}

export function useMemoryMoments(profileId, dogName, { enabled = true } = {}) {
  const [moment, setMoment]   = useState(null);
  const [pool, setPool]       = useState([]);
  const poolIdxRef            = useRef(0);
  const timerRef              = useRef(null);
  const sessionStartRef       = useRef(Date.now());

  // ── Load moment pool from storage ─────────────────────────────────────────
  useEffect(() => {
    if (!profileId || !enabled) return;

    (async () => {
      try {
        const [photos, sounds, memories, timeline] = await Promise.all([
          Photos.listByProfile(profileId),
          Sounds.listByProfile(profileId),
          MemoryEntries.listByProfile(profileId),
          Timeline.listByProfile(profileId),
        ]);

        const moments = [];

        // Anniversaries first (highest priority)
        timeline.forEach(ev => {
          if (ev.date && isAnniversaryToday(ev.date)) {
            const m = buildMoment('anniversary', ev, dogName);
            if (m) moments.push({ ...m, priority: 10 });
          }
        });

        // Written memories
        memories.forEach(mem => {
          const m = buildMoment('memory', mem, dogName);
          if (m) moments.push({ ...m, priority: 5 });
        });

        // Photos (pick a few, prioritise older ones for nostalgia)
        const sortedPhotos = [...photos].sort((a, b) => a.createdAt - b.createdAt);
        sortedPhotos.slice(0, Math.min(6, photos.length)).forEach(photo => {
          const m = buildMoment('photo', photo, dogName);
          if (m) moments.push({ ...m, priority: 3 });
        });

        // Sounds
        sounds.slice(0, 4).forEach(sound => {
          const m = buildMoment('sound', sound, dogName);
          if (m) moments.push({ ...m, priority: 4 });
        });

        // Sort by priority desc, then shuffle within priority groups
        moments.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return Math.random() - 0.5;
        });

        setPool(moments);
        poolIdxRef.current = 0;
      } catch (e) {
        // Non-fatal — memory moments are optional enhancement
        console.warn('[MemoryMoments] Failed to load pool:', e);
      }
    })();
  }, [profileId, dogName, enabled]);

  // ── Schedule surfacing ─────────────────────────────────────────────────────
  const scheduleMoment = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const lastMomentAt = parseInt(localStorage.getItem(LAST_MOMENT_KEY) || '0', 10);
    const sinceLastMs  = Date.now() - lastMomentAt;
    const sinceSession = Date.now() - sessionStartRef.current;

    // Don't show too soon
    if (sinceLastMs < MOMENT_INTERVAL_MS || sinceSession < MIN_SESSION_MS) {
      const waitMs = Math.max(
        MOMENT_INTERVAL_MS - sinceLastMs,
        MIN_SESSION_MS - sinceSession,
        0
      );
      timerRef.current = setTimeout(scheduleMoment, waitMs + 5000);
      return;
    }

    // Surface next moment from pool
    if (pool.length === 0) return;
    const idx   = poolIdxRef.current % pool.length;
    const next  = pool[idx];
    poolIdxRef.current++;
    setMoment(next);
    localStorage.setItem(LAST_MOMENT_KEY, String(Date.now()));
  }, [pool]);

  useEffect(() => {
    if (!enabled || pool.length === 0) return;
    scheduleMoment();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [pool, enabled, scheduleMoment]);

  // ── Dismiss ────────────────────────────────────────────────────────────────
  const dismissMoment = useCallback(() => {
    setMoment(null);
    // Schedule next after interval
    timerRef.current = setTimeout(scheduleMoment, MOMENT_INTERVAL_MS);
  }, [scheduleMoment]);

  return { moment, dismissMoment };
}
