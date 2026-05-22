/**
 * Immortail™ — usePerformanceGovernor
 * ─────────────────────────────────────────────────────────────────────────────
 * Adaptive performance management. Detects device capability and adjusts
 * animation quality, rendering frequency, and AI throttling.
 * Additive only — surfaces recommendations; does not force-overwrite settings.
 *
 * Returns:
 *   quality        — 'low' | 'medium' | 'high'
 *   rafBudget      — recommended max RAF interval (ms)
 *   shouldThrottle — true when device is stressed
 *   isLowPower     — true when battery < 20% or power-save mode
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const PERF_LS_KEY  = 'immortail:perfProfile';
const FPS_SAMPLES  = 20;          // frames to sample for FPS
const LOW_FPS      = 28;          // below this → throttle
const CRIT_FPS     = 18;          // below this → low quality

function detectHardwareTier() {
  // Logical cores — rough hardware tier signal
  const cores = navigator.hardwareConcurrency || 4;
  const mem   = navigator.deviceMemory || 4; // GB — experimental
  if (cores <= 2 || mem <= 1) return 'low';
  if (cores <= 4 || mem <= 2) return 'medium';
  return 'high';
}

export function usePerformanceGovernor(userQualitySetting = 'high') {
  const [quality,        setQuality]        = useState(userQualitySetting);
  const [rafBudget,      setRafBudget]      = useState(16);  // ~60fps
  const [shouldThrottle, setShouldThrottle] = useState(false);
  const [isLowPower,     setIsLowPower]     = useState(false);

  const fpsRef      = useRef([]);
  const rafRef      = useRef(null);
  const lastFrameTs = useRef(0);
  const activeRef   = useRef(true);

  // ── Battery API ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(battery => {
      const check = () => {
        const low = battery.level < 0.2 || battery.charging === false && battery.level < 0.15;
        setIsLowPower(low);
        if (low) {
          setQuality('low');
          setRafBudget(50);  // ~20fps in low power
        }
      };
      check();
      battery.addEventListener('levelchange',   check);
      battery.addEventListener('chargingchange', check);
      return () => {
        battery.removeEventListener('levelchange',   check);
        battery.removeEventListener('chargingchange', check);
      };
    }).catch(() => {});
  }, []);

  // ── FPS monitor ───────────────────────────────────────────────────────────
  const measureFPS = useCallback(() => {
    if (!activeRef.current) return;
    const now = performance.now();
    const delta = now - lastFrameTs.current;
    lastFrameTs.current = now;

    if (delta > 0 && delta < 1000) {
      fpsRef.current.push(1000 / delta);
      if (fpsRef.current.length > FPS_SAMPLES) {
        fpsRef.current.shift();
      }

      if (fpsRef.current.length === FPS_SAMPLES) {
        const avgFps = fpsRef.current.reduce((a, b) => a + b, 0) / FPS_SAMPLES;

        if (avgFps < CRIT_FPS) {
          setQuality('low');
          setShouldThrottle(true);
          setRafBudget(50);
        } else if (avgFps < LOW_FPS) {
          setQuality(prev => prev === 'high' ? 'medium' : prev);
          setShouldThrottle(true);
          setRafBudget(33);
        } else {
          setShouldThrottle(false);
          // Restore quality based on user setting, capped at hardware tier
          const tier = detectHardwareTier();
          const caps = { low: 'low', medium: 'medium', high: 'high' };
          const cap  = caps[tier] || 'high';
          const q    = userQualitySetting === 'high' && cap !== 'high' ? cap : userQualitySetting;
          setQuality(q);
          setRafBudget(16);
        }

        // Reset after analysis to avoid constant recalc
        fpsRef.current = [];
      }
    }

    rafRef.current = requestAnimationFrame(measureFPS);
  }, [userQualitySetting]);

  useEffect(() => {
    // Delay FPS monitoring to let app settle
    const t = setTimeout(() => {
      lastFrameTs.current = performance.now();
      rafRef.current = requestAnimationFrame(measureFPS);
    }, 3000);

    return () => {
      clearTimeout(t);
      activeRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measureFPS]);

  // ── Respect user quality override ────────────────────────────────────────
  useEffect(() => {
    if (userQualitySetting === 'low' || isLowPower) return; // don't override
    setQuality(userQualitySetting);
  }, [userQualitySetting, isLowPower]);

  // ── Page visibility (pause RAF when hidden) ───────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        activeRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } else {
        activeRef.current = true;
        lastFrameTs.current = performance.now();
        rafRef.current = requestAnimationFrame(measureFPS);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [measureFPS]);

  return { quality, rafBudget, shouldThrottle, isLowPower };
}
