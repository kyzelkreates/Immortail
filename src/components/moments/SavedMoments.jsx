/**
 * Immortail™ — SavedMoments
 * ─────────────────────────────────────────────────────────────────────────────
 * Emotional save states — snapshots of environment + dog mood.
 * Stored in localStorage (no IDB required — lightweight state only).
 * Additive only. Preserves all existing storage contracts.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOMENT_PRESETS } from '../../core/constants.js';

const SAVED_MOMENTS_KEY = 'immortail:savedMoments';

// ── Storage helpers (additive LS key) ─────────────────────────────────────────
export const SavedMomentsStore = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_MOMENTS_KEY) || '[]');
    } catch { return []; }
  },
  save(moment) {
    const list = this.list();
    // Replace if same id, otherwise prepend
    const idx = list.findIndex(m => m.id === moment.id);
    if (idx >= 0) list[idx] = moment; else list.unshift(moment);
    localStorage.setItem(SAVED_MOMENTS_KEY, JSON.stringify(list.slice(0, 20)));
  },
  delete(id) {
    const list = this.list().filter(m => m.id !== id);
    localStorage.setItem(SAVED_MOMENTS_KEY, JSON.stringify(list));
  },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function SavedMoments({ currentEnv, currentDogState, onLoadMoment }) {
  const [saved, setSaved]         = useState(() => SavedMomentsStore.list());
  const [showSaveForm, setShow]   = useState(false);
  const [label, setLabel]         = useState('');
  const [tab, setTab]             = useState('presets'); // 'presets' | 'saved'

  const handleSave = useCallback(() => {
    if (!label.trim()) return;
    const moment = {
      id:        `moment_${Date.now()}`,
      label:     label.trim(),
      emoji:     '🐾',
      env:       currentEnv,
      dogState:  currentDogState,
      savedAt:   Date.now(),
      custom:    true,
    };
    SavedMomentsStore.save(moment);
    setSaved(SavedMomentsStore.list());
    setLabel('');
    setShow(false);
  }, [label, currentEnv, currentDogState]);

  const handleDelete = useCallback((id, e) => {
    e.stopPropagation();
    SavedMomentsStore.delete(id);
    setSaved(SavedMomentsStore.list());
  }, []);

  const handleLoad = useCallback((moment) => {
    onLoadMoment?.(moment);
  }, [onLoadMoment]);

  const fmtDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 glass-card p-1 rounded-xl">
        {[{ id: 'presets', label: '✨ Presets' }, { id: 'saved', label: '🐾 My Moments' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.id ? 'bg-immortail-gold/20 text-immortail-gold' : 'text-immortail-soft hover:text-immortail-cream'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Presets */}
      {tab === 'presets' && (
        <div className="grid grid-cols-2 gap-2">
          {MOMENT_PRESETS.map(preset => (
            <button key={preset.id} onClick={() => handleLoad(preset)}
              className="glass-card p-3 text-left hover:border-immortail-gold/30 transition-all rounded-xl">
              <span className="text-xl block mb-1">{preset.emoji}</span>
              <p className="text-xs font-medium text-immortail-cream leading-tight">{preset.label}</p>
              <p className="text-xs text-immortail-soft/60 mt-0.5 capitalize">{preset.env}</p>
            </button>
          ))}
        </div>
      )}

      {/* Saved moments */}
      {tab === 'saved' && (
        <div className="space-y-2">
          {/* Save current */}
          {!showSaveForm ? (
            <button onClick={() => setShow(true)}
              className="w-full glass-card border-dashed border-white/15 p-3 text-xs text-immortail-soft hover:text-immortail-cream flex items-center justify-center gap-2 rounded-xl">
              <span>+</span> Save this moment
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card-warm p-3 rounded-xl space-y-2">
              <input
                type="text"
                placeholder="Name this moment…"
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-immortail-cream placeholder:text-immortail-soft/40 outline-none focus:border-immortail-gold/30"
                maxLength={40}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={!label.trim()} className="btn-primary flex-1 text-xs py-2">
                  💛 Save
                </button>
                <button onClick={() => { setShow(false); setLabel(''); }} className="btn-ghost px-3 py-2 text-xs">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {/* List */}
          {saved.length === 0 && !showSaveForm && (
            <div className="text-center py-6 text-immortail-soft/50 text-xs">
              <span className="text-2xl block mb-2 opacity-40">🐾</span>
              No saved moments yet.<br />Save your current environment to revisit it.
            </div>
          )}

          <AnimatePresence>
            {saved.map(m => (
              <motion.div key={m.id} layout
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="glass-card p-3 flex items-center gap-3 cursor-pointer hover:border-immortail-gold/25 transition-all rounded-xl"
                onClick={() => handleLoad(m)}
              >
                <span className="text-xl shrink-0">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-immortail-cream truncate">{m.label}</p>
                  <p className="text-xs text-immortail-soft capitalize">{m.env} · {fmtDate(m.savedAt)}</p>
                </div>
                <button onClick={(e) => handleDelete(m.id, e)}
                  className="text-immortail-soft/30 hover:text-immortail-soft transition-colors text-xs shrink-0">
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
