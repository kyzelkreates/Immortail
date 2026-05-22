/**
 * Immortail™ — Voice Recall Panel
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner records custom phrases; playing them triggers dog reactions.
 * Enhanced: waveform visualisation, playback progress, recording level meter.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceCommands }       from '../core/storage.js';
import { startRecording, playBlob, generateWaveform, getAudioContext }
                               from '../audio/audioEngine.js';
import WaveformDisplay         from '../components/sounds/WaveformDisplay.jsx';

const PRESET_PHRASES = [
  'Come here', 'Good boy', 'Good girl', 'Walkies',
  'Treat', 'Sit', 'Stay', 'Bedtime',
];

const REACTIONS = {
  'come here': 'listening',
  'good boy':  'happy',
  'good girl': 'happy',
  'walkies':   'excited',
  'treat':     'excited',
  'sit':       'sitting',
  'stay':      'idle',
  'bedtime':   'sleeping',
};

// Reaction → emoji label
const REACTION_LABELS = {
  listening: '👂 Listens',
  happy:     '🥰 Happy',
  excited:   '🎾 Excited',
  sitting:   '🐾 Sits',
  idle:      '😌 Calm',
  sleeping:  '😴 Rests',
};

export default function VoiceRecallPanel({ profileId, onTrigger }) {
  const [commands, setCommands] = useState([]);
  const [recording, setRecording] = useState(false);
  const [phrase, setPhrase]       = useState('');
  const [stopFn, setStopFn]       = useState(null);
  const [elapsed, setElapsed]     = useState(0);
  const [error, setError]         = useState('');
  const [playing, setPlaying]     = useState(null);
  const [playProgress, setPlayProgress] = useState({});  // id → 0-1
  const [waveforms, setWaveforms]       = useState({});   // id → Float32Array
  const [recordLevel, setRecordLevel]   = useState(0);    // 0-1 live meter

  const timerRef     = useRef(null);
  const levelRef     = useRef(null);  // analyser RAF
  const analyserRef  = useRef(null);
  const streamRef    = useRef(null);
  const playStopRefs = useRef({});    // id → stop fn
  const progressRefs = useRef({});    // id → interval

  const load = useCallback(async () => {
    if (!profileId) return;
    const list = await VoiceCommands.listByProfile(profileId);
    setCommands(list);
    // Build waveforms for loaded commands
    list.forEach(async (cmd) => {
      if (cmd.blob && !waveforms[cmd.id]) {
        try {
          const wf = await generateWaveform(cmd.blob, 80);
          setWaveforms(prev => ({ ...prev, [cmd.id]: wf }));
        } catch {}
      }
    });
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Level meter during recording ──────────────────────────────────────────
  const startLevelMeter = useCallback((stream) => {
    try {
      const ctx      = getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setRecordLevel(Math.min(1, avg / 128));
        levelRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelRef.current) cancelAnimationFrame(levelRef.current);
    levelRef.current  = null;
    analyserRef.current = null;
    setRecordLevel(0);
  }, []);

  // ── Record ────────────────────────────────────────────────────────────────
  const handleRecord = async () => {
    if (!phrase.trim()) { setError('Choose or type a phrase first.'); return; }
    setError('');
    try {
      const { stop, stream } = await startRecordingWithStream();
      setRecording(true);
      setElapsed(0);
      setStopFn(() => stop);
      streamRef.current = stream;
      startLevelMeter(stream);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      setError('Microphone access denied.');
    }
  };

  const handleStop = async () => {
    clearInterval(timerRef.current);
    stopLevelMeter();
    setRecording(false);
    if (!stopFn) return;
    const blob = await stopFn();
    setStopFn(null);
    if (!blob || blob.size === 0) return;

    const reaction = REACTIONS[phrase.toLowerCase().trim()] || 'happy';
    await VoiceCommands.add(profileId, { phrase: phrase.trim(), blob, reaction });
    setPhrase('');
    await load();
  };

  // ── Play ──────────────────────────────────────────────────────────────────
  const handlePlay = useCallback(async (cmd) => {
    if (!cmd.blob) return;

    // Stop if already playing
    if (playing === cmd.id) {
      playStopRefs.current[cmd.id]?.();
      clearInterval(progressRefs.current[cmd.id]);
      setPlaying(null);
      setPlayProgress(prev => ({ ...prev, [cmd.id]: 0 }));
      return;
    }

    // Stop any other playing track first
    if (playing) {
      playStopRefs.current[playing]?.();
      clearInterval(progressRefs.current[playing]);
      setPlaying(null);
      setPlayProgress(prev => ({ ...prev, [playing]: 0 }));
    }

    setPlaying(cmd.id);
    onTrigger?.(cmd.reaction || 'happy', cmd.phrase);

    try {
      // Estimate duration from blob size (rough: ~16kbps opus)
      const estDuration = (cmd.blob.size / 2000) * 1000; // ms
      const startedAt   = Date.now();

      const stop = await playBlob(cmd.blob, {
        volume: 0.85,
        onEnded: () => {
          clearInterval(progressRefs.current[cmd.id]);
          setPlaying(null);
          setPlayProgress(prev => ({ ...prev, [cmd.id]: 0 }));
        },
      });
      playStopRefs.current[cmd.id] = stop;

      // Progress tracking
      progressRefs.current[cmd.id] = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const prog    = Math.min(1, elapsed / Math.max(estDuration, 500));
        setPlayProgress(prev => ({ ...prev, [cmd.id]: prog }));
        if (prog >= 1) clearInterval(progressRefs.current[cmd.id]);
      }, 50);

    } catch { setPlaying(null); }
  }, [playing, onTrigger]);

  const handleDelete = async (id) => {
    if (playing === id) {
      playStopRefs.current[id]?.();
      setPlaying(null);
    }
    await VoiceCommands.delete(id);
    setCommands(prev => prev.filter(c => c.id !== id));
    setWaveforms(prev => { const n = {...prev}; delete n[id]; return n; });
  };

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(timerRef.current);
    stopLevelMeter();
    Object.values(progressRefs.current).forEach(clearInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  return (
    <div className="space-y-4">
      {/* ── Record Panel ─────────────────────────────────────────────────── */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="font-display text-base text-immortail-cream">📣 Record a Command</h3>

        {/* Phrase presets */}
        <div className="flex flex-wrap gap-2">
          {PRESET_PHRASES.map(p => (
            <button
              key={p}
              onClick={() => { if (!recording) setPhrase(p); }}
              disabled={recording}
              className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                phrase === p
                  ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                  : 'border-white/10 text-immortail-soft hover:border-white/20'
              } disabled:opacity-40`}
            >
              {p}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          placeholder="Or type your own phrase…"
          className="input-field text-sm"
          maxLength={50}
          disabled={recording}
        />

        {/* Level meter bar */}
        {recording && (
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                width:      `${recordLevel * 100}%`,
                background: recordLevel > 0.7 ? '#ef4444' : '#C9A84C',
              }}
              transition={{ duration: 0.05 }}
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {!recording ? (
            <button
              key="start"
              onClick={handleRecord}
              disabled={!phrase.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                         bg-red-900/30 border border-red-700/40 text-red-300 text-sm
                         hover:bg-red-900/50 transition-all disabled:opacity-40 active:scale-95"
            >
              <span>🎙️</span> Record "{phrase || '…'}"
            </button>
          ) : (
            <motion.div
              key="recording"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-red-900/20 border border-red-700/30"
            >
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
                className="w-3 h-3 rounded-full bg-red-500 shrink-0"
              />
              <span className="text-red-300 text-sm flex-1 truncate">
                "{phrase}" — {fmtTime(elapsed)}
              </span>
              <button
                onClick={handleStop}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20
                           text-immortail-cream transition-colors"
              >
                ⏹ Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-xs"
          >
            {error}
          </motion.p>
        )}
      </div>

      {/* ── Saved Commands ─────────────────────────────────────────────────── */}
      {commands.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-immortail-soft uppercase tracking-widest px-1">
            {commands.length} Saved Command{commands.length !== 1 ? 's' : ''}
          </p>

          {commands.map(cmd => {
            const isPlaying  = playing === cmd.id;
            const progress   = playProgress[cmd.id] || 0;
            const wf         = waveforms[cmd.id];

            return (
              <motion.div
                key={cmd.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`glass-card p-3 space-y-2 transition-all ${
                  isPlaying ? 'border-immortail-gold/30 bg-immortail-gold/5' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Play/pause button */}
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => handlePlay(cmd)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      isPlaying
                        ? 'bg-immortail-gold text-immortail-deep shadow-lg shadow-immortail-gold/20'
                        : 'bg-white/10 hover:bg-white/20 text-immortail-cream'
                    }`}
                  >
                    <span className="text-sm">{isPlaying ? '⏸' : '▶'}</span>
                  </motion.button>

                  {/* Phrase + reaction */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-immortail-cream truncate font-medium">
                      "{cmd.phrase}"
                    </p>
                    <p className="text-xs text-immortail-soft/70">
                      {REACTION_LABELS[cmd.reaction] || cmd.reaction}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(cmd.id)}
                    className="text-immortail-soft/40 hover:text-red-400 transition-colors text-sm shrink-0 p-1"
                    aria-label="Delete"
                  >✕</button>
                </div>

                {/* Waveform — only if available */}
                {wf && (
                  <WaveformDisplay
                    waveform={wf}
                    playing={isPlaying}
                    progress={progress}
                    height={32}
                    color="#C9A84C"
                    bgColor="rgba(255,255,255,0.07)"
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {commands.length === 0 && !recording && (
        <div className="text-center py-6 text-immortail-soft/40">
          <p className="text-2xl mb-2">🎙️</p>
          <p className="text-xs">Record a phrase — your voice will bring them to life.</p>
        </div>
      )}
    </div>
  );
}

// ── Modified startRecording that also returns the stream ─────────────────────
async function startRecordingWithStream() {
  const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  const chunks   = [];

  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);

  return {
    stream,
    stop: () => new Promise(resolve => {
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve(blob);
      };
      recorder.stop();
    }),
  };
}

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
