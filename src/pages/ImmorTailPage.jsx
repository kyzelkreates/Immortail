/**
 * Immortail™ — Main memory companion experience page
 * The virtual dog lives here. Full interactive environment.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { useAIEngine } from '../hooks/useAIEngine.js';
import { Sounds } from '../core/storage.js';
import { playBlob } from '../audio/audioEngine.js';
import { ENV_MODES, INTERACTIONS, DOG_STATES } from '../core/constants.js';
import VirtualDog           from '../virtualdog/VirtualDog.jsx';
import MemoryEnvironment    from '../environment/MemoryEnvironment.jsx';
import InteractionBar       from '../interaction/InteractionBar.jsx';
import VoiceRecallPanel     from '../interaction/VoiceRecallPanel.jsx';
import NavBar               from '../components/ui/NavBar.jsx';
import MemoryMomentCard     from '../components/ui/MemoryMomentCard.jsx';
import SavedMoments         from '../components/moments/SavedMoments.jsx';
import { useEmotionalPresence }   from '../hooks/useEmotionalPresence.js';
import { useMemoryMoments }       from '../hooks/useMemoryMoments.js';
import { usePerformanceGovernor } from '../hooks/usePerformanceGovernor.js';
import { useAmbientVoice }        from '../hooks/useAmbientVoice.js';
import { getAutoEnvMode, ROUTES }   from '../core/constants.js';
import { useNavigate }                from 'react-router-dom';
import { useCompanionRituals }        from '../hooks/useCompanionRituals.js';
import { useQuietCompanion }          from '../hooks/useQuietCompanion.js';

const ENV_CYCLE = [
  ENV_MODES.DAY, ENV_MODES.GOLDEN, ENV_MODES.SUNSET, ENV_MODES.DUSK,
  ENV_MODES.NIGHT, ENV_MODES.RAIN, ENV_MODES.FIREPLACE, ENV_MODES.SNOW,
  ENV_MODES.WOODLAND, ENV_MODES.BEACH,
];

export default function ImmorTailPage() {
  const { activeProfileId, profile, dogConfig, saveDogConfig, settings } = useApp();
  const { aiStatus, reconstructing, progress, error: aiError, config, rebuild } = useAIEngine(activeProfileId, profile);

  const [envMode, setEnvMode]         = useState(ENV_MODES.DAY);
  const [showPanel, setShowPanel]     = useState('interactions'); // 'interactions' | 'voice' | 'ai'
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [interactionLog, setInteractionLog] = useState([]);
  const soundsRef      = useRef(null);
  const prevConfigRef  = useRef(null);
  const dogNotifyRef   = useRef(null);   // { notifySoundPlayed, notifyMemoryMoment }
  useEffect(() => { prevConfigRef.current = activeConfig; }, [activeConfig]);
  const [activeInteraction, setActiveInteraction] = useState(null);

  // ── Performance governor ────────────────────────────────────────────────────
  const { quality, shouldThrottle } = usePerformanceGovernor(
    settings?.animationQuality || 'high'
  );

  // ── Emotional presence ───────────────────────────────────────────────────
  const { presenceState, greeting, isNight, suggestedEnv } = useEmotionalPresence(
    profile?.name,
    activeInteraction
  );

  // ── Memory moments ───────────────────────────────────────────────────────
  const { moment: memoryMoment, dismissMoment } = useMemoryMoments(
    activeProfileId,
    profile?.name,
    { enabled: soundEnabled }
  );

  // ── Ambient voice ────────────────────────────────────────────────────────
  const { speak } = useAmbientVoice({ enabled: soundEnabled && settings?.ambientSoundEnabled });

  // ── Set initial env from time of day (once) ───────────────────────────────
  useEffect(() => {
    setEnvMode(getAutoEnvMode());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speak greeting when presence greeting changes ────────────────────────
  useEffect(() => {
    if (greeting && soundEnabled) {
      speak('welcome-back', { name: profile?.name });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting]);

  // ── Speak memory moment ──────────────────────────────────────────────────
  useEffect(() => {
    if (memoryMoment && soundEnabled) {
      speak('memory-moment', { name: profile?.name, title: memoryMoment.title });
      dogNotifyRef.current?.notifyMemoryMoment?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryMoment?.id]);

  // Cycle environment (logs env for adaptation)
  const cycleEnv = () => {
    setEnvMode(prev => {
      const idx  = ENV_CYCLE.indexOf(prev);
      const next = ENV_CYCLE[(idx + 1) % ENV_CYCLE.length];
      logEnv(next);
      return next;
    });
  };

  // Load sounds once (lazy)
  const loadSounds = useCallback(async () => {
    if (soundsRef.current) return soundsRef.current;
    const list = await Sounds.listByProfile(activeProfileId);
    soundsRef.current = list;
    return list;
  }, [activeProfileId]);

  // Handle interaction — optionally play a matching sound
  const handleInteraction = useCallback(async (type) => {
    setActiveInteraction(type);
    // Clear active interaction after brief window
    setTimeout(() => setActiveInteraction(null), 5000);
    const entry = { type, ts: Date.now() };
    setInteractionLog(prev => [entry, ...prev.slice(0, 9)]);

    if (!soundEnabled) return;
    try {
      const list = await loadSounds();
      if (!list.length) return;

      // Pick a sound based on interaction
      let soundType = null;
      if (type === INTERACTIONS.CALL)      soundType = 'bark';
      if (type === INTERACTIONS.THROW_TOY) soundType = 'happy';
      if (type === INTERACTIONS.REWARD)    soundType = 'happy';
      if (type === INTERACTIONS.PET)       soundType = 'happy';
      if (type === INTERACTIONS.BEDTIME)   soundType = 'whine';

      const candidates = list.filter(s => s.type === soundType && s.blob);
      const sound = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : list[Math.floor(Math.random() * list.length)];

      if (sound?.blob) {
        dogNotifyRef.current?.notifySoundPlayed?.();
        await playBlob(sound.blob, { volume: 0.8 });
      }
    } catch {}
  }, [soundEnabled, loadSounds]);

  // Voice recall trigger
  const handleVoiceTrigger = useCallback(async (reaction) => {
    // Sound plays in VoiceRecallPanel — just log
    setInteractionLog(prev => [{ type: 'voice:' + reaction, ts: Date.now() }, ...prev.slice(0, 9)]);
  }, []);

  // Ritual activation
  const handleStartRitual = useCallback(async (ritualId) => {
    const ritual = await startRitual(ritualId);
    if (!ritual) return;
    if (ritual.env)      { setEnvMode(ritual.env); logEnv(ritual.env); }
    if (ritual.dogState) setActiveInteraction(ritual.dogState);
    // Bedtime ambient voice
    if (ritualId === 'bedtime') speak('bedtime', { name: profile?.name });
    // Morning greeting voice
    if (ritualId === 'morning') speak('welcome-back', { name: profile?.name });
  }, [startRitual, setEnvMode, logEnv, speak, profile]);

  // Rebuild dog AI
  const handleRebuild = useCallback(async () => {
    const result = await rebuild();
    if (result) await saveDogConfig(result);
  }, [rebuild, saveDogConfig]);

  const activeConfig = config || dogConfig;
  const dogName      = profile?.name || 'Your dog';
  const ENV_ICONS = {
    [ENV_MODES.DAY]:      '☀️',
    [ENV_MODES.DUSK]:     '🌅',
    [ENV_MODES.NIGHT]:    '🌙',
    [ENV_MODES.RAIN]:     '🌧️',
    [ENV_MODES.SUNSET]:   '🌇',
    [ENV_MODES.FIREPLACE]:'🔥',
    [ENV_MODES.SNOW]:     '❄️',
    [ENV_MODES.WOODLAND]: '🌲',
    [ENV_MODES.BEACH]:    '🏖️',
    [ENV_MODES.GOLDEN]:   '✨',
  };

  return (
    <div className="min-h-screen bg-immortail-deep flex flex-col pb-24">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-10 pb-3 safe-top">
        <div>
          <h1 className="font-display text-xl text-immortail-gold">{dogName}</h1>
          <p className="text-xs text-immortail-soft">{profile?.breed || ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(s => !s)}
            className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-sm"
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          <button
            onClick={cycleEnv}
            className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-sm"
            title="Change environment"
          >
            {ENV_ICONS[envMode]}
          </button>
        </div>
      </header>

      {/* Environment + Dog */}
      <div className="px-4 mb-4">
        <MemoryEnvironment
          mode={envMode}
          className="w-full rounded-3xl overflow-hidden"
          style={{ height: 280 }}
        >
          <div className="h-[280px] flex items-center justify-center">
            <VirtualDog
              currentEnv={envMode}
              profile={profile}
              dogConfig={activeConfig}
              onInteraction={handleInteraction}
              presenceStateOverride={activeInteraction ? undefined : presenceState}
              quality={quality}
              showIntro={!!activeConfig && !prevConfigRef.current}
              onNotifyRef={(ref) => { dogNotifyRef.current = ref; }}
              className="w-64 h-64"
              interactive={true}
            />
            {/* Presence greeting */}
            {greeting && (
              <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
                <div className="bg-immortail-deep/80 backdrop-blur-sm px-4 py-1.5 rounded-full
                               text-xs text-immortail-gold border border-immortail-gold/20 animate-fade-in">
                  {greeting}
                </div>
              </div>
            )}
          </div>
        </MemoryEnvironment>
      </div>

      {/* AI reconstruction banner */}
      {!activeConfig && !reconstructing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-5 mb-4 glass-card-warm p-4 flex items-center gap-3"
        >
          <span className="text-2xl">🤖</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-immortail-cream">Reconstruct {dogName}</p>
            <p className="text-xs text-immortail-soft">AI will build their full personality from your uploads</p>
          </div>
          <button
            onClick={handleRebuild}
            disabled={aiStatus === 'loading'}
            className="btn-primary text-xs px-3 py-2 shrink-0"
          >
            Build
          </button>
        </motion.div>
      )}

      {/* Reconstruction progress */}
      <AnimatePresence>
        {reconstructing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-5 mb-4 glass-card p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="inline-block">🤖</motion.span>
              <p className="text-sm text-immortail-cream">Reconstructing {dogName}…</p>
              <p className="text-xs text-immortail-gold ml-auto">{progress?.pct || 0}%</p>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-immortail-gold to-immortail-gold-light rounded-full"
                animate={{ width: `${progress?.pct || 0}%` }}
              />
            </div>
            <p className="text-xs text-immortail-soft capitalize">{progress?.step || '…'}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel tabs */}
      <div className="px-5 mb-3">
        <div className="flex gap-1 glass-card p-1 rounded-xl">
          {[
            { id: 'interactions', label: '🐾 Interact' },
            { id: 'rituals',      label: '🕯️ Rituals' },
            { id: 'moments',      label: '✨ Moments' },
            { id: 'quiet',        label: '😴 Quiet' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setShowPanel(tab.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                showPanel === tab.id
                  ? 'bg-immortail-gold/20 text-immortail-gold'
                  : 'text-immortail-soft hover:text-immortail-cream'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel content */}
      <div className="px-5">
        <AnimatePresence mode="wait">
          {showPanel === 'interactions' && (
            <motion.div key="interactions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <InteractionBar onInteraction={handleInteraction} />

              {/* Recent interactions */}
              {interactionLog.length > 0 && (
                <div className="mt-3 space-y-1">
                  {interactionLog.slice(0, 3).map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-immortail-soft/50">
                      <span>·</span>
                      <span className="capitalize">{entry.type.replace('_', ' ')}</span>
                      <span className="ml-auto">{new Date(entry.ts).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {showPanel === 'voice' && (
            <motion.div key="voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <VoiceRecallPanel profileId={activeProfileId} onTrigger={handleVoiceTrigger} />
            </motion.div>
          )}

          {showPanel === 'moments' && (
            <motion.div key="moments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SavedMoments
                currentEnv={envMode}
                currentDogState={presenceState}
                onLoadMoment={({ env, dogState }) => {
                  if (env)      setEnvMode(env);
                  if (dogState) setActiveInteraction(dogState);
                }}
              />
            </motion.div>
          )}

          {showPanel === 'rituals' && (
            <motion.div key="rituals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Memory Walk entry */}
              <button
                onClick={() => navigate(ROUTES.MEMORY_WALK)}
                className="w-full glass-card-warm border border-immortail-gold/20 rounded-2xl p-4 flex items-center gap-3"
              >
                <span className="text-2xl">🐾</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-immortail-cream">Memory Walk</p>
                  <p className="text-xs text-immortail-soft">Wander through their memories together</p>
                </div>
                <span className="text-immortail-gold/60 text-sm">→</span>
              </button>

              {/* Suggested ritual */}
              {suggestedRitual && (
                <div className="glass-card border border-immortail-gold/15 rounded-2xl p-3">
                  <p className="text-[10px] text-immortail-gold/60 uppercase tracking-widest mb-2">Suggested now</p>
                  <button
                    onClick={() => handleStartRitual(suggestedRitual.id)}
                    className="w-full flex items-center gap-3"
                  >
                    <span className="text-2xl">{suggestedRitual.emoji}</span>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-immortail-cream">{suggestedRitual.label}</p>
                      <p className="text-xs text-immortail-soft">Tap to begin</p>
                    </div>
                    {activeRitual?.id === suggestedRitual.id && (
                      <span className="text-[10px] text-immortail-gold border border-immortail-gold/30 rounded-full px-2 py-0.5">Active</span>
                    )}
                  </button>
                </div>
              )}

              {/* All rituals */}
              <div className="grid grid-cols-2 gap-2">
                {rituals.map(r => (
                  <button
                    key={r.id}
                    onClick={() => activeRitual?.id === r.id ? stopRitual() : handleStartRitual(r.id)}
                    className={`glass-card rounded-2xl p-3 text-left transition-all ${
                      activeRitual?.id === r.id
                        ? 'border border-immortail-gold/40 bg-immortail-gold/8'
                        : 'border border-white/8 hover:border-white/15'
                    }`}
                  >
                    <div className="text-xl mb-1">{r.emoji}</div>
                    <p className="text-xs font-medium text-immortail-cream leading-tight">{r.label}</p>
                    {r.usageCount > 0 && (
                      <p className="text-[10px] text-immortail-soft/40 mt-0.5">{r.usageCount}×</p>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {showPanel === 'quiet' && (
            <motion.div key="quiet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="glass-card rounded-2xl p-5 text-center space-y-4">
                <motion.div
                  animate={quietMode ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-5xl"
                >
                  {quietMode ? '😴' : '🌙'}
                </motion.div>
                <div>
                  <p className="text-sm font-medium text-immortail-cream">
                    {quietMode ? 'Quiet Companion Mode' : 'Enter Quiet Mode'}
                  </p>
                  <p className="text-xs text-immortail-soft/70 mt-1 leading-relaxed">
                    {quietMode
                      ? `Resting peacefully${quietDurationLabel ? ` · ${quietDurationLabel}` : ''}. No prompts. Just presence.`
                      : `${profile?.name || 'Your companion'} will rest quietly. No interactions, no prompts — just comfort.`
                    }
                  </p>
                </div>
                <button
                  onClick={quietMode ? deactivateQuiet : activateQuiet}
                  className={`w-full py-3 rounded-2xl text-sm font-medium transition-all ${
                    quietMode
                      ? 'bg-white/8 text-immortail-soft hover:bg-white/12'
                      : 'btn-primary'
                  }`}
                >
                  {quietMode ? 'Wake them up' : 'Rest quietly'}
                </button>
              </div>

              {/* Quiet mode tips */}
              <div className="glass-card rounded-2xl p-4 space-y-2">
                <p className="text-[10px] text-immortail-soft/50 uppercase tracking-widest">In quiet mode</p>
                {[
                  'No interaction prompts',
                  'Gentle breathing animation',
                  'Calm ambient environment',
                  'Memory moments paused',
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-immortail-soft/70">
                    <span className="w-1 h-1 rounded-full bg-immortail-gold/40 shrink-0" />
                    {tip}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {showPanel === 'ai' && (
            <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤖</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-immortail-cream">AI Status</p>
                    <p className="text-xs text-immortail-soft capitalize">{aiStatus}</p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    aiStatus === 'ready' ? 'bg-green-400' :
                    aiStatus === 'loading' ? 'bg-yellow-400 animate-pulse' :
                    'bg-red-400'
                  }`} />
                </div>

                {activeConfig && (
                  <div className="space-y-2 text-xs">
                    <div className="divider-gold" />
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['Tail Wag',     activeConfig.personality?.tailWagSpeed],
                        ['Excitement',   activeConfig.personality?.excitementFreq],
                        ['Bark Type',    activeConfig.sound?.barkType?.replace('_',' ')],
                        ['Tone',         activeConfig.sound?.emotionalTone],
                      ].filter(([,v]) => v).map(([k,v]) => (
                        <div key={k} className="bg-white/5 rounded-lg p-2">
                          <p className="text-immortail-soft/60">{k}</p>
                          <p className="text-immortail-cream capitalize">{v}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-immortail-soft/40 text-center">
                      Built {activeConfig.generatedAt ? new Date(activeConfig.generatedAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleRebuild}
                  disabled={reconstructing || aiStatus === 'loading'}
                  className="btn-ghost w-full text-sm py-2.5 disabled:opacity-40"
                >
                  {reconstructing ? '⏳ Rebuilding…' : '🔄 Rebuild Personality'}
                </button>
              </div>

              {aiError && (
                <p className="text-red-400 text-xs px-1">{aiError}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Memory moment overlay */}
      <MemoryMomentCard
        moment={memoryMoment}
        onDismiss={dismissMoment}
        soundEnabled={soundEnabled}
      />

      <NavBar />
    </div>
  );
}
