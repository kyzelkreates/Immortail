import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Profiles } from '../core/storage.js';
import { ROUTES } from '../core/constants.js';

const TAGLINES = [
  'Keep their tail wagging forever.',
  'Where memories still wag.',
  'Built from memories. Powered by love.',
  'Their spirit, still beside you.',
];

export default function LandingPage({ onOpenRestore }) {
  const navigate = useNavigate();
  const { activeProfileId, ready } = useApp();
  const [profiles, setProfiles]    = useState([]);
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [showProfiles, setShowProfiles] = useState(false);

  // Rotate taglines
  useEffect(() => {
    const t = setInterval(() => setTaglineIdx(i => (i + 1) % TAGLINES.length), 3500);
    return () => clearInterval(t);
  }, []);

  // Load existing profiles
  useEffect(() => {
    Profiles.list().then(setProfiles);
  }, []);

  // If already has active profile → redirect
  useEffect(() => {
    if (ready && activeProfileId) navigate(ROUTES.DASHBOARD, { replace: true });
  }, [ready, activeProfileId, navigate]);

  return (
    <div className="min-h-screen bg-immortail-hero flex flex-col relative overflow-hidden">
      {/* Ambient particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-immortail-gold/20"
            style={{ left: `${8 + i * 8}%`, top: `${20 + (i % 3) * 20}%` }}
            animate={{ y: [-10, 10, -10], opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 3 + i * 0.4, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-12 pb-4 safe-top">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐾</span>
          <span className="font-display text-xl text-immortail-gold">Immortail™</span>
        </div>
        {profiles.length > 0 && (
          <button
            onClick={() => setShowProfiles(true)}
            className="btn-ghost text-sm px-4 py-2"
          >
            My Dogs ({profiles.length})
          </button>
        )}
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center py-12">
        {/* Paw icon */}
        <motion.div
          animate={{ y: [-6, 6, -6], rotate: [-3, 3, -3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-7xl mb-8"
        >
          🐾
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-display text-4xl sm:text-5xl text-immortail-cream mb-4 leading-tight"
        >
          Immortail™
        </motion.h1>

        {/* Rotating tagline */}
        <div className="h-8 overflow-hidden mb-8">
          <AnimatePresence mode="wait">
            <motion.p
              key={taglineIdx}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="text-immortail-gold text-lg font-light tracking-wide"
            >
              {TAGLINES[taglineIdx]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-immortail-soft text-base max-w-sm leading-relaxed mb-10"
        >
          Upload your dog's photos, sounds, and memories. We'll reconstruct a living, interactive companion — always beside you.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col gap-3 w-full max-w-xs"
        >
          <button
            onClick={() => navigate(ROUTES.CREATE)}
            className="btn-primary text-base py-4 flex items-center justify-center gap-2"
          >
            <span>🐶</span> Begin Their Legacy
          </button>

          {profiles.length > 0 && (
            <button
              onClick={() => setShowProfiles(true)}
              className="btn-ghost text-base py-4"
            >
              Continue a Memory
            </button>
          )}

          {/* Restore from backup — shown when no profiles or always */}
          {onOpenRestore && (
            <button
              onClick={onOpenRestore}
              className="btn-ghost text-sm py-3 opacity-70 hover:opacity-100 transition-opacity"
            >
              📦 Restore from backup
            </button>
          )}
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="grid grid-cols-3 gap-4 mt-14 max-w-sm w-full"
        >
          {[
            { icon: '📷', label: 'Photo Engine' },
            { icon: '🎵', label: 'Sound Memory' },
            { icon: '🤖', label: 'Local AI' },
          ].map(f => (
            <div key={f.label} className="flex flex-col items-center gap-1">
              <span className="text-2xl">{f.icon}</span>
              <span className="text-xs text-immortail-soft/70 text-center">{f.label}</span>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="text-center pb-8 safe-bottom">
        <p className="text-immortail-soft/40 text-xs">All memories stay on your device. Forever private.</p>
      </footer>

      {/* Profile picker modal */}
      <AnimatePresence>
        {showProfiles && (
          <ProfilePickerModal
            profiles={profiles}
            onClose={() => setShowProfiles(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Profile Picker ───────────────────────────────────────────────────────────
function ProfilePickerModal({ profiles, onClose }) {
  const { activateProfile } = useApp();
  const navigate = useNavigate();

  const handleSelect = async (profile) => {
    await activateProfile(profile.id);
    navigate(ROUTES.DASHBOARD);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="glass-card w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-display text-xl text-immortail-cream mb-1">Choose a Memory</h2>
        <p className="text-immortail-soft text-sm mb-5">Select a profile to continue</p>

        <div className="space-y-3 max-h-72 overflow-y-auto no-scrollbar">
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full text-left glass-card p-4 hover:border-immortail-gold/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-immortail-gold/20 flex items-center justify-center text-xl">
                  🐾
                </div>
                <div>
                  <p className="font-medium text-immortail-cream">{p.name}</p>
                  <p className="text-xs text-immortail-soft">{p.breed || 'Unknown breed'} · {p.colour || ''}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="divider-gold" />
        <button onClick={onClose} className="btn-ghost w-full text-sm">Close</button>
      </motion.div>
    </motion.div>
  );
}
