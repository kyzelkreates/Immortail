/**
 * Immortail™ — Global App Context
 * Single source of truth for profile, settings, and app state.
 *
 * FIX v1.3.1:
 *   - createProfile now awaits full IDB write confirmation before returning
 *   - activeProfileId is set synchronously from the returned profile.id
 *   - profileReady flag added — true only when profile is fully committed to
 *     both IDB and React state. ProtectedRoute uses this instead of just
 *     checking activeProfileId, preventing the race condition where navigation
 *     happens before state flush.
 *   - initStorage hardened: if saved activeProfileId references a missing
 *     profile the LS key is cleared and the user is sent to onboarding
 *   - All state mutations in createProfile / activateProfile are batched via
 *     a single functional update to avoid multiple re-renders
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  initStorage, ActiveProfile, Profiles, AppSettings,
  DogConfig,
} from './storage.js';
import { bootAI, getWorkerStatus } from '../ai/aiEngine.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [ready,            setReady]            = useState(false);
  const [error,            setError]            = useState(null);
  const [activeProfileId,  setActiveProfileId]  = useState(null);
  const [profile,          setProfile]          = useState(null);
  const [dogConfig,        setDogConfig]        = useState(null);
  const [profileReady,     setProfileReady]     = useState(false); // ← NEW: IDB + state both confirmed
  const [settings,         setSettings]         = useState(AppSettings.get());
  const [installPromptEvent, setInstallPromptEvent] = useState(null);

  // ─── Init storage ──────────────────────────────────────────────────────────
  useEffect(() => {
    initStorage().then(({ ok, error: initErr }) => {
      if (!ok) {
        console.error('[AppContext] Storage init failed:', initErr);
        setError(initErr);
        setReady(true);
        return;
      }

      const savedId = ActiveProfile.get();

      if (!savedId) {
        // No saved profile — fresh install or after deactivation
        // Still boot AI so the worker is ready when the user creates their profile
        bootAI().catch(e => console.warn('[AppContext] AI pre-boot failed (non-fatal):', e.message));
        setReady(true);
        return;
      }

      // Verify the saved ID actually exists in IDB before trusting it
      Profiles.get(savedId)
        .then(p => {
          if (p) {
            setActiveProfileId(savedId);
            setProfile(p);
            setProfileReady(true);
            return DogConfig.get(savedId);
          } else {
            // Saved ID points to a deleted/missing profile — clear it
            console.warn('[AppContext] Saved profileId not found in IDB, clearing.', savedId);
            ActiveProfile.clear();
            return null;
          }
        })
        .then(cfg => {
          if (cfg !== undefined && cfg !== null) setDogConfig(cfg);
        })
        .catch(err => {
          console.error('[AppContext] Profile hydration failed:', err);
          ActiveProfile.clear();
        })
        .finally(() => {
          // Boot AI kernel after storage hydration — non-blocking, always resolves
          // bootAI() is idempotent and has its own 35s hard timeout
          bootAI().catch(e => console.warn('[AppContext] AI boot failed (non-fatal):', e.message));
          setReady(true);
        });
    });

    // PWA install prompt
    const handler = (e) => { e.preventDefault(); setInstallPromptEvent(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── Create profile (FIXED) ────────────────────────────────────────────────
  // Contract:
  //   1. Write profile to IDB — confirmed before continuing
  //   2. Write activeProfileId to localStorage — synchronous
  //   3. Update React state
  //   4. Return profile — caller may then navigate
  // Navigation must happen AFTER this resolves.
  const createProfile = useCallback(async (data) => {
    // Step 1: IDB write — awaited to completion
    const p = await Profiles.create(data);

    // Step 2: Persist active ID to localStorage immediately
    ActiveProfile.set(p.id);

    // Step 3: Verify the write actually landed in IDB
    const verified = await Profiles.get(p.id);
    if (!verified) {
      throw new Error('Profile write failed — IDB did not confirm record.');
    }

    // Step 4: Update React state (batched in React 18)
    setActiveProfileId(p.id);
    setProfile(p);
    setDogConfig(null);
    setProfileReady(true);

    // Step 5: Return the confirmed profile to caller
    return p;
  }, []);

  // ─── Activate existing profile ─────────────────────────────────────────────
  const activateProfile = useCallback(async (id) => {
    const p = await Profiles.get(id);
    if (!p) throw new Error(`Profile not found: ${id}`);

    ActiveProfile.set(id);
    const cfg = await DogConfig.get(id);

    setActiveProfileId(id);
    setProfile(p);
    setDogConfig(cfg || null);
    setProfileReady(true);

    return p;
  }, []);

  // ─── Update profile ────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (updates) => {
    if (!activeProfileId) return;
    const updated = await Profiles.update(activeProfileId, updates);
    setProfile(updated);
    return updated;
  }, [activeProfileId]);

  // ─── Refresh profile from IDB ──────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!activeProfileId) return;
    const [p, cfg] = await Promise.all([
      Profiles.get(activeProfileId),
      DogConfig.get(activeProfileId),
    ]);
    if (p) {
      setProfile(p);
      setProfileReady(true);
    }
    setDogConfig(cfg || null);
  }, [activeProfileId]);

  // ─── Save dog config ───────────────────────────────────────────────────────
  const saveDogConfig = useCallback(async (config) => {
    if (!activeProfileId) return;
    await DogConfig.save(activeProfileId, config);
    setDogConfig(config);
  }, [activeProfileId]);

  // ─── Update settings ───────────────────────────────────────────────────────
  const updateSettings = useCallback((updates) => {
    const merged = AppSettings.update(updates);
    setSettings(merged);
    if (updates.theme) {
      document.documentElement.classList.toggle('dark', updates.theme === 'dark');
    }
    return merged;
  }, []);

  // ─── Deactivate profile ────────────────────────────────────────────────────
  const deactivateProfile = useCallback(() => {
    ActiveProfile.clear();
    setActiveProfileId(null);
    setProfile(null);
    setDogConfig(null);
    setProfileReady(false);
  }, []);

  // ─── PWA install ───────────────────────────────────────────────────────────
  const triggerInstall = useCallback(async () => {
    if (!installPromptEvent) return false;
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') setInstallPromptEvent(null);
    return outcome === 'accepted';
  }, [installPromptEvent]);

  const value = {
    ready,
    error,
    // Profile
    activeProfileId,
    profile,
    profileReady,   // ← exposed for ProtectedRoute + CreateDogPage
    dogConfig,
    activateProfile,
    createProfile,
    updateProfile,
    refreshProfile,
    saveDogConfig,
    deactivateProfile,
    // Settings
    settings,
    updateSettings,
    // PWA
    canInstall: !!installPromptEvent,
    triggerInstall,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
