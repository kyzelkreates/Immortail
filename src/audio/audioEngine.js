/**
 * Immortail™ — Web Audio Engine
 * All sound processing runs locally. No external uploads.
 * Single shared AudioContext — no duplicates.
 */

let _ctx = null;

export function getAudioContext() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * Decode a Blob into an AudioBuffer.
 */
export async function decodeAudioBlob(blob) {
  const ctx        = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Play an AudioBuffer once. Returns a stop function.
 */
export function playBuffer(buffer, { volume = 1, onEnded } = {}) {
  const ctx    = getAudioContext();
  const source = ctx.createBufferSource();
  const gain   = ctx.createGain();

  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);
  if (onEnded) source.onended = onEnded;

  return () => {
    try { source.stop(); } catch {}
  };
}

/**
 * Analyse audio blob to extract:
 * - duration
 * - dominant pitch (Hz)
 * - average loudness (dB RMS)
 * - peak amplitude
 * - estimated bark intensity (0–1)
 * - estimated emotional tone ('calm'|'excited'|'anxious')
 */
export async function analyseAudio(blob) {
  const buffer = await decodeAudioBlob(blob);
  const ctx    = getAudioContext();

  const duration = buffer.duration;
  const data     = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  // RMS loudness
  let sumSq = 0;
  let peak  = 0;
  for (let i = 0; i < data.length; i++) {
    sumSq += data[i] * data[i];
    if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
  }
  const rms       = Math.sqrt(sumSq / data.length);
  const rmsDb     = 20 * Math.log10(rms + 1e-9);
  const intensity = Math.min(1, rms * 4); // 0–1 normalised

  // Zero crossing rate (proxy for pitch)
  let zcr = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] >= 0) !== (data[i-1] >= 0)) zcr++;
  }
  const zcrRate = zcr / (data.length / sampleRate);
  const estimatedHz = zcrRate / 2;

  // Classify tone
  let tone = 'calm';
  if (rms > 0.15 && estimatedHz > 400)      tone = 'excited';
  else if (rms > 0.05 && estimatedHz > 600) tone = 'anxious';
  else if (rms < 0.04)                       tone = 'calm';

  // Bark classification
  let barkType = 'unknown';
  if (duration < 0.4)        barkType = 'short_bark';
  else if (duration < 1.5)   barkType = 'single_bark';
  else if (duration < 4)     barkType = 'multi_bark';
  else                       barkType = 'sustained';

  return {
    duration,
    rms,
    rmsDb: parseFloat(rmsDb.toFixed(1)),
    peak: parseFloat(peak.toFixed(3)),
    estimatedHz: Math.round(estimatedHz),
    intensity: parseFloat(intensity.toFixed(3)),
    tone,
    barkType,
    sampleRate,
  };
}

/**
 * Generate waveform data (downsampled amplitudes) for a Blob.
 * Returns Float32Array of `samples` values in range [0,1].
 */
export async function generateWaveform(blob, samples = 120) {
  const buffer  = await decodeAudioBlob(blob);
  const data    = buffer.getChannelData(0);
  const step    = Math.floor(data.length / samples);
  const waveform = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    let max = 0;
    for (let j = 0; j < step; j++) {
      const val = Math.abs(data[i * step + j] || 0);
      if (val > max) max = val;
    }
    waveform[i] = max;
  }

  // Normalise to [0,1]
  const maxVal = Math.max(...waveform, 0.001);
  for (let i = 0; i < samples; i++) waveform[i] /= maxVal;

  return waveform;
}

/**
 * Record audio from microphone. Returns { blob, stop }.
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
  const chunks = [];

  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.start(100); // collect every 100ms

  return {
    stop: () => new Promise(resolve => {
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        resolve(blob);
      };
      recorder.stop();
    })
  };
}

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/**
 * Play a blob directly (convenience wrapper).
 */
export async function playBlob(blob, options = {}) {
  const buffer = await decodeAudioBlob(blob);
  return playBuffer(buffer, options);
}


/**
 * Play a blob in a loop until stop() is called.
 * Returns { stop } function.
 * Used for ambient sounds (e.g. rain, fireplace crackling).
 */
export async function playBlobLooping(blob, { volume = 0.4, fadeIn = true } = {}) {
  const buffer = await decodeAudioBlob(blob);
  const ctx    = getAudioContext();
  const source = ctx.createBufferSource();
  const gain   = ctx.createGain();

  source.buffer = buffer;
  source.loop   = true;

  gain.gain.setValueAtTime(0, ctx.currentTime);
  if (fadeIn) {
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.5);
  } else {
    gain.gain.setValueAtTime(volume, ctx.currentTime);
  }

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);

  return {
    stop: (fadeOut = true) => {
      if (fadeOut) {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
        setTimeout(() => { try { source.stop(); } catch {} }, 1200);
      } else {
        try { source.stop(); } catch {}
      }
    },
    setVolume: (v) => {
      gain.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.3);
    },
  };
}

/**
 * Cleanup the AudioContext (call on app teardown).
 */
export function closeAudioContext() {
  if (_ctx) { _ctx.close(); _ctx = null; }
}
