import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Photos, Sounds, MemoryEntries } from '../core/storage.js';
import { ROUTES, PERSONALITY_TRAITS, DOG_COLOURS } from '../core/constants.js';
import NavBar      from '../components/ui/NavBar.jsx';
import { useEmotionalPresence } from '../hooks/useEmotionalPresence.js';
import { BackupEngine }          from '../migration/BackupEngine.js';

const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.08 } } },
  item:      { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, dogConfig } = useApp();
  const [stats, setStats]  = useState({ photos: 0, sounds: 0, memories: 0 });
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    if (!profile?.id) return;
    Promise.all([
      Photos.listByProfile(profile.id),
      Sounds.listByProfile(profile.id),
      MemoryEntries.listByProfile(profile.id),
    ]).then(([p, s, m]) => setStats({ photos: p.length, sounds: s.length, memories: m.length }));
  }, [profile?.id]);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12)      setGreeting('Good morning');
    else if (h < 18) setGreeting('Good afternoon');
    else             setGreeting('Good evening');
  }, []);

  const { greeting: presenceGreeting, isNight } = useEmotionalPresence(profile?.name, null);

  // Legacy protection — surface backup reminder if last backup > 7 days
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  useEffect(() => {
    const lastBackup = parseInt(localStorage.getItem('immortail:lastBackupAt') || '0', 10);
    const daysSince  = (Date.now() - lastBackup) / (1000 * 60 * 60 * 24);
    if (daysSince > 7 || !lastBackup) setShowBackupReminder(true);
  }, []);

  const dogName = profile?.name || 'Your dog';
  const colourHex = DOG_COLOURS.find(c => c.id === profile?.colour)?.hex;
  const traits = PERSONALITY_TRAITS.filter(t => profile?.traits?.includes(t.id));
  const hasConfig = !!dogConfig;
  const setupProgress = Math.min(100, (
    (stats.photos > 0 ? 33 : 0) +
    (stats.sounds > 0 ? 33 : 0) +
    (stats.memories > 0 ? 34 : 0)
  ));

  const QUICK_ACTIONS = [
    { icon: '🐾', label: `Visit ${dogName}`, desc: 'Enter the memory space', to: ROUTES.IMMORTAIL, highlight: true },
    { icon: '📷', label: 'Add Photos',      desc: `${stats.photos} uploaded`,  to: ROUTES.MEMORIES },
    { icon: '🎵', label: 'Add Sounds',      desc: `${stats.sounds} recorded`,  to: ROUTES.SOUNDS },
    { icon: '📅', label: 'Timeline',        desc: `${stats.memories} memories`, to: ROUTES.TIMELINE },
  ];

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 safe-top">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-immortail-soft text-sm mb-1">{greeting}</p>
          <h1 className="font-display text-3xl text-immortail-cream">
            {profile?.ownerName ? profile.ownerName : 'Welcome back'}
          </h1>
          <p className="text-immortail-gold text-base mt-1">
            {dogName} is waiting for you 🐾
          </p>
        </motion.div>
      </header>

      <main className="px-5 space-y-6">
        {/* Hero dog card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card-warm p-6 flex items-center gap-5 cursor-pointer"
          onClick={() => navigate(ROUTES.IMMORTAIL)}
        >
          {/* Dog avatar */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shrink-0"
            style={{ background: colourHex ? `${colourHex}33` : 'rgba(201,168,76,0.1)' }}
          >
            <motion.span
              animate={{ rotate: [-5, 5, -5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              🐾
            </motion.span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl text-immortail-cream truncate">{dogName}</h2>
            <p className="text-immortail-soft text-sm">{profile?.breed || 'Unknown breed'}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {traits.slice(0, 3).map(t => (
                <span key={t.id} className="tag-pill">{t.emoji} {t.label}</span>
              ))}
            </div>
          </div>
          <div className="text-immortail-gold text-xl shrink-0">→</div>
        </motion.div>

        {/* Presence greeting — warm welcome message */}
        {presenceGreeting && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card-warm px-4 py-3 flex items-center gap-3 rounded-2xl"
          >
            <span className="text-xl">💛</span>
            <p className="text-sm text-immortail-cream">{presenceGreeting}</p>
          </motion.div>
        )}

        {/* Legacy protection backup reminder */}
        {showBackupReminder && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
            className="glass-card px-4 py-3 flex items-center gap-3 rounded-2xl border-immortail-gold/15"
          >
            <span className="text-base">💾</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-immortail-cream">Back up {dogName}</p>
              <p className="text-xs text-immortail-soft">Keep their memory safe — save an encrypted backup</p>
            </div>
            <button
              onClick={() => { navigate(ROUTES.SETTINGS); }}
              className="text-xs text-immortail-gold shrink-0"
            >Backup →</button>
            <button onClick={() => setShowBackupReminder(false)}
              className="text-immortail-soft/40 hover:text-immortail-soft text-xs shrink-0">✕</button>
          </motion.div>
        )}

        {/* Setup progress */}
        {setupProgress < 100 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-immortail-cream">Build their memory</p>
              <p className="text-xs text-immortail-gold">{setupProgress}%</p>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-3">
              <motion.div
                className="h-full bg-gradient-to-r from-immortail-gold to-immortail-gold-light rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${setupProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              {[
                { done: stats.photos > 0,   icon: '📷', label: 'Photos',  to: ROUTES.MEMORIES },
                { done: stats.sounds > 0,   icon: '🎵', label: 'Sounds',  to: ROUTES.SOUNDS },
                { done: stats.memories > 0, icon: '💭', label: 'Memories',to: ROUTES.TIMELINE },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.to)}
                  className={`rounded-lg p-2 transition-all ${
                    item.done
                      ? 'bg-immortail-gold/15 text-immortail-gold'
                      : 'bg-white/5 text-immortail-soft hover:bg-white/10'
                  }`}
                >
                  <div className="text-lg mb-0.5">{item.icon}</div>
                  <div>{item.done ? '✓ ' : ''}{item.label}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Quick actions */}
        <motion.section variants={stagger.container} initial="hidden" animate="show">
          <h3 className="text-immortail-soft text-xs uppercase tracking-widest mb-3 px-1">Quick Access</h3>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map(action => (
              <motion.button
                key={action.to}
                variants={stagger.item}
                onClick={() => navigate(action.to)}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  action.highlight
                    ? 'bg-immortail-gold/10 border-immortail-gold/40 hover:border-immortail-gold/60'
                    : 'glass-card hover:border-white/20'
                }`}
              >
                <div className="text-2xl mb-2">{action.icon}</div>
                <div className="font-medium text-immortail-cream text-sm">{action.label}</div>
                <div className="text-xs text-immortail-soft mt-0.5">{action.desc}</div>
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* AI status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-immortail-teal/20 flex items-center justify-center text-xl">
            🤖
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-immortail-cream">Local AI Engine</p>
            <p className="text-xs text-immortail-soft truncate">
              {hasConfig
                ? `${dogName}'s personality is loaded`
                : stats.photos > 0 || stats.sounds > 0
                  ? 'Ready to reconstruct — visit Memory space'
                  : 'Add photos & sounds to begin AI reconstruction'}
            </p>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasConfig ? 'bg-green-400' : 'bg-immortail-gold animate-pulse-soft'}`} />
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: 'Photos',   value: stats.photos,   icon: '📷' },
            { label: 'Sounds',   value: stats.sounds,   icon: '🎵' },
            { label: 'Memories', value: stats.memories, icon: '💭' },
          ].map(s => (
            <div key={s.label} className="glass-card p-3 text-center">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="font-display text-xl text-immortail-gold">{s.value}</div>
              <div className="text-xs text-immortail-soft">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </main>

      <NavBar />
    </div>
  );
}
