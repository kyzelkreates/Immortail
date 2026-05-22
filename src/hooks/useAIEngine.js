/**
 * Immortail™ — useAIEngine hook
 * React interface to the AI engine and reconstruction pipeline.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initAI, destroyAI, getWorkerStatus,
  onStatusChange, reconstructDog
} from '../ai/aiEngine.js';
import { AICache } from '../core/storage.js';
import { AI_ANALYSIS } from '../core/constants.js';

export function useAIEngine(profileId, profile) {
  const [status, setStatus]           = useState(getWorkerStatus);
  const [reconstructing, setReconstructing] = useState(false);
  const [progress, setProgress]       = useState(null); // { step, pct }
  const [error, setError]             = useState(null);
  const [config, setConfig]           = useState(null);
  const mountedRef = useRef(true);

  // Init AI engine once
  useEffect(() => {
    initAI();
    const unsub = onStatusChange(s => { if (mountedRef.current) setStatus(s); });
    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, []);

  // Load cached config
  useEffect(() => {
    if (!profileId) return;
    AICache.get(profileId, AI_ANALYSIS.COMBINED).then(cached => {
      if (cached && mountedRef.current) setConfig(cached);
    });
  }, [profileId]);

  const rebuild = useCallback(async () => {
    if (!profileId || !profile) return;
    setReconstructing(true);
    setError(null);
    setProgress({ step: 'starting', pct: 0 });

    try {
      const result = await reconstructDog(profileId, profile, (p) => {
        if (mountedRef.current) setProgress(p);
      });
      if (mountedRef.current) {
        setConfig(result);
        await AICache.save(profileId, AI_ANALYSIS.COMBINED, result);
      }
      return result;
    } catch (e) {
      if (mountedRef.current) setError(e.message);
      return null;
    } finally {
      if (mountedRef.current) {
        setReconstructing(false);
        setProgress(null);
      }
    }
  }, [profileId, profile]);

  const clearCache = useCallback(async () => {
    if (!profileId) return;
    await AICache.deleteByProfile(profileId);
    setConfig(null);
  }, [profileId]);

  return {
    aiStatus:       status,
    aiReady:        status === 'ready',
    reconstructing,
    progress,
    error,
    config,
    rebuild,
    clearCache,
  };
}
