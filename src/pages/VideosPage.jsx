/**
 * Immortail™ — Video Memories Page  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload video memories (mp4, mov, webm).
 * Local AI worker extracts audio and analyses sounds + environment.
 * Extracted audio is saved as a Sound record for personality reconstruction.
 * All processing is local-only — no cloud, no uploads.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Videos, Sounds } from '../core/storage.js';
import { MAX_VIDEO_SIZE_MB, MAX_VIDEOS_PER_DOG, SUPPORTED_VIDEO_TYPES } from '../core/constants.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import NavBar     from '../components/ui/NavBar.jsx';

// ── Video worker interface ─────────────────────────────────────────────────────
let _videoWorker = null;
let _videoMsgId  = 0;
const _videoPending = new Map();

function getVideoWorker() {
  if (_videoWorker) return _videoWorker;
  _videoWorker = new Worker(
    new URL('../workers/videoWorker.js', import.meta.url),
    { type: 'module' }
  );
  _videoWorker.onmessage = ({ data }) => {
    const { type, id, result, error, pct, step } = data;
    const pending = _videoPending.get(id);
    if (!pending) return;

    if (type === 'PROGRESS') {
      pending.onProgress?.({ pct, step });
      return;
    }

    _videoPending.delete(id);
    if (type === 'ERROR') pending.reject(new Error(error));
    else                   pending.resolve(result);
  };
  _videoWorker.onerror = (e) => {
    console.error('[VideoWorker] Fatal error:', e);
    _videoPending.forEach(p => p.reject(new Error('Video worker crashed')));
    _videoPending.clear();
    _videoWorker = null;
  };
  return _videoWorker;
}

function sendToVideoWorker(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++_videoMsgId;
    _videoPending.set(id, { resolve, reject, onProgress });
    getVideoWorker().postMessage({ type, id, payload });
    // 3-minute timeout for large video files
    setTimeout(() => {
      if (_videoPending.has(id)) {
        _videoPending.delete(id);
        reject(new Error('Video processing timed out'));
      }
    }, 3 * 60 * 1000);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VideosPage() {
  const { activeProfileId, profile } = useApp();
  const [videos,     setVideos]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress]   = useState(null);  // { pct, step, fileName }
  const [error,      setError]      = useState('');
  const processingRef = useRef(false);

  // ── Load videos ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    try {
      const list = await Videos.listByProfile(activeProfileId);
      // Sort newest first
      list.sort((a, b) => b.createdAt - a.createdAt);
      setVideos(list);
    } catch (e) {
      console.warn('[VideosPage] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId]);

  useEffect(() => { load(); }, [load]);

  // ── Process a video file ────────────────────────────────────────────────────
  const processVideo = useCallback(async (file) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setError('');
    setProgress({ pct: 0, step: 'reading file', fileName: file.name });

    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });

      // Step 1: Save immediately so user sees it (processed=false)
      const record = await Videos.add(activeProfileId, {
        blob,
        thumbnail:  null,
        metadata: {
          name:     file.name,
          type:     file.type,
          size:     file.size,
          duration: 0,
        },
      });

      setProgress({ pct: 10, step: 'analysing video', fileName: file.name });

      // Step 2: Send to worker for audio extraction + analysis
      let workerResult = null;
      try {
        workerResult = await sendToVideoWorker(
          'ANALYSE_VIDEO',
          { videoBlob: blob, fileName: file.name },
          ({ pct, step }) => {
            setProgress({ pct: 10 + Math.floor(pct * 0.8), step, fileName: file.name });
          }
        );
      } catch (workerErr) {
        console.warn('[VideosPage] Worker analysis failed (non-fatal):', workerErr.message);
        // Continue — we can still save the video without analysis
      }

      // Step 3: Update video record with analysis result
      if (workerResult) {
        await Videos.update(record.id, {
          extractedSoundBlob: workerResult.audioBlob || null,
          analysis:           workerResult.videoAnalysis || null,
          processed:          true,
        });

        // Step 4: If audio was extracted + has bark → also save as a Sound
        // This feeds into personality reconstruction automatically
        if (workerResult.audioBlob && workerResult.audioAnalysis?.hasBark) {
          try {
            const soundName = file.name.replace(/\.[^.]+$/, '') + ' (from video)';
            const soundRecord = await Sounds.add(activeProfileId, {
              blob:     workerResult.audioBlob,
              type:     workerResult.audioAnalysis.barkType?.includes('bark') ? 'bark' : 'other',
              metadata: {
                name:     soundName,
                size:     workerResult.audioBlob.size,
                duration: workerResult.audioAnalysis.duration || 0,
                source:   'video_extract',
              },
            });
            // Attach analysis result
            await Sounds.update(soundRecord.id, {
              analysed:       true,
              analysisResult: workerResult.audioAnalysis,
            });
          } catch (soundErr) {
            console.warn('[VideosPage] Sound save failed (non-fatal):', soundErr.message);
          }
        }
      }

      setProgress({ pct: 100, step: 'done', fileName: file.name });
      await load();

    } catch (e) {
      console.error('[VideosPage] Video processing failed:', e);
      setError(`Could not process "${file.name}". Please try a smaller video or different format.`);
    } finally {
      processingRef.current = false;
      setProcessing(false);
      setTimeout(() => setProgress(null), 2000);
    }
  }, [activeProfileId, load]);

  // ── Dropzone ───────────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (acceptedFiles) => {
    if (!activeProfileId || processing) return;
    if (videos.length >= MAX_VIDEOS_PER_DOG) {
      setError(`Maximum ${MAX_VIDEOS_PER_DOG} videos allowed.`);
      return;
    }
    for (const file of acceptedFiles) {
      if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
        setError(`"${file.name}" is too large. Maximum ${MAX_VIDEO_SIZE_MB}MB.`);
        continue;
      }
      if (!SUPPORTED_VIDEO_TYPES.includes(file.type) && !file.name.match(/\.(mp4|mov|webm)$/i)) {
        setError(`"${file.name}" is not a supported video format (MP4, MOV, WebM).`);
        continue;
      }
      await processVideo(file);
    }
  }, [activeProfileId, processing, videos.length, processVideo]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: {
      'video/mp4':       ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/webm':      ['.webm'],
    },
    multiple: false,
    disabled: processing,
    maxSize: MAX_VIDEO_SIZE_MB * 1024 * 1024,
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    await Videos.delete(id);
    setVideos(prev => prev.filter(v => v.id !== id));
  }, []);

  const fmtSize  = (bytes) => bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    : `${Math.round(bytes / 1024)}KB`;

  const fmtDate  = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">
      <PageHeader
        title="Video Memories"
        subtitle={profile?.name ? `${profile.name}'s moments` : undefined}
      />

      <div className="px-5 space-y-5">

        {/* ── Info banner ──────────────────────────────────────────────── */}
        <div className="glass-card p-4 flex items-start gap-3 rounded-2xl border border-immortail-gold/15">
          <span className="text-xl shrink-0 mt-0.5">🎬</span>
          <div>
            <p className="text-sm font-medium text-immortail-cream mb-1">Video memory reconstruction</p>
            <p className="text-xs text-immortail-soft/70 leading-relaxed">
              Upload videos of {profile?.name || 'them'}. The local AI will extract their sounds,
              detect bark patterns, and use the footage to make the companion more true to life.
              All processing is private and offline.
            </p>
          </div>
        </div>

        {/* ── Drop zone ─────────────────────────────────────────────────── */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
            ${isDragActive  ? 'border-immortail-gold bg-immortail-gold/10' : 'border-white/15 hover:border-immortail-gold/30'}
            ${processing    ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input {...getInputProps()} />
          <div className="text-5xl mb-4">{processing ? '⏳' : '🎬'}</div>
          {processing ? (
            <div className="space-y-3">
              <p className="text-immortail-cream text-sm font-medium">
                {progress?.fileName ? `Processing "${progress.fileName}"…` : 'Processing video…'}
              </p>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mx-4">
                <motion.div
                  className="h-full bg-gradient-to-r from-immortail-gold to-immortail-gold-light rounded-full"
                  animate={{ width: `${progress?.pct || 0}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <p className="text-xs text-immortail-soft capitalize">{progress?.step || '…'}</p>
            </div>
          ) : (
            <>
              <p className="text-immortail-cream text-sm font-medium mb-2">
                Drop a video memory here
              </p>
              <p className="text-immortail-soft text-xs">
                MP4 · MOV · WebM · Max {MAX_VIDEO_SIZE_MB}MB
              </p>
              <p className="text-immortail-soft/50 text-xs mt-1">
                {MAX_VIDEOS_PER_DOG - videos.length} of {MAX_VIDEOS_PER_DOG} slots remaining
              </p>
            </>
          )}
        </div>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-sm text-center"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ── Video list ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-10">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-3xl inline-block"
            >
              🐾
            </motion.span>
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-10 text-immortail-soft/50 text-sm">
            <div className="text-4xl mb-3 opacity-30">🎬</div>
            <p>No videos uploaded yet.</p>
            <p className="text-xs mt-1 opacity-60">
              Even a short clip helps bring {profile?.name || 'them'} back to life.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                onDelete={handleDelete}
                fmtSize={fmtSize}
                fmtDate={fmtDate}
              />
            ))}
          </div>
        )}

      </div>
      <NavBar />
    </div>
  );
}

// ── Video Card ────────────────────────────────────────────────────────────────
function VideoCard({ video, onDelete, fmtSize, fmtDate }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [playing,       setPlaying]       = useState(false);
  const videoRef = useRef(null);
  const urlRef   = useRef(null);

  const handlePlay = useCallback(() => {
    if (!video.blob) return;
    if (!urlRef.current) {
      urlRef.current = URL.createObjectURL(video.blob);
    }
    setPlaying(true);
  }, [video.blob]);

  const handleClose = useCallback(() => {
    setPlaying(false);
    if (videoRef.current) videoRef.current.pause();
  }, []);

  // Cleanup object URL
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const analysis = video.analysis;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="glass-card rounded-2xl overflow-hidden"
    >
      <div className="p-4 flex items-start gap-3">
        {/* Play button */}
        <button
          onClick={handlePlay}
          disabled={!video.blob}
          className="w-14 h-14 rounded-xl bg-immortail-gold/10 border border-immortail-gold/20
                     flex items-center justify-center text-2xl shrink-0
                     hover:bg-immortail-gold/20 transition-colors disabled:opacity-40"
        >
          🎬
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-immortail-cream truncate">
            {video.metadata?.name || 'Video memory'}
          </p>
          <p className="text-xs text-immortail-soft/60 mt-0.5">
            {fmtDate(video.createdAt)} · {fmtSize(video.metadata?.size || 0)}
          </p>

          {/* Analysis badges */}
          {analysis && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {analysis.hasBark && (
                <span className="text-[10px] bg-immortail-gold/12 text-immortail-gold
                                 border border-immortail-gold/20 px-2 py-0.5 rounded-full">
                  🔊 Bark detected
                </span>
              )}
              {analysis.detectedEnv && (
                <span className="text-[10px] bg-white/6 text-immortail-soft
                                 border border-white/10 px-2 py-0.5 rounded-full capitalize">
                  📍 {analysis.detectedEnv}
                </span>
              )}
              {!video.processed && (
                <span className="text-[10px] bg-white/6 text-immortail-soft/50
                                 border border-white/8 px-2 py-0.5 rounded-full">
                  ⏳ Processing…
                </span>
              )}
              {video.processed && !analysis.hasBark && (
                <span className="text-[10px] bg-white/6 text-immortail-soft/50
                                 border border-white/8 px-2 py-0.5 rounded-full">
                  ✅ Analysed
                </span>
              )}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => confirmDelete ? onDelete(video.id) : setConfirmDelete(true)}
          onBlur={() => setTimeout(() => setConfirmDelete(false), 1500)}
          className="text-xs text-immortail-soft/40 hover:text-red-400 transition-colors shrink-0 mt-1"
        >
          {confirmDelete ? '✗ Delete' : '···'}
        </button>
      </div>

      {/* Inline video player */}
      <AnimatePresence>
        {playing && urlRef.current && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/8"
          >
            <div className="relative">
              <video
                ref={videoRef}
                src={urlRef.current}
                controls
                autoPlay
                className="w-full max-h-56 bg-black"
                onEnded={handleClose}
              />
              <button
                onClick={handleClose}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60
                           text-white text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
