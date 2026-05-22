/**
 * Immortail™ — Landing Page
 * The first thing someone sees. It must feel like a gift.
 * Emotionally warm, visually cinematic, immediate in its purpose.
 */
import { useEffect, useState } from 'react';
import { useNavigate }          from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp }               from '../core/AppContext.jsx';
import { Profiles }             from '../core/storage.js';
import { ROUTES }               from '../core/constants.js';

// Rotating taglines — each one earns a moment
const TAGLINES = [
  { text: 'Keep their tail wagging forever.',   sub: 'Your dog, still beside you.' },
  { text: 'Built from memories. Powered by love.', sub: 'Every photo, sound, and moment — restored.' },
  { text: 'Their spirit, still beside you.',    sub: 'A companion that never truly leaves.' },
  { text: 'Where memories still wag.',          sub: 'Private. Local. Always yours.' },
];

// Soft floating testimonial-style lines (not fake reviews — just emotional truths)
const TRUTHS = [
  '"I can still hear him bark when I open the app."',
  '"She still sits by my side every morning."',
  '"It\'s the closest thing to one more day together."',
];

export default function LandingPage({ onOpenRestore }) {
  const navigate = useNavigate();
  const { activeProfileId, ready } = useApp();
  const [profiles, setProfiles]    = useState([]);
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [truthIdx, setTruthIdx]    = useState(0);
  const [showProfiles, setShowProfiles] = useState(false);
  const [loaded, setLoaded]        = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTaglineIdx(i => (i + 1) % TAGLINES.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTruthIdx(i => (i + 1) % TRUTHS.length), 5500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Profiles.list().then(setProfiles);
    setTimeout(() => setLoaded(true), 80);
  }, []);

  // Already has active profile → redirect
  useEffect(() => {
    if (ready && activeProfileId) navigate(ROUTES.DASHBOARD, { replace: true });
  }, [ready, activeProfileId, navigate]);

  const tagline = TAGLINES[taglineIdx];

  return (
    <div className="min-h-screen bg-immortail-hero flex flex-col relative overflow-hidden">

      {/* ── Deep background glow ─────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Warm gold radial at bottom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-64"
             style={{ background: 'radial-gradient(ellipse, rgba(201,168,76,0.12) 0%, transparent 70%)' }} />
        {/* Cool depth at top */}
        <div className="absolute top-0 left-0 right-0 h-48"
             style={{ background: 'linear-gradient(180deg, rgba(10,8,4,0.6) 0%, transparent 100%)' }} />
      </div>

      {/* ── Ambient floating particles ───────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(16)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left:       `${5 + i * 6}%`,
              top:        `${10 + (i % 5) * 16}%`,
              width:      i % 3 === 0 ? 3 : 2,
              height:     i % 3 === 0 ? 3 : 2,
              background: i % 4 === 0 ? 'rgba(201,168,76,0.35)' : 'rgba(245,237,216,0.15)',
            }}
            animate={{ y: [0, -18, 0], opacity: [0.1, 0.5, 0.1] }}
            transition={{ duration: 4 + i * 0.35, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 pt-12 pb-4 safe-top relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2"
        >
          <motion.span
            animate={{ rotate: [-4, 4, -4] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-2xl"
          >🐾</motion.span>
          <span className="font-display text-xl text-immortail-gold tracking-wide">Immortail™</span>
        </motion.div>

        {profiles.length > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => setShowProfiles(true)}
            className="btn-ghost text-sm px-4 py-2"
          >
            My Dogs ({profiles.length})
          </motion.button>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center relative z-10 py-8">

        {/* Paw — the emotional centre of the page */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', damping: 14 }}
          className="relative mb-10"
        >
          <motion.div
            animate={{ y: [-7, 7, -7] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-8xl"
          >
            🐾
          </motion.div>
          {/* Glow halo */}
          <div className="absolute inset-0 -z-10 rounded-full blur-2xl opacity-30"
               style={{ background: 'radial-gradient(circle, #C9A84C 0%, transparent 70%)' }} />
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="font-display text-5xl sm:text-6xl text-immortail-cream mb-3 leading-tight tracking-tight"
        >
          Immortail™
        </motion.h1>

        {/* Rotating tagline — the emotional hook */}
        <div className="h-14 overflow-hidden mb-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={taglineIdx}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <p className="text-immortail-gold text-lg font-light tracking-wide leading-snug">
                {tagline.text}
              </p>
              <p className="text-immortail-soft/70 text-sm mt-1">{tagline.sub}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Rotating emotional truth — quote style */}
        <div className="h-8 overflow-hidden mb-8">
          <AnimatePresence mode="wait">
            <motion.p
              key={truthIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-immortail-soft/50 text-xs italic tracking-wide"
            >
              {TRUTHS[truthIdx]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-3 w-full max-w-xs"
        >
          <button
            onClick={() => navigate(ROUTES.CREATE)}
            className="btn-primary text-base py-4 flex items-center justify-center gap-2.5 shadow-immortail-lg"
          >
            <span className="text-lg">🐶</span>
            <span>Begin Their Legacy</span>
          </button>

          {profiles.length > 0 && (
            <button
              onClick={() => setShowProfiles(true)}
              className="btn-ghost text-base py-3.5"
            >
              Continue a Memory
            </button>
          )}

          {onOpenRestore && (
            <button
              onClick={onOpenRestore}
              className="text-immortail-soft/50 hover:text-immortail-soft text-sm py-2 transition-colors"
            >
              📦 Restore from backup
            </button>
          )}
        </motion.div>

        {/* Feature pillars */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="grid grid-cols-3 gap-3 mt-12 max-w-xs w-full"
        >
          {[
            { icon: '📷', label: 'Photo Memory',  desc: 'Up to 100 photos' },
            { icon: '🎵', label: 'Voice & Sound', desc: 'Their real voice' },
            { icon: '🤖', label: 'Local AI',      desc: 'Fully offline' },
          ].map(f => (
            <motion.div
              key={f.label}
              whileHover={{ scale: 1.04 }}
              className="glass-card p-3 flex flex-col items-center gap-1.5 text-center"
            >
              <span className="text-2xl">{f.icon}</span>
              <span className="text-xs font-medium text-immortail-cream leading-none">{f.label}</span>
              <span className="text-[10px] text-immortail-soft/60 leading-tight">{f.desc}</span>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center pb-8 safe-bottom px-6">
        <div className="flex items-center justify-center gap-6 mb-3">
          {['🔒 Private', '📱 Offline', '♾️ Forever'].map(t => (
            <span key={t} className="text-immortail-soft/40 text-xs">{t}</span>
          ))}
        </div>
        <p className="text-immortail-soft/30 text-xs">
          All memories stay on your device. No cloud. No accounts. No subscriptions.
        </p>
      </footer>

      {/* ── Profile picker modal ─────────────────────────────────────────── */}
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

// ── Profile Picker ────────────────────────────────────────────────────────────
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
        transition={{ type: 'spring', damping: 22 }}
        className="glass-card-warm w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <p className="text-3xl mb-2">🐾</p>
          <h2 className="font-display text-xl text-immortail-cream">Choose a Memory</h2>
          <p className="text-immortail-soft text-sm mt-1">They're waiting for you</p>
        </div>

        <div className="space-y-3 max-h-72 overflow-y-auto no-scrollbar">
          {profiles.map(p => (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleSelect(p)}
              className="w-full text-left glass-card p-4 hover:border-immortail-gold/40 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-immortail-gold/15 border border-immortail-gold/25
                                flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🐾
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base text-immortail-cream group-hover:text-immortail-gold
                                transition-colors">{p.name}</p>
                  <p className="text-xs text-immortail-soft truncate">
                    {[p.breed, p.colour].filter(Boolean).join(' · ') || 'Your companion'}
                  </p>
                </div>
                <span className="text-immortail-gold/0 group-hover:text-immortail-gold/60
                                 transition-colors text-sm">→</span>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="mt-4">
          <button onClick={onClose} className="btn-ghost w-full text-sm py-3">Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
