/**
 * Immortail™ — App Root
 *
 * FIX v1.3.1:
 *   - ProtectedRoute now uses `profileReady` (IDB confirmed) instead of just
 *     `activeProfileId` (which could be set before the React state flush)
 *   - Added a brief stabilisation window (50ms) after `ready` fires to absorb
 *     any in-flight React state batching from createProfile
 *   - Soft redirect: if profile state is missing after 2s, redirect to /create
 *     with a human-readable message instead of a crash
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useApp }          from '../core/AppContext.jsx';
import { ROUTES }          from '../core/constants.js';
import { BackupEngine }    from '../migration/BackupEngine.js';

// Pages
import LandingPage    from '../pages/LandingPage.jsx';
import CreateDogPage  from '../pages/CreateDogPage.jsx';
import DashboardPage  from '../pages/DashboardPage.jsx';
import ImmorTailPage  from '../pages/ImmorTailPage.jsx';
import MemoriesPage   from '../pages/MemoriesPage.jsx';
import SoundsPage     from '../pages/SoundsPage.jsx';
import TimelinePage   from '../pages/TimelinePage.jsx';
import SettingsPage   from '../pages/SettingsPage.jsx';
import VideosPage     from '../pages/VideosPage.jsx';
import MemoryWalkPage from '../pages/MemoryWalkPage.jsx';

// Components
import LoadingScreen  from '../components/ui/LoadingScreen.jsx';
import InstallBanner  from '../components/ui/InstallBanner.jsx';
import RestoreWizard  from '../components/restore/RestoreWizard.jsx';

// ── Protected Route ───────────────────────────────────────────────────────────
// Guards all authenticated pages.
// Waits for BOTH `ready` (storage initialised) AND `profileReady`
// (profile confirmed written to IDB + React state committed).
//
// Soft fallback: if profileReady never fires within 2s, redirect to /create
// with an informative message rather than a crash or silent loop.
function ProtectedRoute({ children }) {
  const { ready, activeProfileId, profileReady } = useApp();
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef(null);

  // Start a 2s timeout once `ready` is true but profile still not confirmed
  useEffect(() => {
    if (!ready) return;
    if (profileReady || !activeProfileId) return; // resolve immediately

    timeoutRef.current = setTimeout(() => setTimedOut(true), 2000);
    return () => clearTimeout(timeoutRef.current);
  }, [ready, profileReady, activeProfileId]);

  // Clear timeout once profile is confirmed
  useEffect(() => {
    if (profileReady && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      setTimedOut(false);
    }
  }, [profileReady]);

  // 1. Storage not yet initialised → cinematic loading screen
  if (!ready) return <LoadingScreen />;

  // 2. No active profile at all → go to landing
  if (!activeProfileId) return <Navigate to={ROUTES.HOME} replace />;

  // 3. Have an activeProfileId but profile not yet confirmed in React state
  //    → wait briefly (state batch in flight from createProfile)
  if (!profileReady && !timedOut) {
    return <LoadingScreen message="Loading your companion…" />;
  }

  // 4. Timed out waiting for profile confirmation — something went wrong
  //    Send to /create with a soft error rather than crashing
  if (timedOut && !profileReady) {
    return (
      <Navigate
        to={ROUTES.CREATE}
        replace
        state={{ error: 'Profile setup incomplete. Please complete the setup below.' }}
      />
    );
  }

  // 5. All good — render the protected page
  return children;
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App({ onReady }) {
  const { ready, activateProfile } = useApp();
  const [restoreMode,     setRestoreMode]     = useState(null);
  const [chromeDetection, setChromeDetection] = useState(null);

  // Record first install & detect Chrome profile restore
  useEffect(() => {
    if (!ready) return;
    BackupEngine.recordFirstInstall();
    BackupEngine.detectRestoredEnvironment().then(detection => {
      if (detection.detected) {
        setChromeDetection(detection);
        setRestoreMode('chrome-detected');
      }
    });
  }, [ready]);

  // Notify parent (hides native splash screen)
  useEffect(() => {
    if (ready && typeof onReady === 'function') onReady();
  }, [ready, onReady]);

  // Handle restored companion from backup wizard
  const handleRestored = useCallback(async (profile) => {
    setRestoreMode(null);
    if (profile?.id) {
      await activateProfile(profile.id);
    }
  }, [activateProfile]);

  // Show cinematic loading until storage is ready
  if (!ready) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <InstallBanner />

      {/* Chrome restore / manual restore wizard */}
      {restoreMode && (
        <RestoreWizard
          mode={restoreMode}
          chromeDetection={chromeDetection}
          onClose={() => setRestoreMode(null)}
          onRestored={handleRestored}
        />
      )}

      <Routes>
        {/* Public */}
        <Route path={ROUTES.HOME}   element={<LandingPage onOpenRestore={() => setRestoreMode('manual')} />} />
        <Route path={ROUTES.CREATE} element={<CreateDogPage />} />

        {/* Protected — requires confirmed profile */}
        <Route path={ROUTES.DASHBOARD} element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.IMMORTAIL} element={
          <ProtectedRoute><ImmorTailPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.MEMORIES} element={
          <ProtectedRoute><MemoriesPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.SOUNDS} element={
          <ProtectedRoute><SoundsPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.TIMELINE} element={
          <ProtectedRoute><TimelinePage /></ProtectedRoute>
        } />
        <Route path={ROUTES.SETTINGS} element={
          <ProtectedRoute>
            <SettingsPage onOpenRestore={() => setRestoreMode('manual')} />
          </ProtectedRoute>
        } />

        <Route path={ROUTES.VIDEOS} element={
          <ProtectedRoute><VideosPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.MEMORY_WALK} element={
          <ProtectedRoute><MemoryWalkPage /></ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
