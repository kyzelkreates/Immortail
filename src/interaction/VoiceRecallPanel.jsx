/**
 * Immortail™ — Voice Recall Panel
 * Owner records custom phrases; playing them triggers dog reactions.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceCommands } from '../core/storage.js';
import { startRecording, playBlob } from '../audio/audioEngine.js';

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

export default function VoiceRecallPanel({ profileId, onTrigger }) {
  const [commands, setCommands] = useState([]);
  const [recording, setRecording] = useState(false);
  const [phrase, setPhrase]       = useState('');
  const [stopFn, setStopFn]       = useState(null);
  const [elapsed, setElapsed]     = useState(0);
  const [error, setError]         = useState('');
  const [playing, setPlaying]     = useState(null);
  const timerRef = useState(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    const list = await VoiceCommands.listByProfile(profileId);
    setCommands(list);
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const handleRecord = async () => {
    if (!phrase.trim()) { setError('Enter a phrase first.'); return; }
    setError('');
    try {
      const { stop } = await startRecording();
      setRecording(true);
      setElapsed(0);
      setStopFn(() => stop);
      const t = setInterval(() => setElapsed(e => e + 1), 1000);
      timerRef[0] = t;
    } catch {
      setError('Microphone access denied.');
    }
  };

  const handleStop = async () => {
    clearInterval(timerRef[0]);
    setRecording(false);
    if (!stopFn) return;
    const blob = await stopFn();
    setStopFn(null);
    if (!blob || blob.size === 0) return;

    const reaction = REACTIONS[phrase.toLowerCase().trim()] || 'happy';
    const record = await VoiceCommands.add(profileId, {
      phrase: phrase.trim(),
      blob,
      reaction,
    });
    setPhrase('');
    await load();
  };

  const handlePlay = async (cmd) => {
    if (playing === cmd.id) return;
    if (!cmd.blob) return;
    setPlaying(cmd.id);
    onTrigger?.(cmd.reaction || 'happy', cmd.phrase);
    try {
      const stop = await playBlob(cmd.blob, {
        onEnded: () => setPlaying(null)
      });
    } catch { setPlaying(null); }
  };

  const handleDelete = async (id) => {
    await VoiceCommands.delete(id);
    setCommands(prev => prev.filter(c => c.id !== id));
  };

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 space-y-3">
        <h3 className="font-display text-base text-immortail-cream">📣 Record a Command</h3>

        {/* Phrase selector */}
        <div className="flex flex-wrap gap-2">
          {PRESET_PHRASES.map(p => (
            <button
              key={p}
              onClick={() => setPhrase(p)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                phrase === p
                  ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                  : 'border-white/10 text-immortail-soft hover:border-white/20'
              }`}
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

        <AnimatePresence mode="wait">
          {!recording ? (
            <button
              key="start"
              onClick={handleRecord}
              disabled={!phrase.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                         bg-red-900/30 border border-red-700/40 text-red-300 text-sm
                         hover:bg-red-900/50 transition-all disabled:opacity-40"
            >
              <span>🎙️</span> Record "{phrase || '…'}"
            </button>
          ) : (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 py-3 px-4 rounded-xl bg-red-900/20 border border-red-700/30"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="w-3 h-3 rounded-full bg-red-500"
              />
              <span className="text-red-300 text-sm flex-1">Recording "{phrase}"… {fmtTime(elapsed)}</span>
              <button onClick={handleStop} className="text-xs text-immortail-soft hover:text-immortail-cream">⏹ Done</button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>

      {/* Saved commands */}
      {commands.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-immortail-soft uppercase tracking-widest px-1">Saved Commands</p>
          {commands.map(cmd => (
            <motion.div
              key={cmd.id}
              layout
              className="glass-card p-3 flex items-center gap-3"
            >
              <button
                onClick={() => handlePlay(cmd)}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all
                  ${playing === cmd.id
                    ? 'bg-immortail-gold text-immortail-deep'
                    : 'bg-white/10 hover:bg-white/20 text-immortail-cream'
                  }`}
              >
                {playing === cmd.id ? '⏸' : '▶'}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-immortail-cream truncate">"{cmd.phrase}"</p>
                <p className="text-xs text-immortail-soft">Triggers: {cmd.reaction}</p>
              </div>
              <button
                onClick={() => handleDelete(cmd.id)}
                className="text-immortail-soft/50 hover:text-red-400 transition-colors text-sm"
              >✕</button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
