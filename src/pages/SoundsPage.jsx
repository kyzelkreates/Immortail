/**
 * Immortail™ — Sound Memories Page
 *
 * FIX v1.3.2 — Onboarding return flow:
 *   - Reads location.state.from === 'setup' to know when entered from dashboard setup
 *   - After first successful recording/upload in setup context, auto-navigates back
 *     to dashboard after a short confirmation delay (1.8s)
 *   - Shows a "Back to setup" banner in setup context
 *   - handleRecorded wrapped in try/finally — setUploading(false) always runs,
 *     preventing UI lock on mobile AudioContext errors
 *   - Duplicate-save guard: savingRef prevents concurrent saves from double-firing
 *   - Error messages surfaced for recording failures (previously swallowed silently)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Sounds } from '../core/storage.js';
import { analyseAudio } from '../audio/audioEngine.js';
import { validateAudioFile } from '../utils/imageUtils.js';
import { SOUND_TYPES, MAX_SOUND_SIZE_MB, MAX_SOUNDS_PER_DOG, ROUTES } from '../core/constants.js';
import PageHeader    from '../components/ui/PageHeader.jsx';
import NavBar        from '../components/ui/NavBar.jsx';
import SoundCard     from '../components/sounds/SoundCard.jsx';
import SoundRecorder from '../components/sounds/SoundRecorder.jsx';

export default function SoundsPage() {
  const { activeProfileId, profile } = useApp();
  const navigate  = useNavigate();
  const location  = useLocation();

  // ── Setup-mode detection ────────────────────────────────────────────────────
  // True when the user arrived here from the Dashboard setup checklist.
  const fromSetup = location.state?.from === 'setup';

  const [sounds, setSounds]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState('');
  const [analysing, setAnalysing] = useState(false);

  // Confirmation banner shown after first save in setup context
  const [savedInSetup, setSavedInSetup] = useState(false);

  // Duplicate-save guard — prevents re-entrant saves if events fire twice
  const savingRef = useRef(false);

  // ── Load sounds ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    try {
      const list = await Sounds.listByProfile(activeProfileId);
      setSounds(list);
    } catch (e) {
      console.warn('[SoundsPage] Failed to load sounds:', e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId]);

  useEffect(() => { load(); }, [load]);

  // ── Auto-return to dashboard after setup save ──────────────────────────────
  // Wait 1.8s so the user sees the confirmation, then go back.
  useEffect(() => {
    if (!savedInSetup || !fromSetup) return;
    const t = setTimeout(() => {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }, 1800);
    return () => clearTimeout(t);
  }, [savedInSetup, fromSetup, navigate]);

  // ── Shared save completion handler ─────────────────────────────────────────
  // Called after any successful save (recording or file upload).
  // If we're in setup context, signals the return flow.
  const onSaveComplete = useCallback(() => {
    if (fromSetup) {
      setSavedInSetup(true); // triggers the auto-return useEffect above
    }
  }, [fromSetup]);

  // ── Process an audio file (upload path) ────────────────────────────────────
  const processAudioFile = useCallback(async (file) => {
    const err = validateAudioFile(file, MAX_SOUND_SIZE_MB);
    if (err) { setError(err); return null; }

    const blob = new Blob([await file.arrayBuffer()], { type: file.type });

    let analysisResult = null;
    let duration = 0;
    try {
      const result = await analyseAudio(blob);
      analysisResult = result;
      duration       = result.duration;
    } catch (e) {
      console.warn('[SoundsPage] Audio analysis failed (non-fatal):', e.message);
    }

    const record = await Sounds.add(activeProfileId, {
      blob,
      type: guessType(file.name, analysisResult),
      metadata: { name: file.name, size: file.size, duration },
    });

    if (analysisResult) {
      await Sounds.update(record.id, { analysed: true, analysisResult }).catch(() => {});
    }
    return record;
  }, [activeProfileId]);

  // ── File upload handler ─────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files) => {
    if (!activeProfileId || savingRef.current) return;
    if (sounds.length + files.length > MAX_SOUNDS_PER_DOG) {
      setError(`Maximum ${MAX_SOUNDS_PER_DOG} sounds allowed.`);
      return;
    }
    savingRef.current = true;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        await processAudioFile(file);
      }
      await load();
      onSaveComplete();
    } catch (e) {
      console.error('[SoundsPage] File upload failed:', e);
      setError('Could not save audio file. Please try again.');
    } finally {
      setUploading(false);
      savingRef.current = false;
    }
  }, [activeProfileId, sounds.length, processAudioFile, load, onSaveComplete]);

  // ── Recording handler ───────────────────────────────────────────────────────
  // FIX: try/finally guarantees setUploading(false) always runs.
  // FIX: savingRef prevents double-fire if onRecorded somehow fires twice.
  // FIX: onSaveComplete() triggers dashboard return in setup context.
  const handleRecorded = useCallback(async (blob) => {
    if (!activeProfileId) return;
    if (savingRef.current) {
      console.warn('[SoundsPage] Concurrent save attempted — ignored.');
      return;
    }

    savingRef.current = true;
    setUploading(true);
    setError('');

    let analysisResult = null;
    let duration = 0;

    try {
      // Step 1: Analyse audio (non-fatal if this fails on mobile)
      try {
        const result = await analyseAudio(blob);
        analysisResult = result;
        duration       = result.duration;
      } catch (analysisErr) {
        console.warn('[SoundsPage] Recording analysis failed (non-fatal):', analysisErr.message);
        // Continue — we can still save the raw blob without analysis
      }

      // Step 2: Save to IDB — this is the critical write
      const record = await Sounds.add(activeProfileId, {
        blob,
        type: 'bark',
        metadata: {
          name:     `Recording — ${new Date().toLocaleTimeString()}`,
          size:     blob.size,
          duration,
        },
      });

      // Step 3: Attach analysis result (non-fatal)
      if (analysisResult) {
        await Sounds.update(record.id, {
          analysed:       true,
          analysisResult,
        }).catch(e => console.warn('[SoundsPage] Analysis attach failed:', e.message));
      }

      // Step 4: Refresh list
      await load();

      // Step 5: Signal save complete — triggers dashboard return if in setup
      onSaveComplete();

    } catch (saveErr) {
      console.error('[SoundsPage] Recording save failed:', saveErr);
      setError('Could not save recording. Please try again.');
    } finally {
      // Always release the lock — even if the save threw
      setUploading(false);
      savingRef.current = false;
    }
  }, [activeProfileId, load, onSaveComplete]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    await Sounds.delete(id);
    setSounds(prev => prev.filter(s => s.id !== id));
  }, []);

  // ── Tag change ─────────────────────────────────────────────────────────────
  const handleTagChange = useCallback(async (id, type) => {
    await Sounds.update(id, { type });
    setSounds(prev => prev.map(s => s.id === id ? { ...s, type } : s));
  }, []);

  // ── Dropzone ────────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles,
    accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'] },
    multiple: true,
    maxSize: MAX_SOUND_SIZE_MB * 1024 * 1024,
    disabled: uploading,
  });

  // ── Batch analyse unanalysed sounds ────────────────────────────────────────
  const analyseAll = useCallback(async () => {
    const unanalysed = sounds.filter(s => !s.analysed && s.blob);
    if (!unanalysed.length) return;
    setAnalysing(true);
    for (const sound of unanalysed) {
      try {
        const result = await analyseAudio(sound.blob);
        await Sounds.update(sound.id, { analysed: true, analysisResult: result });
      } catch {}
    }
    await load();
    setAnalysing(false);
  }, [sounds, load]);

  const unanalysedCount = sounds.filter(s => !s.analysed).length;

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">

      {/* ── Setup-mode banner ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {fromSetup && !savedInSetup && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-4 mb-1 glass-card border border-immortail-gold/25 rounded-2xl
                       px-4 py-3 flex items-center gap-3"
          >
            <span className="text-lg">🎵</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-immortail-cream">Setting up {profile?.name || 'their sounds'}</p>
              <p className="text-xs text-immortail-soft/70 mt-0.5">
                Record a bark or upload a sound — then we'll return you to setup.
              </p>
            </div>
            <button
              onClick={() => navigate(ROUTES.DASHBOARD, { replace: true })}
              className="text-immortail-soft/50 hover:text-immortail-soft text-xs shrink-0 transition-colors"
            >
              Skip →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success confirmation banner ─────────────────────────────────────── */}
      <AnimatePresence>
        {savedInSetup && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-4 mb-1 glass-card border border-green-500/30 rounded-2xl
                       px-4 py-3 flex items-center gap-3"
          >
            <span className="text-lg">✅</span>
            <div className="flex-1">
              <p className="text-xs font-medium text-immortail-cream">Sound saved</p>
              <p className="text-xs text-immortail-soft/70 mt-0.5">Returning to setup…</p>
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="text-immortail-gold text-sm"
            >
              ↻
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PageHeader
        title="Sound Memories"
        subtitle={profile?.name ? `${profile.name}'s voice` : undefined}
        actions={
          unanalysedCount > 0 && !analysing ? (
            <button onClick={analyseAll} className="btn-ghost text-xs px-3 py-2">
              🤖 Analyse {unanalysedCount}
            </button>
          ) : null
        }
      />

      <div className="px-5 space-y-5">

        {/* ── Upload dropzone ─────────────────────────────────────────────── */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all
            ${isDragActive   ? 'border-immortail-gold bg-immortail-gold/10' : 'border-white/15 hover:border-immortail-gold/30'}
            ${uploading      ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="text-4xl mb-3">{uploading ? '⏳' : '🎵'}</div>
          {uploading ? (
            <p className="text-immortail-soft text-sm">Saving locally…</p>
          ) : (
            <>
              <p className="text-immortail-cream text-sm font-medium mb-1">Drop audio files here</p>
              <p className="text-immortail-soft text-xs">MP3 · WAV · OGG · M4A · Max {MAX_SOUND_SIZE_MB}MB</p>
            </>
          )}
        </div>

        {/* ── Live recorder ──────────────────────────────────────────────── */}
        <SoundRecorder onRecorded={handleRecorded} disabled={uploading} />

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-sm text-center"
          >
            {error}
          </motion.p>
        )}

        {/* ── Analysing indicator ────────────────────────────────────────── */}
        {analysing && (
          <div className="glass-card p-3 flex items-center gap-3">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-xl inline-block"
            >
              🤖
            </motion.span>
            <p className="text-sm text-immortail-soft">Analysing sounds locally…</p>
          </div>
        )}

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        {sounds.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {SOUND_TYPES.slice(0, 3).map(type => {
              const count = sounds.filter(s => s.type === type.id).length;
              return (
                <div key={type.id} className="glass-card p-3 text-center">
                  <div className="text-xl mb-1">{type.emoji}</div>
                  <div className="font-display text-lg text-immortail-gold">{count}</div>
                  <div className="text-xs text-immortail-soft">{type.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Sound list ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-8">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-3xl inline-block"
            >
              🐾
            </motion.span>
          </div>
        ) : (
          <AnimatePresence>
            {sounds.length === 0 ? (
              <div className="text-center py-10 text-immortail-soft text-sm">
                <div className="text-4xl mb-3 opacity-40">🎵</div>
                <p>No sounds uploaded yet.</p>
                <p className="text-xs mt-1 opacity-60">
                  Barks, whines, panting — every sound brings them back.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sounds.map(sound => (
                  <SoundCard
                    key={sound.id}
                    sound={sound}
                    onDelete={handleDelete}
                    onTagChange={handleTagChange}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}

      </div>

      <NavBar />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function guessType(filename, analysis) {
  const name = (filename || '').toLowerCase();
  if (name.includes('bark'))                         return 'bark';
  if (name.includes('whine') || name.includes('whin')) return 'whine';
  if (name.includes('pant'))                         return 'pant';
  if (name.includes('walk'))                         return 'walk';
  if (name.includes('collar'))                       return 'collar';
  if (name.includes('howl'))                         return 'howl';
  if (name.includes('growl'))                        return 'growl';
  if (analysis?.barkType?.includes('bark'))          return 'bark';
  return 'other';
}
