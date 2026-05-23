/**
 * Immortail™ — AI Engine (main thread interface)
 * Communicates with the Web Worker via message passing.
 * Never blocks the UI thread.
 */
import { AICache, AIRegistry, Photos, Sounds, MemoryEntries } from '../core/storage.js';
import { AI_ANALYSIS } from '../core/constants.js';

let _worker  = null;
let _pending = new Map(); // id → { resolve, reject }
let _msgId   = 0;
let _status  = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let _statusListeners = new Set();

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

// AI module registry — serialisable definitions only (no live state).
const AI_MODULES = [
  { id: 'dogBehaviourAI', version: '1.0', configKey: 'dog_config'  },
  { id: 'memoryAI',       version: '1.0', configKey: 'ai_cache'    },
  { id: 'emotionAI',      version: '1.0', configKey: 'adaptation'  },
];
const REGISTRY_VERSION = '1.0';
const BOOT_TIMEOUT_MS  = 35000; // 35s hard cap — covers slow mobile CDN

// Boot-once guard — prevents double initialisation across renders
let _bootPromise = null;

/**
 * bootAI() — deterministic AI bootstrap pipeline.
 *
 * Steps:
 *  1. BOOTING_AI — set status immediately
 *  2. Read persisted registry from IDB (rehydration on reload)
 *  3. Init worker if not already running
 *  4. Wait for worker ready (with hard timeout)
 *  5. Persist registry snapshot to IDB
 *  6. Set status READY
 *
 * Always resolves — never hangs. Returns { ok, registry, error }.
 * Boot-once: if called again while already running, returns same promise.
 */
export function bootAI() {
  // Return in-flight promise if boot already running (prevents double-boot on StrictMode double-mount)
  if (_bootPromise) return _bootPromise;

  _bootPromise = _runBoot().finally(() => {
    // Clear so a manual retry after error can re-run
    if (_status === 'error') _bootPromise = null;
  });
  return _bootPromise;
}

async function _runBoot() {
  console.log('[AI Boot] Step 1: BOOTING_AI');
  setStatus('loading');

  // Step 2: Read persisted registry (non-fatal if missing)
  let persistedRegistry = null;
  try {
    persistedRegistry = await AIRegistry.get();
    if (persistedRegistry) {
      console.log('[AI Boot] Step 2: Registry rehydrated from IDB', persistedRegistry.version);
    } else {
      console.log('[AI Boot] Step 2: No persisted registry — fresh boot');
    }
  } catch (e) {
    console.warn('[AI Boot] Step 2: Registry read failed (non-fatal):', e.message);
  }

  // Step 3: Init worker
  console.log('[AI Boot] Step 3: Initialising worker');
  try {
    initAI(); // idempotent — does nothing if worker already running
  } catch (e) {
    console.error('[AI Boot] Step 3: Worker init failed:', e.message);
    setStatus('error');
    return { ok: false, error: e.message };
  }

  // Step 4: Wait for ready with hard timeout
  console.log('[AI Boot] Step 4: Waiting for worker ready');
  try {
    await Promise.race([
      waitForReady(BOOT_TIMEOUT_MS),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI boot timeout after 35s')), BOOT_TIMEOUT_MS)
      ),
    ]);
    console.log('[AI Boot] Step 4: Worker ready ✓');
  } catch (e) {
    console.error('[AI Boot] Step 4: Worker ready failed:', e.message);
    // Degrade gracefully — config build still works without model
    setStatus('error');
    return { ok: false, error: e.message };
  }

  // Step 5: Persist registry snapshot to IDB
  console.log('[AI Boot] Step 5: Persisting registry to IDB');
  const snapshot = {
    version:    REGISTRY_VERSION,
    modules:    AI_MODULES.map(m => m.id),
    configKeys: AI_MODULES.map(m => m.configKey),
    bootsAt:    Date.now(),
  };
  try {
    await AIRegistry.save(snapshot);
    console.log('[AI Boot] Step 5: Registry saved ✓');
  } catch (e) {
    // Non-fatal — boot still succeeds; registry just won't be rehydrated next load
    console.warn('[AI Boot] Step 5: Registry save failed (non-fatal):', e.message);
  }

  // Step 6: READY
  console.log('[AI Boot] Step 6: READY ✓');
  setStatus('ready');
  return { ok: true, registry: snapshot };
}

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
    // LOAD_MODEL result comes via MODEL_LOADED/MODEL_READY broadcast (no id match needed)
    // We listen for the status change instead of using the pending promise
    send('LOAD_MODEL', {}).catch(() => {
      // If send itself throws (worker not available), go to error
      // MODEL_LOADED/MODEL_READY broadcasts handle the success path
      if (_status === 'loading') setStatus('error');
    });
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
  if (type === 'MODEL_READY')   { setStatus('ready');   return; } // degraded mode ack

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
    // Per-call timeout — 90s for image batches, enough for slow mobile
    const timeoutMs = payload?.images?.length > 5 ? 90000 : 30000;
    setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        reject(new Error('AI worker timeout — device may be slow. Please try again.'));
      }
    }, timeoutMs);
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

  // Safe progress emitter — never lets a callback error crash the pipeline
  const emit = (step, pct) => {
    try { onProgress?.({ step, pct }); } catch {}
  };

  emit('photos', 5);

  // 1. Load data
  const [photos, sounds, memories] = await Promise.all([
    Photos.listByProfile(profileId),
    Sounds.listByProfile(profileId),
    MemoryEntries.listByProfile(profileId),
  ]);

  // 2. Analyse images (with 8s graceful timeout — BUILD_DOG_CONFIG works without images)
  emit('analysing images', 20);
  let imageAnalysis = await AICache.get(profileId, AI_ANALYSIS.PHOTO);
  if (!imageAnalysis && photos.length > 0) {
    try {
      // Wait up to 8s for AI model — don't block entire pipeline on CDN load
      if (_status !== 'ready') {
        await Promise.race([
          waitForReady(8000),
          new Promise(resolve => setTimeout(resolve, 8000)), // graceful timeout — continues without AI
        ]);
      }
      if (_status === 'ready') {
        imageAnalysis = await analysePhotoBatch(photos);
        if (imageAnalysis) await AICache.save(profileId, AI_ANALYSIS.PHOTO, imageAnalysis);
      } else {
        console.log('[AI] Image analysis skipped — AI model not ready (proceeding with profile data)');
      }
    } catch (e) {
      console.warn('[AI] Image analysis failed (non-fatal — proceeding without it):', e.message);
    }
  }

  // 3. Aggregate sound analysis
  emit('analysing sounds', 50);
  let soundAnalysis = await AICache.get(profileId, AI_ANALYSIS.SOUND);
  if (!soundAnalysis && sounds.length > 0) {
    const analysedSounds = sounds.filter(s => s.analysisResult);
    if (analysedSounds.length) {
      soundAnalysis = aggregateSoundResults(analysedSounds.map(s => s.analysisResult));
      await AICache.save(profileId, AI_ANALYSIS.SOUND, soundAnalysis);
    }
  }

  // 4. Build config (try worker first, fall back to inline if unavailable)
  emit('building personality', 75);
  let config = null;
  try {
    config = await send('BUILD_DOG_CONFIG', {
      profile,
      imageAnalysis,
      soundAnalysis,
      memories,
    });
  } catch (e) {
    console.warn('[AI] Worker unavailable for config build — using inline fallback:', e.message);
    // Inline fallback — same logic as the worker's buildDogConfig
    config = buildDogConfigInline({ profile, imageAnalysis, soundAnalysis, memories });
  }

  emit('done', 100);
  return config;
}

// ─── Inline config builder (main-thread fallback) ────────────────────────────
// Called only when the worker is unavailable.
// Produces a valid config from profile data alone (no image analysis needed).
function buildDogConfigInline({ profile, imageAnalysis, soundAnalysis, memories }) {
  const breed = (profile?.breed || '').toLowerCase();
  const traits = profile?.traits || [];

  // Colour
  const colourHex = imageAnalysis?.dominantHex || '#C9A84C';

  // Ear/body from breed (simplified)
  const floppy  = ['labrador','golden','cocker','basset','beagle','cavalier','springer'].some(b => breed.includes(b));
  const compact  = ['pug','bulldog','french','chihuahua','shih tzu','pomeranian','corgi'].some(b => breed.includes(b));
  const large    = ['german','rottweiler','husky','malamute','doberman','great','saint'].some(b => breed.includes(b));

  const isPlayful    = traits.includes('playful')    || traits.includes('energetic');
  const isCalm       = traits.includes('calm')       || traits.includes('gentle');
  const isCuddly     = traits.includes('cuddly');
  const isProtective = traits.includes('protective');

  return {
    version:     '1.0',
    generatedAt: Date.now(),
    profileId:   profile?.id,
    appearance: {
      bodyColour:  colourHex,
      earColour:   colourHex,
      tailColour:  colourHex,
      bellyColour: '#F5E6C8',
      earShape:    floppy ? 'floppy' : 'pointy',
      bodyShape:   compact ? 'compact' : large ? 'large' : 'medium',
      tailShape:   'curved',
      size:        compact ? 0.75 : large ? 1.25 : 1.0,
    },
    personality: {
      tailWagSpeed:     isPlayful ? 'fast' : isCalm ? 'slow' : 'medium',
      excitementFreq:   isPlayful ? 'high' : isCalm ? 'low'  : 'medium',
      interactionDelay: isCalm ? 800 : isPlayful ? 200 : 400,
      cuddleResponse:   isCuddly ? 'strong' : 'normal',
      alertResponse:    isProtective ? 'strong' : 'normal',
    },
    sound: soundAnalysis ? {
      barkPitch:     soundAnalysis.estimatedHz   || 440,
      barkIntensity: soundAnalysis.intensity      || 0.5,
      emotionalTone: soundAnalysis.tone           || 'calm',
      barkType:      soundAnalysis.barkType       || 'single_bark',
    } : null,
    memoryTags:  [],
    breed:       profile?.breed,
    favouriteToy:      profile?.favouriteToy,
    favouriteCommand:  profile?.favouriteCommand,
    _generatedInline:  true, // flag for diagnostics
  };
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
export function waitForReady(timeout = 30000) {
  if (_status === 'ready') return Promise.resolve();
  if (_status === 'error') return Promise.reject(new Error('AI model unavailable'));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('AI model taking too long — please try again.')), timeout);
    const unsub = onStatusChange(s => {
      if (s === 'ready')  { clearTimeout(t); unsub(); resolve(); }
      if (s === 'error')  { clearTimeout(t); unsub(); reject(new Error('AI model failed to load')); }
    });
  });
}
