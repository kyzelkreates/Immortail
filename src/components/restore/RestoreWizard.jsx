/**
 * Immortail™ — RestoreWizard
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal wizard for backup restore, Chrome-restore detection, and migration.
 * Additive only — no changes to existing storage contracts.
 *
 * Props:
 *   mode:           'chrome-detected' | 'manual' | 'backup-manager'
 *   onClose():      dismiss wizard (does not destroy existing data)
 *   onRestored(p):  called with restored profile after success
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence }        from 'framer-motion';
import { BackupEngine }                   from '../../migration/BackupEngine.js';
import { ActiveProfile }                  from '../../core/storage.js';

// ── Tiny helpers ───────────────────────────────────────────────────────────────
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';
const fmtDays = (d)  => d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ percent }) {
  return (
    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-4">
      <motion.div
        className="h-full bg-immortail-gold rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, percent)}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Validation badge list ──────────────────────────────────────────────────────
function ValidationReport({ report }) {
  const checks = [
    { label: 'Profile identity',  ok: report.hasProfile  },
    { label: 'AI configuration',  ok: report.hasConfig,  warn: true },
    { label: 'Photos',            ok: report.hasPhotos,  warn: true },
    { label: 'Sounds',            ok: report.hasSounds,  warn: true },
    { label: 'Memories',          ok: report.hasMemories,warn: true },
    { label: 'Timeline',          ok: report.hasTimeline,warn: true },
  ];
  return (
    <div className="space-y-1.5 mt-4">
      {checks.map(c => (
        <div key={c.label} className="flex items-center gap-2 text-sm">
          <span className={c.ok ? 'text-green-400' : c.warn ? 'text-yellow-400' : 'text-red-400'}>
            {c.ok ? '✓' : c.warn ? '⚠' : '✗'}
          </span>
          <span className={c.ok ? 'text-immortail-cream' : 'text-immortail-soft'}>{c.label}</span>
        </div>
      ))}
      {report.warnings.map((w, i) => (
        <p key={i} className="text-xs text-yellow-400/80 mt-1 pl-5">⚠ {w}</p>
      ))}
      {report.errors.map((e, i) => (
        <p key={i} className="text-xs text-red-400 mt-1 pl-5">✗ {e}</p>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main wizard
// ═══════════════════════════════════════════════════════════════════════════════
export default function RestoreWizard({ mode = 'manual', onClose, onRestored, chromeDetection }) {
  const [step, setStep]           = useState(mode === 'chrome-detected' ? 'chrome-detect' : 'pick-file');
  const [file, setFile]           = useState(null);
  const [meta, setMeta]           = useState(null);
  const [report, setReport]       = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [needsPass, setNeedsPass] = useState(false);
  const [progress, setProgress]   = useState({ message: '', percent: 0 });
  const [error, setError]         = useState(null);
  const [restored, setRestored]   = useState(null);
  const fileRef                   = useRef();

  // ── File selection ───────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (f) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setReport(null);
    setMeta(null);
    setNeedsPass(false);

    const m = await BackupEngine.getBackupMeta(f);
    if (m.needsPassphrase) {
      setNeedsPass(true);
      setStep('enter-pass');
      return;
    }
    if (!m.ok) {
      setError(m.error || 'Could not read backup file');
      return;
    }
    setMeta(m);
    setStep('validate');
    await runValidation(f, '');
  }, []);

  const runValidation = async (f, pass) => {
    setError(null);
    const r = await BackupEngine.validateBackup(f || file, pass || passphrase || null);
    setReport(r);
    if (!r.valid) {
      if (r.errors.some(e => e.includes('passphrase') || e.includes('decrypt'))) {
        setNeedsPass(true);
        setStep('enter-pass');
      } else {
        setStep('validate');
      }
    } else {
      setStep('validate');
    }
  };

  // ── Passphrase submit ────────────────────────────────────────────────────
  const handlePassphraseSubmit = async () => {
    setError(null);
    const m = await BackupEngine.getBackupMeta(file);
    // Re-validate with passphrase
    const r = await BackupEngine.validateBackup(file, passphrase);
    if (!r.valid && r.errors.some(e => e.includes('passphrase') || e.includes('decrypt'))) {
      setError('Incorrect passphrase — please try again');
      return;
    }
    const meta2 = r._parsed ? {
      ok: true,
      dogName:     r._parsed.profile?.name,
      ownerName:   r._parsed.profile?.ownerName,
      photoCount:  r._parsed.photos?.length  || 0,
      soundCount:  r._parsed.sounds?.length  || 0,
      memoryCount: r._parsed.memories?.length || 0,
      createdAt:   r._parsed.createdAt,
    } : null;
    setMeta(meta2);
    setReport(r);
    setStep('validate');
  };

  // ── Trigger restore ──────────────────────────────────────────────────────
  const handleRestore = async () => {
    setStep('restoring');
    setError(null);
    try {
      const result = await BackupEngine.restoreBackup(
        file,
        passphrase || null,
        { onProgress: ({ message, percent }) => setProgress({ message, percent }) }
      );
      ActiveProfile.set(result.profile.id);
      setRestored(result);
      setStep('success');
    } catch (e) {
      setError(e.message);
      setStep('validate');
    }
  };

  // ── Try repair ───────────────────────────────────────────────────────────
  const handleRepair = async () => {
    setStep('repairing');
    const { repaired, issues, canProceed } = await BackupEngine.repairBackup(file, passphrase || null);
    if (!canProceed) {
      setError('Could not repair backup: ' + issues.join('; '));
      setStep('validate');
      return;
    }
    // Build a synthetic file from repaired data
    const json = JSON.stringify({ magic: 'IMMORTAIL_BACKUP', version: 1, ...repaired });
    const blob = new Blob([json], { type: 'application/octet-stream' });
    const repairedFile = new File([blob], 'repaired.immortailbackup');
    setFile(repairedFile);
    await runValidation(repairedFile, passphrase);
  };

  // ── Done → call parent ───────────────────────────────────────────────────
  const handleDone = () => {
    if (restored) onRestored?.(restored.profile);
    else          onClose?.();
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && onClose?.()}>

      {/* Backdrop */}
      <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} />

      {/* Panel */}
      <motion.div
        className="relative z-10 w-full max-w-md bg-immortail-deep border border-immortail-gold/20 rounded-2xl overflow-hidden shadow-2xl"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐾</span>
            <span className="font-display text-immortail-gold text-sm font-semibold tracking-wide">
              {step === 'backup-manager' ? 'Backup Manager' : 'Restore Companion'}
            </span>
          </div>
          <button onClick={onClose}
            className="text-immortail-soft hover:text-immortail-cream transition-colors text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ── Chrome restore detection ── */}
            {step === 'chrome-detect' && (
              <motion.div key="chrome-detect"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} className="space-y-4">
                <div className="text-center py-2">
                  <span className="text-4xl block mb-3">🐾</span>
                  <h2 className="font-display text-xl text-immortail-cream mb-2">
                    Welcome back
                  </h2>
                  <p className="text-sm text-immortail-soft leading-relaxed">
                    It looks like you've used Immortail™ before —
                    {chromeDetection?.daysSince !== undefined &&
                      ` your last backup was ${fmtDays(chromeDetection.daysSince)}`}.
                  </p>
                  <p className="text-sm text-immortail-soft mt-2 leading-relaxed">
                    Do you have a <strong className="text-immortail-cream">.immortailbackup</strong> file
                    from your previous device?
                  </p>
                </div>
                <button className="btn-primary w-full" onClick={() => setStep('pick-file')}>
                  📂 Load backup file
                </button>
                <button className="btn-ghost w-full text-sm" onClick={onClose}>
                  Start fresh instead
                </button>
              </motion.div>
            )}

            {/* ── Pick file ── */}
            {step === 'pick-file' && (
              <motion.div key="pick-file"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} className="space-y-4">
                <p className="text-sm text-immortail-soft leading-relaxed">
                  Select your <strong className="text-immortail-cream">.immortailbackup</strong> file
                  to restore your companion to this device.
                </p>

                {/* Drop zone */}
                <label
                  className="block border-2 border-dashed border-immortail-gold/25 hover:border-immortail-gold/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
                >
                  <span className="text-3xl block mb-2">📦</span>
                  <p className="text-sm text-immortail-cream font-medium">Tap to choose file</p>
                  <p className="text-xs text-immortail-soft mt-1">or drag & drop here</p>
                  <p className="text-xs text-immortail-gold/60 mt-2">.immortailbackup</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".immortailbackup,application/octet-stream"
                    className="hidden"
                    onChange={e => handleFileSelect(e.target.files?.[0])}
                  />
                </label>

                {error && <p className="text-xs text-red-400 text-center">{error}</p>}
              </motion.div>
            )}

            {/* ── Enter passphrase ── */}
            {step === 'enter-pass' && (
              <motion.div key="enter-pass"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} className="space-y-4">
                <div className="text-center">
                  <span className="text-3xl block mb-2">🔐</span>
                  <h3 className="text-base font-medium text-immortail-cream">Passphrase required</h3>
                  <p className="text-xs text-immortail-soft mt-1">
                    This backup was created with a passphrase.
                  </p>
                </div>
                <input
                  type="password"
                  placeholder="Enter passphrase…"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePassphraseSubmit()}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-immortail-cream placeholder:text-immortail-soft/50 outline-none focus:border-immortail-gold/40 transition-colors"
                  autoFocus
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button className="btn-primary w-full" onClick={handlePassphraseSubmit}>
                  Unlock backup
                </button>
                <button className="btn-ghost w-full text-xs" onClick={() => setStep('pick-file')}>
                  ← Choose different file
                </button>
              </motion.div>
            )}

            {/* ── Validate / confirm ── */}
            {step === 'validate' && (
              <motion.div key="validate"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} className="space-y-4">

                {/* Companion card */}
                {meta && (
                  <div className="glass-card-warm p-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">🐾</span>
                      <div>
                        <p className="text-base font-medium text-immortail-cream">
                          {meta.dogName || 'Your companion'}
                        </p>
                        {meta.ownerName && (
                          <p className="text-xs text-immortail-soft">{meta.ownerName}'s dog</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { n: meta.photoCount,  label: 'photos'  },
                        { n: meta.soundCount,  label: 'sounds'  },
                        { n: meta.memoryCount, label: 'memories'},
                      ].map(({ n, label }) => (
                        <div key={label} className="bg-white/5 rounded-lg py-2">
                          <p className="text-base font-semibold text-immortail-gold">{n}</p>
                          <p className="text-xs text-immortail-soft">{label}</p>
                        </div>
                      ))}
                    </div>
                    {meta.createdAt && (
                      <p className="text-xs text-immortail-soft/60 text-center mt-2">
                        Backed up {fmtDate(meta.createdAt)}
                      </p>
                    )}
                  </div>
                )}

                {/* Validation report */}
                {report && <ValidationReport report={report} />}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3">
                    <p className="text-xs text-red-400">{error}</p>
                    {report && !report.valid && (
                      <button
                        className="text-xs text-immortail-gold mt-2 underline"
                        onClick={handleRepair}
                      >
                        Try to repair backup
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {report?.valid ? (
                    <button className="btn-primary w-full" onClick={handleRestore}>
                      ✨ Restore {meta?.dogName || 'companion'}
                    </button>
                  ) : (
                    report && !report.valid && (
                      <button className="btn-ghost w-full text-sm" onClick={handleRepair}>
                        🔧 Attempt repair
                      </button>
                    )
                  )}
                  <button className="btn-ghost w-full text-sm"
                    onClick={() => { setStep('pick-file'); setFile(null); setReport(null); setMeta(null); setError(null); }}>
                    ← Choose different file
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Restoring (progress) ── */}
            {(step === 'restoring' || step === 'repairing') && (
              <motion.div key="restoring"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-4 py-4 text-center">
                <span className="text-4xl block animate-pulse">🐾</span>
                <h3 className="font-display text-lg text-immortail-cream">
                  {step === 'repairing' ? 'Repairing backup…' : 'Bringing them home…'}
                </h3>
                <p className="text-sm text-immortail-soft">{progress.message || 'Please wait…'}</p>
                <ProgressBar percent={progress.percent} />
                <p className="text-xs text-immortail-soft/50 mt-2">
                  Your existing data is safe — we'll roll back if anything goes wrong.
                </p>
              </motion.div>
            )}

            {/* ── Success ── */}
            {step === 'success' && restored && (
              <motion.div key="success"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="space-y-4 py-4 text-center">
                <motion.span
                  className="text-5xl block"
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, delay: 0.1 }}
                >
                  🐾
                </motion.span>
                <h3 className="font-display text-xl text-immortail-cream">
                  {restored.profile?.name} is home
                </h3>
                <p className="text-sm text-immortail-soft leading-relaxed">
                  Your companion has been fully restored.
                  {restored.photoCount  > 0 && ` ${restored.photoCount} photos,`}
                  {restored.soundCount  > 0 && ` ${restored.soundCount} sounds,`}
                  {restored.memoryCount > 0 && ` ${restored.memoryCount} memories`}
                  {' '}— all safe.
                </p>
                <button className="btn-primary w-full" onClick={handleDone}>
                  ✨ Open companion
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
