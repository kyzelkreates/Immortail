/**
 * Immortail™ — AI Web Worker
 * ALL AI inference runs here — never blocks the UI thread.
 * Uses TensorFlow.js with MobileNet for image feature extraction.
 *
 * Graceful degradation: if CDN scripts fail to load (network or CORS),
 * the worker continues in degraded mode — BUILD_DOG_CONFIG still works,
 * image analysis returns null (app handles this gracefully).
 */

// Load TF.js from CDN — wrapped so a CDN failure doesn't crash the whole worker
let _tfAvailable = false;
try {
  importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');
  importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js');
  _tfAvailable = true;
} catch (e) {
  console.warn('[AIWorker] TF.js CDN load failed — running in degraded mode:', e.message);
}

let mobilenetModel = null;
let modelLoading   = false;
let modelReady     = false;

// ─── Message handler ──────────────────────────────────────────────────────────
self.onmessage = async (e) => {
  const { type, id, payload } = e.data;

  try {
    switch (type) {
      case 'LOAD_MODEL':
        if (!_tfAvailable) {
          // Degraded mode — AI image analysis unavailable but config build works
          self.postMessage({ type: 'MODEL_LOADED', id });
          break;
        }
        await loadModel();
        self.postMessage({ type: 'MODEL_READY', id });
        break;

      case 'ANALYSE_IMAGE':
        if (!_tfAvailable || !modelReady) {
          // Degraded mode — return null so pipeline skips image analysis
          self.postMessage({ type: 'IMAGE_RESULT', id, result: null });
          break;
        }
        const imgResult = await analyseImage(payload.imageData, payload.width, payload.height);
        self.postMessage({ type: 'IMAGE_RESULT', id, result: imgResult });
        break;

      case 'ANALYSE_IMAGES_BATCH':
        if (!_tfAvailable) {
          // Degraded mode — return null so pipeline uses profile data only
          self.postMessage({ type: 'BATCH_RESULT', id, result: null });
          break;
        }
        if (!modelReady) await loadModel();
        const batchResult = await analyseImagesBatch(payload.images);
        self.postMessage({ type: 'BATCH_RESULT', id, result: batchResult });
        break;

      case 'BUILD_DOG_CONFIG':
        const config = buildDogConfig(payload);
        self.postMessage({ type: 'CONFIG_RESULT', id, result: config });
        break;

      default:
        self.postMessage({ type: 'ERROR', id, error: `Unknown message type: ${type}` });
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', id, error: err.message });
  }
};

// ─── Model loading ────────────────────────────────────────────────────────────
async function loadModel() {
  if (modelReady) return;
  if (modelLoading) {
    await new Promise(resolve => {
      const check = setInterval(() => { if (modelReady) { clearInterval(check); resolve(); } }, 100);
    });
    return;
  }
  modelLoading = true;
  self.postMessage({ type: 'MODEL_LOADING' });
  try {
    mobilenetModel = await mobilenet.load({ version: 2, alpha: 0.5 });
    modelReady     = true;
    self.postMessage({ type: 'MODEL_LOADED' });
  } catch (e) {
    modelLoading = false;
    throw new Error('Failed to load AI model: ' + e.message);
  }
}

// ─── Image analysis ───────────────────────────────────────────────────────────
async function analyseImage(imageData, width, height) {
  // Create tensor from ImageData pixels
  const tensor = tf.tidy(() => {
    const t = tf.browser.fromPixels({ data: new Uint8ClampedArray(imageData), width, height });
    return tf.image.resizeBilinear(t, [224, 224]);
  });

  // Get embeddings
  const embeddings = await mobilenetModel.infer(tensor, true);
  const data       = await embeddings.data();

  // Classify top predictions
  let predictions = [];
  try {
    predictions = await mobilenetModel.classify(tensor);
  } catch {}

  tf.dispose([tensor, embeddings]);

  // Extract colour stats from raw pixels
  const colourStats = extractColourStats(new Uint8ClampedArray(imageData), width, height);

  return {
    predictions: predictions.slice(0, 5),
    colourStats,
    embeddingsSample: Array.from(data.slice(0, 16)), // store small sample
    analysedAt: Date.now(),
  };
}

async function analyseImagesBatch(images) {
  const results = [];
  for (const { imageData, width, height, id } of images) {
    try {
      const result = await analyseImage(imageData, width, height);
      results.push({ id, result });
    } catch (e) {
      results.push({ id, error: e.message });
    }
  }
  return aggregateImageResults(results);
}

// ─── Colour extraction ────────────────────────────────────────────────────────
function extractColourStats(pixels, width, height) {
  // Sample every 8th pixel for performance
  const step = 8;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  let rMax = 0, gMax = 0, bMax = 0;

  for (let i = 0; i < pixels.length; i += 4 * step) {
    const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
    rSum += r; gSum += g; bSum += b;
    if (r > rMax) rMax = r;
    if (g > gMax) gMax = g;
    if (b > bMax) bMax = b;
    count++;
  }

  const avgR = Math.round(rSum / count);
  const avgG = Math.round(gSum / count);
  const avgB = Math.round(bSum / count);

  // Determine dominant colour category
  const dominantHex = `#${avgR.toString(16).padStart(2,'0')}${avgG.toString(16).padStart(2,'0')}${avgB.toString(16).padStart(2,'0')}`;
  const dominantCategory = classifyColour(avgR, avgG, avgB);

  return { avgR, avgG, avgB, dominantHex, dominantCategory };
}

function classifyColour(r, g, b) {
  const brightness = (r + g + b) / 3;
  if (brightness < 60)                          return 'black';
  if (brightness > 200 && r > 190 && g > 190)  return 'white';
  if (r > 180 && g > 150 && b < 100)           return 'golden';
  if (r > 160 && g > 120 && b < 80)            return 'brown';
  if (r > 140 && g > 130 && b > 120)           return 'grey';
  if (r > 200 && g > 170 && b > 130)           return 'cream';
  return 'mixed';
}

// ─── Aggregate results from multiple images ───────────────────────────────────
function aggregateImageResults(results) {
  const valid = results.filter(r => r.result && !r.error);
  if (valid.length === 0) return { error: 'No valid images' };

  // Average colour stats
  const avgColour = {
    r: Math.round(valid.reduce((s, r) => s + r.result.colourStats.avgR, 0) / valid.length),
    g: Math.round(valid.reduce((s, r) => s + r.result.colourStats.avgG, 0) / valid.length),
    b: Math.round(valid.reduce((s, r) => s + r.result.colourStats.avgB, 0) / valid.length),
  };
  const dominantColourCategory = classifyColour(avgColour.r, avgColour.g, avgColour.b);
  const dominantHex = `#${avgColour.r.toString(16).padStart(2,'0')}${avgColour.g.toString(16).padStart(2,'0')}${avgColour.b.toString(16).padStart(2,'0')}`;

  // Collect all predictions
  const allPredictions = valid.flatMap(r => r.result.predictions || []);
  const predMap = {};
  allPredictions.forEach(p => {
    if (!predMap[p.className]) predMap[p.className] = 0;
    predMap[p.className] += p.probability;
  });
  const topPredictions = Object.entries(predMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([className, probability]) => ({ className, probability: probability / valid.length }));

  return {
    imageCount: valid.length,
    avgColour,
    dominantHex,
    dominantColourCategory,
    topPredictions,
    analysedAt: Date.now(),
  };
}

// ─── Build dog config from all analysis data ──────────────────────────────────
function buildDogConfig({ profile, imageAnalysis, soundAnalysis, memories }) {
  const traits = profile?.traits || [];

  // ── Appearance config ────────────────────────────────────────────────────
  const colourHex = imageAnalysis?.dominantHex || '#C8860A';
  const colourCat = imageAnalysis?.dominantColourCategory || 'golden';

  // Guess ear/body shape from breed
  const breed = (profile?.breed || '').toLowerCase();
  const earShape  = guessEarShape(breed);
  const bodyShape = guessBodyShape(breed);
  const tailShape = guessTailShape(breed);
  const sizeScale = guessSize(breed);

  const appearance = {
    bodyColour: colourHex,
    earColour:  darkenHex(colourHex, 30),
    tailColour: colourHex,
    bellyColour:lightenHex(colourHex, 40),
    earShape,
    bodyShape,
    tailShape,
    size: sizeScale,
  };

  // ── Personality config ───────────────────────────────────────────────────
  const isPlayful   = traits.includes('playful')   || traits.includes('energetic');
  const isCalm      = traits.includes('calm')      || traits.includes('gentle');
  const isCuddly    = traits.includes('cuddly');
  const isProtective= traits.includes('protective');
  const isCurious   = traits.includes('curious');

  const personality = {
    tailWagSpeed:     isPlayful ? 'fast' : isCalm ? 'slow' : 'medium',
    excitementFreq:   isPlayful ? 'high' : isCalm ? 'low' : 'medium',
    interactionDelay: isCalm ? 800 : isPlayful ? 200 : 400,
    cuddleResponse:   isCuddly ? 'strong' : 'normal',
    alertResponse:    isProtective ? 'strong' : isCurious ? 'curious' : 'normal',
  };

  // ── Sound config ─────────────────────────────────────────────────────────
  const sound = soundAnalysis ? {
    barkPitch:     soundAnalysis.estimatedHz || 440,
    barkIntensity: soundAnalysis.intensity || 0.5,
    emotionalTone: soundAnalysis.tone || 'calm',
    barkType:      soundAnalysis.barkType || 'single_bark',
  } : null;

  // ── Memory tags ──────────────────────────────────────────────────────────
  const memoryTags = extractMemoryTags(memories || []);

  return {
    version: '1.0',
    generatedAt: Date.now(),
    profileId: profile?.id,
    appearance,
    personality,
    sound,
    memoryTags,
    breed: profile?.breed,
    favouriteToy: profile?.favouriteToy,
    favouriteCommand: profile?.favouriteCommand,
  };
}

// ─── Memory tag extraction ────────────────────────────────────────────────────
function extractMemoryTags(memories) {
  const allText = memories.map(m => `${m.title} ${m.text}`).join(' ').toLowerCase();
  const tags    = new Set();

  const keywords = {
    beach:    ['beach', 'sea', 'ocean', 'waves', 'sand'],
    park:     ['park', 'garden', 'grass', 'run', 'fetch'],
    snuggle:  ['cuddle', 'snuggle', 'sofa', 'bed', 'lap', 'sleep'],
    food:     ['food', 'treat', 'biscuit', 'eat', 'hungry'],
    walk:     ['walk', 'lead', 'leash', 'path', 'trail'],
    play:     ['play', 'ball', 'toy', 'fetch', 'chase'],
  };

  Object.entries(keywords).forEach(([tag, words]) => {
    if (words.some(w => allText.includes(w))) tags.add(tag);
  });

  return Array.from(tags);
}

// ─── Breed-based heuristics ───────────────────────────────────────────────────
function guessEarShape(breed) {
  if (/german shepherd|husky|akita|shiba|chihuahua|corgi/.test(breed)) return 'pointed';
  if (/labrador|golden|cocker|beagle|basset|dachshund/.test(breed))    return 'floppy';
  if (/poodle|bichon|shih|maltese|yorkshire/.test(breed))              return 'folded';
  return 'floppy';
}
function guessBodyShape(breed) {
  if (/great dane|mastiff|saint|newfoundland/.test(breed)) return 'large';
  if (/chihuahua|yorkshire|maltese|toy/.test(breed))       return 'small';
  return 'medium';
}
function guessTailShape(breed) {
  if (/husky|akita|shiba|samoyed/.test(breed)) return 'curly';
  if (/greyhound|whippet/.test(breed))         return 'straight';
  return 'wavy';
}
function guessSize(breed) {
  if (/great dane|mastiff|saint/.test(breed))  return 1.3;
  if (/chihuahua|yorkshire|maltese/.test(breed)) return 0.7;
  return 1.0;
}

// ─── Colour utilities ─────────────────────────────────────────────────────────
function darkenHex(hex, amt) {
  try {
    let r = Math.max(0, parseInt(hex.slice(1,3),16) - amt);
    let g = Math.max(0, parseInt(hex.slice(3,5),16) - amt);
    let b = Math.max(0, parseInt(hex.slice(5,7),16) - amt);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}
function lightenHex(hex, amt) {
  try {
    let r = Math.min(255, parseInt(hex.slice(1,3),16) + amt);
    let g = Math.min(255, parseInt(hex.slice(3,5),16) + amt);
    let b = Math.min(255, parseInt(hex.slice(5,7),16) + amt);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}
