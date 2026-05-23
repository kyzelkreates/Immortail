/**
 * Immortail™ — Memory Walk Mode  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * A cinematic, peaceful experience where the companion gently wanders
 * while favourite memories surface softly one by one.
 *
 * Style: cinematic, warm, emotionally comforting — NOT a slideshow.
 * Each memory fades in slowly, lingers, then retreats. No skip buttons.
 * No interaction pressure. The user watches, feels, remembers.
 *
 * Features:
 *   - Photos, memories, and sounds surface in priority order
 *   - Environment shifts subtly based on memory emotional tags
 *   - Dog walks/wanders gently across the environment
 *   - Ambient audio from saved sounds plays softly (if enabled)
 *   - Exit button always visible — never trapped
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Photos, MemoryEntries, Sounds, Timeline } from '../core/storage.js';
import { playBlobLooping } from '../audio/audioEngine.js';
import { ENV_MODES, ROUTES, getAutoEnvMode } from '../core/constants.js';
import MemoryEnvironment from '../environment/MemoryEnvironment.jsx';
import VirtualDog        from '../virtualdog/VirtualDog.jsx';

// ── Memory walk config ─────────────────────────────────────────────────────────
const CARD_DISPLAY_MS  = 8000;   // how long each memory shows
const CARD_FADE_MS     = 1500;   // crossfade duration
const AMBIENT_VOLUME   = 0.18;   // very soft background

// Choose environment from memory's emotional tags
function envFromTags(tags = []) {
  const envMap = [
    { env: ENV_MODES.BEACH,     words: ['beach','sea','ocean','sand'] },
    { env: ENV_MODES.WOODLAND,  words: ['walk','park','forest','garden','field'] },
    { env: ENV_MODES.FIREPLACE, words: ['sofa','cuddle','home','inside','indoors','fire'] },
    { env: ENV_MODES.SNOW,      words: ['snow','winter','cold'] },
    { env: ENV_MODES.GOLDEN,    words: ['morning','sunrise','walk'] },
    { env: ENV_MODES.SUNSET,    words: ['evening','sunset','dusk'] },
    { env: ENV_MODES.RAIN,      words: ['rain','wet','storm'] },
  ];
  const allText = tags.join(' ').toLowerCase();
  for (const { env, words } of envMap) {
    if (words.some(w => allText.includes(w))) return env;
  }
  return null;
}

// Build memory walk sequence from all stored data
async function buildWalkSequence(profileId, dogName) {
  const [photos, memories, sounds, timeline] = await Promise.all([
    Photos.listByProfile(profileId),
    MemoryEntries.listByProfile(profileId),
    Sounds.listByProfile(profileId),
    Timeline.listByProfile(profileId),
  ]);

  const items = [];

  // Written memories (highest emotional value)
  memories.forEach(m => {
    items.push({
      id:   m.id,
      type: 'memory',
      title: m.title,
      body:  m.text?.slice(0, 180) + (m.text?.length > 180 ? '…' : ''),
      tags:  m.emotionalTags || [],
      env:   envFromTags(m.emotionalTags),
      date:  m.date,
      priority: 10,
    });
  });

  // Photos
  const sortedPhotos = [...photos].sort((a, b) => a.createdAt - b.createdAt);
  sortedPhotos.slice(0, 12).forEach(p => {
    items.push({
      id:       p.id,
      type:     'photo',
      blob:     p.thumbnail || p.blob,
      title:    p.metadata?.name?.replace(/\.[^.]+$/, '') || `${dogName}`,
      tags:     [],
      env:      null,
      priority: 6,
    });
  });

  // Timeline milestones
  timeline.slice(0, 5).forEach(ev => {
    items.push({
      id:       ev.id,
      type:     'timeline',
      title:    ev.title,
      body:     ev.description || '',
      tags:     [ev.type],
      env:      null,
      date:     ev.date,
      priority: 8,
    });
  });

  // Sort by priority, then shuffle within tiers
  items.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return Math.random() - 0.5;
  });

  return { items, sounds };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MemoryWalkPage() {
  const { activeProfileId, profile, dogConfig } = useApp();
  const navigate = useNavigate();

  const [envMode,       setEnvMode]       = useState(getAutoEnvMode());
  const [sequence,      setSequence]      = useState([]);
  const [sounds,        setSounds]        = useState([]);
  const [seqIdx,        setSeqIdx]        = useState(0);
  const [currentCard,   setCurrentCard]   = useState(null);
  const [photoUrl,      setPhotoUrl]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [paused,        setPaused]        = useState(false);
  const [ambientActive, setAmbientActive] = useState(false);

  const timerRef       = useRef(null);
  const ambientStopRef = useRef(null);
  const photoUrlRef    = useRef(null);
  const dogName        = profile?.name || 'Your dog';

  // ── Load sequence ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProfileId) return;
    buildWalkSequence(activeProfileId, dogName).then(({ items, sounds: s }) => {
      setSequence(items);
      setSounds(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeProfileId, dogName]);

  // ── Start ambient sound ──────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || sounds.length === 0 || ambientActive) return;
    const candidates = sounds.filter(s => s.blob && (s.type === 'bark' || s.type === 'happy'));
    if (!candidates.length) return;

    const sound = candidates[Math.floor(Math.random() * candidates.length)];
    setAmbientActive(true);

    playBlobLooping(sound.blob, { volume: AMBIENT_VOLUME, fadeIn: true })
      .then(({ stop }) => {
        ambientStopRef.current = stop;
      })
      .catch(() => { setAmbientActive(false); });

    return () => {
      ambientStopRef.current?.();
      ambientStopRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Advance through sequence ─────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (!sequence.length) return;
    setSeqIdx(prev => {
      const nextIdx = (prev + 1) % sequence.length;
      const card    = sequence[nextIdx];

      // Revoke old photo URL
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
      }

      // Create URL for photo blobs
      if (card.type === 'photo' && card.blob) {
        const url = URL.createObjectURL(card.blob);
        photoUrlRef.current = url;
        setPhotoUrl(url);
      } else {
        setPhotoUrl(null);
      }

      setCurrentCard(card);

      // Shift environment if the card has env data
      if (card.env) setEnvMode(card.env);

      return nextIdx;
    });
  }, [sequence]);

  // ── Auto-advance timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || paused || sequence.length === 0) return;

    // Show first card immediately
    if (!currentCard && sequence[0]) {
      const first = sequence[0];
      setCurrentCard(first);
      if (first.env) setEnvMode(first.env);
      if (first.type === 'photo' && first.blob) {
        const url = URL.createObjectURL(first.blob);
        photoUrlRef.current = url;
        setPhotoUrl(url);
      }
    }

    timerRef.current = setInterval(advance, CARD_DISPLAY_MS);
    return () => clearInterval(timerRef.current);
  }, [loading, paused, sequence, advance, currentCard]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => () => {
    clearInterval(timerRef.current);
    ambientStopRef.current?.();
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, []);

  // ── Exit ─────────────────────────────────────────────────────────────────────
  const handleExit = useCallback(() => {
    ambientStopRef.current?.();
    navigate(ROUTES.IMMORTAIL);
  }, [navigate]);

  const fmtDate = (ts) => ts
    ? new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-immortail-deep flex items-center justify-center">
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-immortail-gold font-display text-lg"
        >
          Preparing their walk…
        </motion.span>
      </div>
    );
  }

  if (!sequence.length) {
    return (
      <div className="min-h-screen bg-immortail-deep flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-5xl">📷</div>
        <p className="text-immortail-cream font-display text-xl">No memories yet</p>
        <p className="text-immortail-soft text-sm leading-relaxed">
          Add some photos, sounds, or memories to begin {dogName}'s walk.
        </p>
        <button onClick={handleExit} className="btn-primary px-6 py-3 mt-4">
          Return
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-immortail-deep">

      {/* ── Environment ───────────────────────────────────────────────────── */}
      <MemoryEnvironment
        mode={envMode}
        className="absolute inset-0"
        style={{ height: '100%' }}
      />

      {/* ── Dark overlay for text readability ──────────────────────────── */}
      <div className="absolute inset-0 bg-immortail-deep/40 pointer-events-none" />

      {/* ── Content layer ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col h-screen">

        {/* Top controls */}
        <div className="flex items-center justify-between px-5 pt-12 pb-4 safe-top">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <span className="text-immortail-gold font-display text-base">{dogName}'s Walk</span>
          </motion.div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaused(p => !p)}
              className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-sm"
            >
              {paused ? '▶' : '⏸'}
            </button>
            <button
              onClick={handleExit}
              className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Dog companion — wanders gently */}
        <div className="flex justify-center mt-4">
          <VirtualDog
            profile={profile}
            dogConfig={dogConfig}
            onInteraction={() => {}}
            interactive={false}
            presenceStateOverride="walking"
            quality="medium"
            className="w-48 h-48"
            currentEnv={envMode}
          />
        </div>

        {/* Memory card */}
        <div className="flex-1 flex items-end justify-center pb-20 px-5">
          <AnimatePresence mode="wait">
            {currentCard && (
              <motion.div
                key={currentCard.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: CARD_FADE_MS / 1000, ease: 'easeInOut' }}
                className="w-full max-w-sm"
              >
                <div className="glass-card rounded-3xl overflow-hidden border border-white/10 shadow-2xl">

                  {/* Photo */}
                  {currentCard.type === 'photo' && photoUrl && (
                    <img
                      src={photoUrl}
                      alt={currentCard.title}
                      className="w-full h-48 object-cover"
                      style={{ filter: 'brightness(0.88) saturate(1.1)' }}
                    />
                  )}

                  <div className="p-5">
                    {/* Type indicator */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-immortail-gold/70">
                        {currentCard.type === 'memory'   ? '💭 Memory'
                        : currentCard.type === 'photo'   ? '📷 Photo'
                        : currentCard.type === 'timeline'? '⭐ Milestone'
                        : '🐾'}
                      </span>
                      {currentCard.date && (
                        <span className="text-xs text-immortail-soft/40 ml-auto">
                          {fmtDate(currentCard.date)}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <p className="font-display text-immortail-cream text-lg leading-snug mb-2">
                      {currentCard.title}
                    </p>

                    {/* Body text */}
                    {currentCard.body && (
                      <p className="text-immortail-soft text-sm leading-relaxed">
                        {currentCard.body}
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-1.5 mt-4">
                  {sequence.slice(0, Math.min(8, sequence.length)).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-full transition-all duration-500 ${
                        i === (seqIdx % sequence.length)
                          ? 'w-4 h-1.5 bg-immortail-gold'
                          : 'w-1.5 h-1.5 bg-white/20'
                      }`}
                    />
                  ))}
                  {sequence.length > 8 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
