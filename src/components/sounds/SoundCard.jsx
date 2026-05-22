/**
 * Immortail™ — Individual sound card with waveform + playback controls
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { playBlob, generateWaveform } from '../../audio/audioEngine.js';
import { SOUND_TYPES } from '../../core/constants.js';
import WaveformDisplay from './WaveformDisplay.jsx';

export default function SoundCard({ sound, onDelete, onTagChange }) {
  const [waveform, setWaveform] = useState(null);
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(sound.metadata?.duration || 0);
  const stopRef    = useRef(null);
  const timerRef   = useRef(null);
  const startedAt  = useRef(0);

  // Generate waveform once
  useEffect(() => {
    if (!sound.blob) return;
    generateWaveform(sound.blob, 80).then(setWaveform).catch(() => {});
    return () => clearInterval(timerRef.current);
  }, [sound.id]);

  const handlePlay = useCallback(async () => {
    if (playing) {
      // Stop
      if (stopRef.current) stopRef.current();
      clearInterval(timerRef.current);
      setPlaying(false);
      setProgress(0);
      return;
    }
    if (!sound.blob) return;
    setPlaying(true);
    setProgress(0);
    startedAt.current = Date.now();

    try {
      stopRef.current = await playBlob(sound.blob, {
        onEnded: () => {
          clearInterval(timerRef.current);
          setPlaying(false);
          setProgress(0);
        }
      });
      // Update progress bar
      const dur = duration || 2;
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAt.current) / 1000;
        setProgress(Math.min(elapsed / dur, 1));
        if (elapsed >= dur) clearInterval(timerRef.current);
      }, 50);
    } catch {
      setPlaying(false);
    }
  }, [playing, sound.blob, duration]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (stopRef.current) stopRef.current();
    clearInterval(timerRef.current);
  }, []);

  const typeInfo = SOUND_TYPES.find(t => t.id === sound.type) || SOUND_TYPES[SOUND_TYPES.length - 1];
  const durationStr = duration ? `${duration.toFixed(1)}s` : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-card p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-immortail-gold/15 flex items-center justify-center text-xl shrink-0">
          {typeInfo.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-immortail-cream text-sm truncate">
            {sound.metadata?.name || typeInfo.label}
          </p>
          <p className="text-xs text-immortail-soft">{typeInfo.label} {durationStr && `· ${durationStr}`}</p>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(sound.id)}
            className="text-immortail-soft/50 hover:text-red-400 transition-colors text-sm"
            aria-label="Delete"
          >
            ✕
          </button>
        )}
      </div>

      {/* Waveform */}
      <div className="relative">
        <WaveformDisplay waveform={waveform} playing={playing} progress={progress} />
        {/* Play overlay */}
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
            ${playing
              ? 'bg-immortail-gold text-immortail-deep shadow-immortail'
              : 'bg-white/10 hover:bg-white/20 text-immortail-cream'
            }`}
          >
            <span className="text-base leading-none">{playing ? '⏸' : '▶'}</span>
          </div>
        </button>
      </div>

      {/* Analysis badge */}
      {sound.analysisResult && (
        <div className="flex flex-wrap gap-1.5">
          <span className="tag-pill text-[10px]">🔊 {sound.analysisResult.tone}</span>
          <span className="tag-pill text-[10px]">⚡ {Math.round(sound.analysisResult.intensity * 100)}% intensity</span>
          {sound.analysisResult.barkType && (
            <span className="tag-pill text-[10px]">🐕 {sound.analysisResult.barkType.replace('_', ' ')}</span>
          )}
        </div>
      )}

      {/* Type selector */}
      {onTagChange && (
        <select
          value={sound.type}
          onChange={e => onTagChange(sound.id, e.target.value)}
          className="input-field text-xs py-2"
        >
          {SOUND_TYPES.map(t => (
            <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
          ))}
        </select>
      )}
    </motion.div>
  );
}
