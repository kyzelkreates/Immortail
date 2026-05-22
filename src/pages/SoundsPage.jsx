import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Sounds } from '../core/storage.js';
import { analyseAudio } from '../audio/audioEngine.js';
import { validateAudioFile, formatFileSize } from '../utils/imageUtils.js';
import { SOUND_TYPES, MAX_SOUND_SIZE_MB, MAX_SOUNDS_PER_DOG } from '../core/constants.js';
import PageHeader    from '../components/ui/PageHeader.jsx';
import NavBar        from '../components/ui/NavBar.jsx';
import SoundCard     from '../components/sounds/SoundCard.jsx';
import SoundRecorder from '../components/sounds/SoundRecorder.jsx';

export default function SoundsPage() {
  const { activeProfileId, profile } = useApp();
  const [sounds, setSounds]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState('');
  const [analysing, setAnalysing]     = useState(false);

  const load = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    const list = await Sounds.listByProfile(activeProfileId);
    setSounds(list);
    setLoading(false);
  }, [activeProfileId]);

  useEffect(() => { load(); }, [load]);

  // ─── Upload files ──────────────────────────────────────────────────────────
  const processAudioFile = useCallback(async (file) => {
    const err = validateAudioFile(file, MAX_SOUND_SIZE_MB);
    if (err) { setError(err); return null; }

    const blob = new Blob([await file.arrayBuffer()], { type: file.type });

    // Analyse audio locally
    let analysisResult = null;
    let duration = 0;
    try {
      const result = await analyseAudio(blob);
      analysisResult = result;
      duration       = result.duration;
    } catch {}

    const record = await Sounds.add(activeProfileId, {
      blob,
      type: guessType(file.name, analysisResult),
      metadata: { name: file.name, size: file.size, duration },
    });

    if (analysisResult) {
      await Sounds.update(record.id, { analysed: true, analysisResult });
    }
    return record;
  }, [activeProfileId]);

  const handleFiles = useCallback(async (files) => {
    if (!activeProfileId) return;
    if (sounds.length + files.length > MAX_SOUNDS_PER_DOG) {
      setError(`Maximum ${MAX_SOUNDS_PER_DOG} sounds allowed.`);
      return;
    }
    setUploading(true);
    setError('');
    for (const file of files) {
      await processAudioFile(file);
    }
    await load();
    setUploading(false);
  }, [activeProfileId, sounds.length, processAudioFile, load]);

  // ─── Recording ────────────────────────────────────────────────────────────
  const handleRecorded = useCallback(async (blob) => {
    if (!activeProfileId) return;
    setUploading(true);
    let analysisResult = null;
    let duration = 0;
    try {
      const result = await analyseAudio(blob);
      analysisResult = result;
      duration       = result.duration;
    } catch {}
    const record = await Sounds.add(activeProfileId, {
      blob,
      type: 'bark',
      metadata: { name: `Recording ${new Date().toLocaleTimeString()}`, size: blob.size, duration },
    });
    if (analysisResult) {
      await Sounds.update(record.id, { analysed: true, analysisResult });
    }
    await load();
    setUploading(false);
  }, [activeProfileId, load]);

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    await Sounds.delete(id);
    setSounds(prev => prev.filter(s => s.id !== id));
  }, []);

  // ─── Tag change ───────────────────────────────────────────────────────────
  const handleTagChange = useCallback(async (id, type) => {
    await Sounds.update(id, { type });
    setSounds(prev => prev.map(s => s.id === id ? { ...s, type } : s));
  }, []);

  // ─── Dropzone ─────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFiles,
    accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac', '.flac'] },
    multiple: true,
    maxSize: MAX_SOUND_SIZE_MB * 1024 * 1024,
    disabled: uploading,
  });

  // ─── Analyse all (batch) ──────────────────────────────────────────────────
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
        {/* Upload zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all
            ${isDragActive ? 'border-immortail-gold bg-immortail-gold/10' : 'border-white/15 hover:border-immortail-gold/30'}
            ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="text-4xl mb-3">{uploading ? '⏳' : '🎵'}</div>
          {uploading ? (
            <p className="text-immortail-soft text-sm">Processing audio locally…</p>
          ) : (
            <>
              <p className="text-immortail-cream text-sm font-medium mb-1">Drop audio files here</p>
              <p className="text-immortail-soft text-xs">MP3 · WAV · OGG · M4A · Max {MAX_SOUND_SIZE_MB}MB</p>
            </>
          )}
        </div>

        {/* Recorder */}
        <SoundRecorder onRecorded={handleRecorded} disabled={uploading} />

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Analysing indicator */}
        {analysing && (
          <div className="glass-card p-3 flex items-center gap-3">
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-xl inline-block">🤖</motion.span>
            <p className="text-sm text-immortail-soft">Analysing sounds locally…</p>
          </div>
        )}

        {/* Stats */}
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

        {/* Sound list */}
        {loading ? (
          <div className="text-center py-8">
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-3xl inline-block">🐾</motion.span>
          </div>
        ) : (
          <AnimatePresence>
            {sounds.length === 0 ? (
              <div className="text-center py-10 text-immortail-soft text-sm">
                <div className="text-4xl mb-3 opacity-40">🎵</div>
                <p>No sounds uploaded yet.</p>
                <p className="text-xs mt-1 opacity-60">Barks, whines, panting — every sound brings them back.</p>
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
  if (name.includes('bark'))   return 'bark';
  if (name.includes('whine') || name.includes('whin')) return 'whine';
  if (name.includes('pant'))   return 'pant';
  if (name.includes('walk'))   return 'walk';
  if (name.includes('collar')) return 'collar';
  if (name.includes('howl'))   return 'howl';
  if (name.includes('growl'))  return 'growl';
  if (analysis?.barkType?.includes('bark')) return 'bark';
  return 'other';
}
