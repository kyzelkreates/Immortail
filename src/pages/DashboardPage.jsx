/**
 * Immortail™ — Dashboard
 * The home after opening. Daily greeting, quick actions, setup progress.
 * This page should feel like checking in on a beloved friend.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation }    from 'react-router-dom';
import { motion }         from 'framer-motion';
import { useApp }         from '../core/AppContext.jsx';
import { Photos, Sounds, MemoryEntries, Timeline } from '../core/storage.js';
import { ROUTES, PERSONALITY_TRAITS, DOG_COLOURS, DOG_BREEDS } from '../core/constants.js';
import NavBar             from '../components/ui/NavBar.jsx';
import { useEmotionalPresence } from '../hooks/useEmotionalPresence.js';
import { BackupEngine }   from '../migration/BackupEngine.js';

const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.07 } } },
  item:      { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } },
};

// Greeting copy based on time of day
function getGreeting(ownerName) {
  const h = new Date().getHours();
  const name = ownerName ? `, ${ownerName}` : '';
  if (h < 6)  return `Still awake${name}?`;
  if (h < 12) return `Good morning${name}`;
  if (h < 17) return `Good afternoon${name}`;
  if (h < 21) return `Good evening${name}`;
  return `Good night${name}`;
}

// Warm status line based on data completeness
function getStatusLine(stats, dogName, hasConfig) {
  if (!stats) return '';
  const name = dogName || 'Your companion';
  if (stats.photos === 0 && stats.sounds === 0 && stats.memories === 0)
    return `Start building ${name}'s memory — they're waiting.`;
  if (!hasConfig && (stats.photos > 0 || stats.sounds > 0))
    return `${name} is almost ready. Run AI reconstruction to bring them to life.`;
  if (hasConfig)
    return `${name} is here, alive in your memories.`;
  return `Keep adding memories — every detail brings ${name} closer.`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, dogConfig, activeProfileId, settings } = useApp();
  const [stats, setStats]  = useState({ photos: 0, sounds: 0, memories: 0, timeline: 0 });
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [tributeExpanded,   setTributeExpanded]     = useState(false);

  useEffect(() => {
    if (!activeProfileId) return;
    Promise.all([
      Photos.listByProfile(activeProfileId),
      Sounds.listByProfile(activeProfileId),
      MemoryEntries.listByProfile(activeProfileId),
      Timeline.listByProfile(activeProfileId),
    ]).then(([p, s, m, t]) =>
      setStats({ photos: p.length, sounds: s.length, memories: m.length, timeline: t.length })
    );
  }, [activeProfileId]);

  useEffect(() => {
    const lastBackup = parseInt(localStorage.getItem('immortail:lastBackupAt') || '0', 10);
    const daysSince  = (Date.now() - lastBackup) / (1000 * 60 * 60 * 24);
    if (daysSince > 7 || !lastBackup) setShowBackupReminder(true);
  }, []);

  const dogName      = profile?.name || 'Your companion';
  const hasConfig    = !!dogConfig;
  const ownerName    = profile?.ownerName || settings?.ownerName || '';
  const greeting     = getGreeting(ownerName);
  const statusLine   = getStatusLine(stats, dogName, hasConfig);
  const traits       = PERSONALITY_TRAITS.filter(t => profile?.traits?.includes(t.id));
  const colourHex    = DOG_COLOURS.find(c => c.id === profile?.colour)?.hex;

  // Setup progress — gentle, never pressuring
  const totalMemories = stats.photos + stats.sounds + stats.memories;
  const setupSteps = [
    { done: stats.photos > 0,   label: 'Add photos',         icon: '📷', to: ROUTES.MEMORIES },
    { done: stats.sounds > 0,   label: 'Add sounds',         icon: '🎵', to: ROUTES.SOUNDS   },
    { done: stats.memories > 0, label: 'Write a memory',     icon: '✍️', to: ROUTES.MEMORIES },
    { done: hasConfig,          label: 'Run AI setup',        icon: '🤖', to: ROUTES.IMMORTAIL },
  ];
  const doneCount    = setupSteps.filter(s => s.done).length;
  const setupPct     = Math.round((doneCount / setupSteps.length) * 100);
  const allSetup     = doneCount === setupSteps.length;

  const QUICK_ACTIONS = [
    {
      icon:      '🐾',
      label:     `Visit ${dogName}`,
      desc:      'Open the memory space',
      to:        ROUTES.IMMORTAIL,
      highlight: true,
    },
    {
      icon:  '📷',
      label: 'Add Photos',
      desc:  stats.photos > 0 ? `${stats.photos} photo${stats.photos !== 1 ? 's' : ''}` : 'None yet',
      to:    ROUTES.MEMORIES,
    },
    {
      icon:  '🎵',
      label: 'Add Sounds',
      desc:  stats.sounds > 0 ? `${stats.sounds} sound${stats.sounds !== 1 ? 's' : ''}` : 'None yet',
      to:    ROUTES.SOUNDS,
    },
    {
      icon:  '📅',
      label: 'Timeline',
      desc:  stats.timeline > 0 ? `${stats.timeline} moment${stats.timeline !== 1 ? 's' : ''}` : 'Add events',
      to:    ROUTES.TIMELINE,
    },
  ];

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="px-5 pt-12 pb-2 safe-top">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-immortail-soft/70 text-sm mb-0.5">{greeting}</p>
          <h1 className="font-display text-3xl text-immortail-cream leading-tight">
            {dogName} is here.
          </h1>
          {statusLine && (
            <p className="text-immortail-gold/80 text-sm mt-1.5 leading-relaxed">
              {statusLine}
            </p>
          )}
        </motion.div>
      </header>

      <main className="px-5 pt-4 space-y-5">
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="show"
          className="space-y-5"
        >

          {/* ── Hero card — visit dog ─────────────────────────────────── */}
          <motion.div variants={stagger.item}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.01 }}
              onClick={() => navigate(ROUTES.IMMORTAIL)}
              className="w-full glass-card-warm border border-immortail-gold/25 rounded-3xl p-5
                         flex items-center gap-4 group overflow-hidden relative"
            >
              {/* Background glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                   style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />

              <motion.div
                animate={{ y: [-3, 3, -3], rotate: [-2, 2, -2] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="text-5xl shrink-0"
              >
                🐾
              </motion.div>

              <div className="flex-1 text-left">
                <p className="font-display text-xl text-immortail-cream group-hover:text-immortail-gold
                               transition-colors leading-tight">
                  Visit {dogName}
                </p>
                <p className="text-immortail-soft/70 text-sm mt-0.5">
                  {hasConfig
                    ? `${dogName} is alive with your memories`
                    : 'Enter their space — AI reconstruction available'}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  {traits.slice(0, 3).map(t => (
                    <span key={t.id}
                          className="text-xs px-2 py-0.5 rounded-full bg-immortail-gold/10
                                     border border-immortail-gold/20 text-immortail-gold/80">
                      {t.emoji} {t.label}
                    </span>
                  ))}
                </div>
              </div>

              <span className="text-immortail-gold/40 group-hover:text-immortail-gold transition-colors text-lg">→</span>
            </motion.button>
          </motion.div>

          {/* ── Tribute / dedication block (if written) ────────────────── */}
          {profile?.tribute && (
            <motion.div variants={stagger.item}>
              <div className="glass-card p-4 border-l-2 border-immortail-gold/40">
                <p className="text-xs text-immortail-gold/60 uppercase tracking-widest mb-2">
                  Your tribute
                </p>
                <p className={`text-immortail-soft text-sm leading-relaxed italic transition-all ${
                  tributeExpanded ? '' : 'line-clamp-3'
                }`}>
                  "{profile.tribute}"
                </p>
                {profile.tribute.length > 120 && (
                  <button
                    onClick={() => setTributeExpanded(e => !e)}
                    className="text-immortail-gold/60 text-xs mt-1.5 hover:text-immortail-gold transition-colors"
                  >
                    {tributeExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Setup progress (only show if not all done) ─────────────── */}
          {!allSetup && (
            <motion.div variants={stagger.item}>
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-immortail-cream">
                    Building {dogName}'s memorial
                  </p>
                  <span className="text-immortail-gold text-sm font-medium">{setupPct}%</span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #9A7A2E, #C9A84C, #E5C97A)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${setupPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>

                {/* Steps */}
                <div className="grid grid-cols-2 gap-2">
                  {setupSteps.map(s => (
                    <button
                      key={s.label}
                      onClick={() => !s.done && navigate(s.to, { state: { from: 'setup' } })}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-all ${
                        s.done
                          ? 'bg-immortail-gold/8 border border-immortail-gold/20'
                          : 'bg-white/4 border border-white/8 hover:border-white/15'
                      }`}
                    >
                      <span className="text-base shrink-0">{s.done ? '✅' : s.icon}</span>
                      <span className={`text-xs truncate ${
                        s.done ? 'text-immortail-gold/70 line-through' : 'text-immortail-soft'
                      }`}>
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Quick actions grid ──────────────────────────────────────── */}
          <motion.div variants={stagger.item}>
            <p className="text-xs text-immortail-soft/50 uppercase tracking-widest mb-3 px-0.5">
              Quick access
            </p>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map(a => (
                <motion.button
                  key={a.label}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(a.to)}
                  className={`glass-card p-4 text-left transition-all group ${
                    a.highlight ? 'border-immortail-gold/25 bg-immortail-gold/5' : ''
                  }`}
                >
                  <span className="text-2xl block mb-2 group-hover:scale-110 transition-transform origin-left">
                    {a.icon}
                  </span>
                  <p className={`text-sm font-medium leading-none mb-1 ${
                    a.highlight ? 'text-immortail-gold' : 'text-immortail-cream'
                  }`}>
                    {a.label}
                  </p>
                  <p className="text-xs text-immortail-soft/60 leading-tight">{a.desc}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* ── Dog profile summary ─────────────────────────────────────── */}
          {profile && (
            <motion.div variants={stagger.item}>
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {colourHex && (
                    <div className="w-10 h-10 rounded-full border-2 border-immortail-gold/30 shrink-0"
                         style={{ background: colourHex }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-base text-immortail-cream">{dogName}</p>
                    <p className="text-xs text-immortail-soft/70 truncate">
                      {[profile.breed, profile.age ? `${profile.age} years old` : null]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(ROUTES.SETTINGS)}
                    className="text-immortail-soft/40 hover:text-immortail-soft text-xs transition-colors"
                  >
                    Edit
                  </button>
                </div>

                {traits.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {traits.map(t => (
                      <span key={t.id}
                            className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10
                                       text-immortail-soft/80">
                        {t.emoji} {t.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { n: stats.photos,   label: 'Photos' },
                    { n: stats.sounds,   label: 'Sounds' },
                    { n: stats.memories, label: 'Memories' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="font-display text-xl text-immortail-gold">{s.n}</p>
                      <p className="text-[10px] text-immortail-soft/50 uppercase tracking-wide">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Backup reminder ─────────────────────────────────────────── */}
          {showBackupReminder && (
            <motion.div
              variants={stagger.item}
              className="glass-card p-4 border border-immortail-gold/15 flex items-center gap-3"
            >
              <span className="text-2xl shrink-0">💾</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-immortail-cream font-medium">Protect their memories</p>
                <p className="text-xs text-immortail-soft/60 mt-0.5">
                  Create a backup to keep {dogName} safe.
                </p>
              </div>
              <button
                onClick={() => navigate(ROUTES.SETTINGS)}
                className="text-immortail-gold text-xs shrink-0 hover:text-immortail-gold-light transition-colors"
              >
                Back up →
              </button>
            </motion.div>
          )}

        </motion.div>
      </main>

      <NavBar />
    </div>
  );
}
