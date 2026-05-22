/**
 * Immortail™ — AI Engine (main thread interface)
 * Communicates with the Web Worker via message passing.
 * Never blocks the UI thread.
 */
import { AICache, Photos, Sounds, MemoryEntries } from '../core/storage.js';
import { AI_ANALYSIS } from '../core/constants.js';

let _worker  = null;
let _pending = new Map(); // id → { resolve, reject }
let _msgId   = 0;
let _status  = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let _statusListeners = new Set();

// ─── Worker lifecycle ─────────────────────────────────────────────────────────
export function getWorkerStatus() { return _status; }

export function onStatusChange(cb) {
  _statusListeners.add(cb);
  return () => _statusListeners.delete(cb);
}

function setStatus(s) {
  _status = s;
  _statusListeners.forEach(cb => cb(s));
}

export function initAI() {
  if (_worker) return;
  try {
    _worker = new Worker(new URL('../workers/aiWorker.js', import.meta.url), { type: 'classic' });
    _worker.onmessage = handleWorkerMessage;
    _worker.onerror   = (e) => {
      console.error('[AI] Worker error:', e);
      setStatus('error');
      _pending.forEach(({ reject }) => reject(new Error('Worker error')));
      _pending.clear();
    };
    setStatus('loading');
    send('LOAD_MODEL', {}).then(() => setStatus('ready')).catch(() => setStatus('error'));
  } catch (e) {
    console.warn('[AI] Worker init failed (will run in degraded mode):', e.message);
    setStatus('error');
  }
}

export function destroyAI() {
  if (_worker) { _worker.terminate(); _worker = null; }
  _pending.clear();
  setStatus('idle');
}

// ─── Message handling ─────────────────────────────────────────────────────────
function handleWorkerMessage({ data }) {
  const { type, id, result, error } = data;
  if (type === 'MODEL_LOADING') { setStatus('loading'); return; }
  if (type === 'MODEL_LOADED')  { setStatus('ready');   return; }

  const pending = _pending.get(id);
  if (!pending) return;
  _pending.delete(id);

  if (type === 'ERROR') { pending.reject(new Error(error)); }
  else                  { pending.resolve(result); }
}

function send(type, payload) {
  if (!_worker) return Promise.reject(new Error('AI worker not available'));
  const id = ++_msgId;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    _worker.postMessage({ type, id, payload });
    // Timeout after 30s
    setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        reject(new Error('AI worker timeout'));
      }
    }, 30000);
  });
}

// ─── Image analysis ───────────────────────────────────────────────────────────
export async function analysePhoto(photo) {
  if (!photo.blob || _status === 'error') return null;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(photo.blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas  = document.createElement('canvas');
      canvas.width  = 224; canvas.height = 224;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 224, 224);
      const imageData = ctx.getImageData(0, 0, 224, 224);
      send('ANALYSE_IMAGE', {
        imageData: Array.from(imageData.data),
        width: 224, height: 224
      }).then(resolve).catch(reject);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function analysePhotoBatch(photos) {
  if (!photos.length || _status === 'error') return null;

  // Convert photos to ImageData arrays (main thread, then send to worker)
  const imagePayloads = await Promise.all(
    photos
      .filter(p => p.blob && !p.metadata?.isBlurry)
      .slice(0, 20) // max 20 images
      .map(p => new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(p.blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 224;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 224, 224);
          const data = ctx.getImageData(0, 0, 224, 224);
          resolve({ id: p.id, imageData: Array.from(data.data), width: 224, height: 224 });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      }))
  );

  const valid = imagePayloads.filter(Boolean);
  if (!valid.length) return null;

  return send('ANALYSE_IMAGES_BATCH', { images: valid });
}

// ─── Full reconstruction pipeline ─────────────────────────────────────────────
export async function reconstructDog(profileId, profile, onProgress) {
  if (!profileId) throw new Error('No profile ID');

  onProgress?.({ step: 'photos', pct: 5 });

  // 1. Load data
  const [photos, sounds, memories] = await Promise.all([
    Photos.listByProfile(profileId),
    Sounds.listByProfile(profileId),
    MemoryEntries.listByProfile(profileId),
  ]);

  // 2. Analyse images
  onProgress?.({ step: 'analysing images', pct: 20 });
  let imageAnalysis = await AICache.get(profileId, AI_ANALYSIS.PHOTO);
  if (!imageAnalysis && photos.length > 0) {
    try {
      if (_status !== 'ready') await waitForReady();
      imageAnalysis = await analysePhotoBatch(photos);
      if (imageAnalysis) await AICache.save(profileId, AI_ANALYSIS.PHOTO, imageAnalysis);
    } catch (e) {
      console.warn('[AI] Image analysis failed:', e.message);
    }
  }

  // 3. Aggregate sound analysis
  onProgress?.({ step: 'analysing sounds', pct: 50 });
  let soundAnalysis = await AICache.get(profileId, AI_ANALYSIS.SOUND);
  if (!soundAnalysis && sounds.length > 0) {
    const analysedSounds = sounds.filter(s => s.analysisResult);
    if (analysedSounds.length) {
      soundAnalysis = aggregateSoundResults(analysedSounds.map(s => s.analysisResult));
      await AICache.save(profileId, AI_ANALYSIS.SOUND, soundAnalysis);
    }
  }

  // 4. Build config
  onProgress?.({ step: 'building personality', pct: 75 });
  const config = await send('BUILD_DOG_CONFIG', {
    profile,
    imageAnalysis,
    soundAnalysis,
    memories,
  });

  onProgress?.({ step: 'done', pct: 100 });
  return config;
}

// ─── Sound aggregate ──────────────────────────────────────────────────────────
function aggregateSoundResults(results) {
  if (!results.length) return null;
  const avgIntensity = results.reduce((s, r) => s + (r.intensity || 0), 0) / results.length;
  const avgHz        = results.reduce((s, r) => s + (r.estimatedHz || 440), 0) / results.length;
  const toneFreq     = {};
  results.forEach(r => { toneFreq[r.tone] = (toneFreq[r.tone] || 0) + 1; });
  const dominantTone = Object.entries(toneFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'calm';
  const barkTypeFreq = {};
  results.forEach(r => { barkTypeFreq[r.barkType] = (barkTypeFreq[r.barkType] || 0) + 1; });
  const dominantBarkType = Object.entries(barkTypeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'single_bark';

  return {
    intensity:    parseFloat(avgIntensity.toFixed(3)),
    estimatedHz:  Math.round(avgHz),
    tone:         dominantTone,
    barkType:     dominantBarkType,
    sampleCount:  results.length,
  };
}

// ─── Wait for model ready ─────────────────────────────────────────────────────
function waitForReady(timeout = 20000) {
  if (_status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('AI model timeout')), timeout);
    const unsub = onStatusChange(s => {
      if (s === 'ready')  { clearTimeout(t); unsub(); resolve(); }
      if (s === 'error')  { clearTimeout(t); unsub(); reject(new Error('AI model failed')); }
    });
  });
}
