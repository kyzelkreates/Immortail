/**
 * Immortail™ — Global App Context
 * Provides active profile, settings, and shared state to the entire tree.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  initStorage, ActiveProfile, Profiles, AppSettings,
  DogConfig, StorageDiagnostics
} from './storage.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [ready, setReady]               = useState(false);
  const [error, setError]               = useState(null);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [profile, setProfile]           = useState(null);
  const [dogConfig, setDogConfig]       = useState(null);
  const [settings, setSettings]         = useState(AppSettings.get());
  const [installPromptEvent, setInstallPromptEvent] = useState(null);

  // ─── Init storage ──────────────────────────────────────────────────────────
  useEffect(() => {
    initStorage().then(({ ok, error }) => {
      if (!ok) { setError(error); setReady(true); return; }
      const savedId = ActiveProfile.get();
      if (savedId) {
        Profiles.get(savedId).then(p => {
          if (p) {
            setActiveProfileId(savedId);
            setProfile(p);
            DogConfig.get(savedId).then(cfg => setDogConfig(cfg));
          } else {
            ActiveProfile.clear();
          }
          setReady(true);
        });
      } else {
        setReady(true);
      }
    });

    // PWA install prompt
    const handler = (e) => { e.preventDefault(); setInstallPromptEvent(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── Set active profile ────────────────────────────────────────────────────
  const activateProfile = useCallback(async (id) => {
    const p = await Profiles.get(id);
    if (!p) throw new Error('Profile not found');
    ActiveProfile.set(id);
    setActiveProfileId(id);
    setProfile(p);
    const cfg = await DogConfig.get(id);
    setDogConfig(cfg);
  }, []);

  // ─── Create profile ────────────────────────────────────────────────────────
  const createProfile = useCallback(async (data) => {
    const p = await Profiles.create(data);
    ActiveProfile.set(p.id);
    setActiveProfileId(p.id);
    setProfile(p);
    setDogConfig(null);
    return p;
  }, []);

  // ─── Update profile ────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (updates) => {
    if (!activeProfileId) return;
    const updated = await Profiles.update(activeProfileId, updates);
    setProfile(updated);
    return updated;
  }, [activeProfileId]);

  // ─── Refresh profile from DB ───────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (!activeProfileId) return;
    const [p, cfg] = await Promise.all([
      Profiles.get(activeProfileId),
      DogConfig.get(activeProfileId)
    ]);
    if (p) setProfile(p);
    if (cfg !== dogConfig) setDogConfig(cfg);
  }, [activeProfileId, dogConfig]);

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
    // Apply theme
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
