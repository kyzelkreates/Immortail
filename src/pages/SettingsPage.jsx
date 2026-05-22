/**
 * Immortail™ — Settings + Admin + Diagnostics
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import {
  StorageDiagnostics, ProfileIO, AppSettings,
  AICache, AIModels, Profiles, ActiveProfile
} from '../core/storage.js';
import { useAIEngine } from '../hooks/useAIEngine.js';
import { IS_PROD, ROUTES } from '../core/constants.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import NavBar        from '../components/ui/NavBar.jsx';
import { BackupEngine } from '../migration/BackupEngine.js';

export default function SettingsPage({ onOpenRestore }) {
  const navigate                    = useNavigate();
  const { activeProfileId, profile, settings, updateSettings,
          deactivateProfile, refreshProfile } = useApp();
  const { aiStatus, clearCache, rebuild } = useAIEngine(activeProfileId, profile);

  const [stats, setStats]         = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting]     = useState(false);
  const [backingUp, setBackingUp]     = useState(false);
  const [backupDone, setBackupDone]   = useState(false);
  const [confirm, setConfirm]     = useState(null); // confirm dialog type
  const [section, setSection]     = useState('general'); // 'general' | 'diagnostics' | 'danger'

  const loadStats = useCallback(async () => {
    if (!activeProfileId) return;
    const s = await StorageDiagnostics.getStats(activeProfileId);
    setStats(s);
  }, [activeProfileId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ─── Export profile ────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await ProfileIO.exportProfile(activeProfileId);
      const json = JSON.stringify(data, (key, val) => {
        // Blobs can't JSON — skip raw binary in export
        if (val instanceof Blob) return undefined;
        return val;
      }, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `immortail-${profile?.name || 'profile'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // ─── Encrypted backup ────────────────────────────────────────────────────────
  const handleBackup = async () => {
    setBackingUp(true);
    setBackupDone(false);
    try {
      const blob = await BackupEngine.createBackup(activeProfileId);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${profile?.name || 'immortail'}-${new Date().toISOString().slice(0,10)}.immortailbackup`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupDone(true);
      setTimeout(() => setBackupDone(false), 4000);
    } catch (e) {
      alert('Backup failed: ' + e.message);
    } finally {
      setBackingUp(false);
    }
  };

  // ─── Import ────────────────────────────────────────────────────────────────
  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const p    = await ProfileIO.importProfile(data);
      await refreshProfile();
      alert(`✓ Imported ${p.name}'s profile.`);
    } catch (e) {
      alert('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  // ─── Danger actions ────────────────────────────────────────────────────────
  const handleClearAI = async () => {
    await clearCache();
    setConfirm(null);
    alert('AI cache cleared.');
  };

  const handleDeleteProfile = async () => {
    await Profiles.delete(activeProfileId);
    ActiveProfile.clear();
    deactivateProfile();
    navigate(ROUTES.HOME, { replace: true });
  };

  const handleClearAll = async () => {
    await StorageDiagnostics.clearAll();
    deactivateProfile();
    navigate(ROUTES.HOME, { replace: true });
  };

  const fmtSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const SECTIONS = [
    { id: 'general',     label: '⚙️ General'    },
    { id: 'comfort',     label: '🕊️ Comfort'    },
    { id: 'diagnostics', label: '📊 Diagnostics' },
    { id: 'danger',      label: '⚠️ Data'        },
  ];

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">
      <PageHeader title="Settings" subtitle={profile?.name ? `${profile.name}'s profile` : undefined} />

      <div className="px-5 space-y-4">
        {/* Section tabs */}
        <div className="flex gap-1 glass-card p-1 rounded-xl">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                section === s.id
                  ? 'bg-immortail-gold/20 text-immortail-gold'
                  : 'text-immortail-soft hover:text-immortail-cream'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── General ── */}
          {section === 'general' && (
            <motion.div key="general" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Theme */}
              <SettingRow label="Theme" desc="Visual appearance">
                <div className="flex gap-1">
                  {['dark', 'light'].map(t => (
                    <button
                      key={t}
                      onClick={() => updateSettings({ theme: t })}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all capitalize ${
                        settings.theme === t
                          ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                          : 'border-white/10 text-immortail-soft'
                      }`}
                    >
                      {t === 'dark' ? '🌙' : '☀️'} {t}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Sound */}
              <SettingRow label="Sound" desc="Enable audio playback">
                <Toggle
                  value={settings.soundEnabled}
                  onChange={v => updateSettings({ soundEnabled: v })}
                />
              </SettingRow>

              {/* Ambient */}
              <SettingRow label="Ambient sound" desc="Background environment sounds">
                <Toggle
                  value={settings.ambientSoundEnabled}
                  onChange={v => updateSettings({ ambientSoundEnabled: v })}
                />
              </SettingRow>

              {/* Animation quality */}
              <SettingRow label="Animation quality" desc="Reduces battery usage on low">
                <div className="flex gap-1">
                  {['low', 'medium', 'high'].map(q => (
                    <button
                      key={q}
                      onClick={() => updateSettings({ animationQuality: q })}
                      className={`px-2 py-1.5 rounded-lg text-xs border transition-all capitalize ${
                        settings.animationQuality === q
                          ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                          : 'border-white/10 text-immortail-soft'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Demo mode (dev only) */}
              {!IS_PROD && (
                <SettingRow label="Demo mode" desc="[Dev only] Enable mock data">
                  <Toggle
                    value={settings.enableDemoMode}
                    onChange={v => updateSettings({ enableDemoMode: v })}
                  />
                </SettingRow>
              )}

              {/* Backup & Restore */}
              <div className="divider-gold" />
              <div className="space-y-2">
                {/* Encrypted backup — primary */}
                <button
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="btn-ghost w-full text-sm py-3 flex items-center justify-center gap-2"
                >
                  {backingUp ? '⏳ Creating backup…' : backupDone ? '✅ Backup saved!' : '💾 Save encrypted backup'}
                </button>
                {/* Restore wizard */}
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    className="btn-ghost w-full text-sm py-3 flex items-center justify-center gap-2"
                  >
                    📦 Restore from backup
                  </button>
                )}
                {/* Legacy JSON export (kept for compatibility) */}
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="btn-ghost w-full text-xs py-2 opacity-60"
                >
                  {exporting ? '⏳ Exporting…' : '⬇ Export raw JSON (legacy)'}
                </button>
                <label className="block cursor-pointer">
                  <span className="btn-ghost w-full text-xs py-2 flex items-center justify-center gap-2 opacity-60">
                    {importing ? '⏳ Importing…' : '⬆ Import raw JSON (legacy)'}
                  </span>
                  <input
                    type="file"
                    accept=".json,.immortailbackup,application/octet-stream"
                    className="hidden"
                    onChange={e => handleImport(e.target.files?.[0])}
                  />
                </label>
              </div>
            </motion.div>
          )}

          {/* ── Comfort Mode ── */}
          {section === 'comfort' && (
            <motion.div key="comfort" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="glass-card-warm p-4 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🕊️</span>
                  <div>
                    <p className="text-sm font-medium text-immortail-cream">Comfort Mode</p>
                    <p className="text-xs text-immortail-soft">A gentler, calmer experience</p>
                  </div>
                </div>
                <p className="text-xs text-immortail-soft leading-relaxed">
                  Comfort Mode softens wording, reduces emotional intensity, and creates a more peaceful space.
                  Designed for sensitive moments when you just want to be present.
                </p>
              </div>

              <SettingRow label="Comfort Mode" desc="Softer wording and calmer experience">
                <Toggle
                  value={settings.comfortMode || false}
                  onChange={v => updateSettings({ comfortMode: v })}
                />
              </SettingRow>

              <SettingRow label="Reduced animations" desc="Calmer, slower movements">
                <Toggle
                  value={settings.reducedAnimations || false}
                  onChange={v => updateSettings({ reducedAnimations: v, animationQuality: v ? 'low' : 'high' })}
                />
              </SettingRow>

              <SettingRow label="Memory moments" desc="Gently surface old memories while visiting">
                <Toggle
                  value={settings.memoryMomentsEnabled !== false}
                  onChange={v => updateSettings({ memoryMomentsEnabled: v })}
                />
              </SettingRow>

              <SettingRow label="Ambient voice" desc="Calm narration during emotional transitions">
                <Toggle
                  value={settings.ambientSoundEnabled || false}
                  onChange={v => updateSettings({ ambientSoundEnabled: v })}
                />
              </SettingRow>

              <SettingRow label="Peaceful ambience" desc="Auto-match environment to time of day">
                <Toggle
                  value={settings.autoEnv !== false}
                  onChange={v => updateSettings({ autoEnv: v })}
                />
              </SettingRow>
            </motion.div>
          )}

          {/* ── Diagnostics ── */}
          {section === 'diagnostics' && (
            <motion.div key="diagnostics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* AI status */}
              <div className="glass-card p-4">
                <h3 className="text-sm font-medium text-immortail-cream mb-3">🤖 AI Engine</h3>
                <div className="space-y-2 text-sm">
                  <StatusRow label="Status" value={aiStatus} color={aiStatus === 'ready' ? 'text-green-400' : aiStatus === 'loading' ? 'text-yellow-400' : 'text-red-400'} />
                </div>
                <button onClick={() => { clearCache(); rebuild(); }} className="btn-ghost w-full text-xs py-2 mt-3">
                  🔄 Clear AI Cache + Rebuild
                </button>
              </div>

              {/* Storage stats */}
              {stats && (
                <div className="glass-card p-4 space-y-3">
                  <h3 className="text-sm font-medium text-immortail-cream">💾 Storage</h3>
                  <div className="space-y-1.5 text-sm">
                    <StatusRow label="Photos"    value={`${stats.counts.photos} files · ${fmtSize(stats.sizes.photos)}`} />
                    <StatusRow label="Sounds"    value={`${stats.counts.sounds} files · ${fmtSize(stats.sizes.sounds)}`} />
                    <StatusRow label="Memories"  value={`${stats.counts.memories} entries`} />
                    <StatusRow label="Total used" value={fmtSize(stats.sizes.total)} />
                    {stats.quota && (
                      <StatusRow label="Device quota" value={`${fmtSize(stats.quota.usage)} / ${fmtSize(stats.quota.quota)}`} />
                    )}
                  </div>
                  <button onClick={loadStats} className="btn-ghost w-full text-xs py-2">↻ Refresh</button>
                </div>
              )}

              {/* PWA / SW */}
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-medium text-immortail-cream">📱 PWA</h3>
                <StatusRow label="Offline" value={typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Supported' : 'Not supported'} />
                <StatusRow label="Install" value={typeof window !== 'undefined' ? 'Available' : '—'} />
                <button
                  onClick={() => {
                    if (navigator.serviceWorker?.controller) {
                      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                      alert('Cache cleared.');
                    }
                  }}
                  className="btn-ghost w-full text-xs py-2 mt-1"
                >
                  🗑 Clear Service Worker Cache
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Danger zone ── */}
          {section === 'danger' && (
            <motion.div key="danger" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="glass-card border-red-900/30 p-4 space-y-3">
                <h3 className="text-sm font-medium text-red-300">⚠️ Danger Zone</h3>
                <p className="text-xs text-immortail-soft">These actions are irreversible. Proceed carefully.</p>

                <div className="space-y-2">
                  <button
                    onClick={() => setConfirm('clearAI')}
                    className="btn-ghost w-full text-sm py-3 border-yellow-900/50 text-yellow-300"
                  >
                    🤖 Clear AI Cache
                  </button>
                  <button
                    onClick={() => setConfirm('deleteProfile')}
                    className="btn-danger w-full text-sm py-3"
                  >
                    🐾 Delete This Dog Profile
                  </button>
                  <button
                    onClick={() => setConfirm('clearAll')}
                    className="btn-danger w-full text-sm py-3 bg-red-950/60 border-red-800/60"
                  >
                    💣 Clear Everything
                  </button>
                </div>
              </div>

              <p className="text-center text-xs text-immortail-soft/30">
                Immortail™ v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
              </p>
              <p className="text-center text-xs text-immortail-soft/20">
                All data lives on your device only.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            type={confirm}
            onConfirm={() => {
              if (confirm === 'clearAI')        handleClearAI();
              if (confirm === 'deleteProfile')  handleDeleteProfile();
              if (confirm === 'clearAll')       handleClearAll();
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>

      <NavBar />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SettingRow({ label, desc, children }) {
  return (
    <div className="glass-card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-immortail-cream">{label}</p>
        {desc && <p className="text-xs text-immortail-soft mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${value ? 'bg-immortail-gold' : 'bg-white/20'}`}
    >
      <motion.div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
        animate={{ left: value ? '24px' : '2px' }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      />
    </button>
  );
}

function StatusRow({ label, value, color = 'text-immortail-cream' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-immortail-soft text-xs">{label}</span>
      <span className={`text-xs ${color}`}>{value}</span>
    </div>
  );
}

function ConfirmDialog({ type, onConfirm, onCancel }) {
  const messages = {
    clearAI:       { title: 'Clear AI Cache?',       body: 'Your AI personality model will be reset. You can rebuild it anytime.', btn: 'Clear Cache', color: 'text-yellow-300' },
    deleteProfile: { title: 'Delete This Profile?',  body: 'All photos, sounds, and memories for this dog will be permanently deleted.', btn: 'Delete', color: 'text-red-300' },
    clearAll:      { title: 'Delete Everything?',    body: 'ALL profiles, memories, photos, and sounds will be permanently deleted. This cannot be undone.', btn: 'Delete Everything', color: 'text-red-300' },
  };
  const msg = messages[type];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="glass-card w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className={`font-display text-lg ${msg.color}`}>{msg.title}</h3>
        <p className="text-immortail-soft text-sm leading-relaxed">{msg.body}</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="btn-danger flex-1 py-3">{msg.btn}</button>
          <button onClick={onCancel}  className="btn-ghost flex-1 py-3">Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
