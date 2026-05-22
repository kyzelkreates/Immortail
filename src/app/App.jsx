import { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from '../core/AppContext.jsx';
import { ROUTES } from '../core/constants.js';
import { BackupEngine } from '../migration/BackupEngine.js';

// Pages
import LandingPage    from '../pages/LandingPage.jsx';
import CreateDogPage  from '../pages/CreateDogPage.jsx';
import DashboardPage  from '../pages/DashboardPage.jsx';
import ImmorTailPage  from '../pages/ImmorTailPage.jsx';
import MemoriesPage   from '../pages/MemoriesPage.jsx';
import SoundsPage     from '../pages/SoundsPage.jsx';
import TimelinePage   from '../pages/TimelinePage.jsx';
import SettingsPage   from '../pages/SettingsPage.jsx';

// Components
import LoadingScreen  from '../components/ui/LoadingScreen.jsx';
import InstallBanner  from '../components/ui/InstallBanner.jsx';
import RestoreWizard  from '../components/restore/RestoreWizard.jsx';

// Protected route — requires an active profile
function ProtectedRoute({ children }) {
  const { activeProfileId, ready } = useApp();
  if (!ready) return <LoadingScreen />;
  if (!activeProfileId) return <Navigate to={ROUTES.HOME} replace />;
  return children;
}

export default function App({ onReady }) {
  const { ready, activateProfile } = useApp();
  const [restoreMode,      setRestoreMode]      = useState(null); // null | 'chrome-detected' | 'manual'
  const [chromeDetection,  setChromeDetection]  = useState(null);

  // ── Record first-install & detect Chrome profile restore ─────────────────
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

  // ── onReady callback ──────────────────────────────────────────────────────
  useEffect(() => {
    if (ready && typeof onReady === 'function') onReady();
  }, [ready, onReady]);

  // ── Handle restored companion ─────────────────────────────────────────────
  const handleRestored = useCallback(async (profile) => {
    setRestoreMode(null);
    if (profile?.id) {
      await activateProfile(profile.id);
    }
  }, [activateProfile]);

  if (!ready) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <InstallBanner />

      {/* Chrome restore / manual restore wizard (rendered above all routes) */}
      {restoreMode && (
        <RestoreWizard
          mode={restoreMode}
          chromeDetection={chromeDetection}
          onClose={() => setRestoreMode(null)}
          onRestored={handleRestored}
        />
      )}

      <Routes>
        <Route path={ROUTES.HOME}      element={<LandingPage onOpenRestore={() => setRestoreMode('manual')} />} />
        <Route path={ROUTES.CREATE}    element={<CreateDogPage />} />

        <Route path={ROUTES.DASHBOARD} element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.IMMORTAIL} element={
          <ProtectedRoute><ImmorTailPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.MEMORIES}  element={
          <ProtectedRoute><MemoriesPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.SOUNDS}    element={
          <ProtectedRoute><SoundsPage /></ProtectedRoute>
        } />
        <Route path={ROUTES.TIMELINE}  element={
          <ProtectedRoute><TimelinePage /></ProtectedRoute>
        } />
        <Route path={ROUTES.SETTINGS}  element={
          <ProtectedRoute>
            <SettingsPage onOpenRestore={() => setRestoreMode('manual')} />
          </ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
