/**
 * Immortail™ — Settings + Admin + Diagnostics
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import {
  StorageDiagnostics, ProfileIO, AppSettings,
  AICache, AIModels, Profiles, ActiveProfile
} from '../core/storage.js';
import { isProviderAvailable, listModels, resetOllamaCache } from '../services/ollamaClient.js';
import { useAIEngine } from '../hooks/useAIEngine.js';
import { IS_PROD, ROUTES } from '../core/constants.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import NavBar        from '../components/ui/NavBar.jsx';
import { BackupEngine } from '../migration/BackupEngine.js';

// ─── AI provider definitions ─────────────────────────────────────────────────
const AI_PROVIDERS = [
  {
    id:     'offline',
    emoji:  '🔒',
    label:  'Offline',
    desc:   'Built-in rule engine. No install needed.',
    port:   null,
    url:    null,
    about:  "Always works — no internet, no local server. Immortail's built-in companion engine handles all responses.",
    models: null,
  },
  {
    id:     'ollama',
    emoji:  '🦙',
    label:  'Ollama',
    desc:   'Run llama3, Mistral, Gemma, Phi locally.',
    port:   'localhost:11434',
    url:    'https://ollama.com',
    about:  'The most popular local AI runner. Supports hundreds of open-source models. Simple one-command install on Mac, Windows, and Linux.',
    models: 'llama3, mistral, gemma:2b, phi3, codellama',
  },
  {
    id:     'lmstudio',
    emoji:  '🎛️',
    label:  'LM Studio',
    desc:   'GUI app for running any GGUF model.',
    port:   'localhost:1234/v1',
    url:    'https://lmstudio.ai',
    about:  'Desktop app with a model browser and built-in OpenAI-compatible server. Great for beginners — no command line needed.',
    models: 'Mistral 7B, Llama 3, Phi-3, Qwen2',
  },
  {
    id:     'gpt4all',
    emoji:  '🧠',
    label:  'GPT4All',
    desc:   'Privacy-focused local AI from Nomic.',
    port:   'localhost:4891/v1',
    url:    'https://gpt4all.io',
    about:  'Open-source, runs fully offline. Built for privacy. Includes a nice desktop chat UI and an OpenAI-compatible local server.',
    models: 'Mistral, Llama 3, Falcon, MPT',
  },
  {
    id:     'jan',
    emoji:  '🌙',
    label:  'Jan',
    desc:   'Open-source ChatGPT alternative.',
    port:   'localhost:1337/v1',
    url:    'https://jan.ai',
    about:  'Beautiful, fully offline AI assistant. Runs models locally via an OpenAI-compatible API. Great UX, strong privacy focus.',
    models: 'Mistral 7B, Llama 3, Gemma, TinyLlama',
  },
  {
    id:     'openwebui',
    emoji:  '🌐',
    label:  'Open WebUI',
    desc:   'Web front-end for Ollama models.',
    port:   'localhost:3000',
    url:    'https://openwebui.com',
    about:  'A powerful self-hosted web UI that runs on top of Ollama. If you already have Open WebUI running, point Immortail at it.',
    models: 'All Ollama-compatible models',
  },
  {
    id:     'custom',
    emoji:  '⚙️',
    label:  'Custom',
    desc:   'Any OpenAI-compatible endpoint.',
    port:   'your-url/v1',
    url:    null,
    about:  'Connect any OpenAI-compatible API. Enter your server URL and an optional bearer token. Works with self-hosted or remote servers.',
    models: null,
  },
];

export default function SettingsPage({ onOpenRestore }) {
  const navigate                    = useNavigate();
  const { activeProfileId, profile, settings, updateSettings,
          deactivateProfile, refreshProfile } = useApp();
  const { aiStatus, clearCache, rebuild } = useAIEngine(activeProfileId, profile);

  const [stats, setStats]         = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting]     = useState(false);
  const [backingUp, setBackingUp]     = useState(false);
  const [backupDone, setBackupDone]   = useState(false);
  const [confirm, setConfirm]     = useState(null); // confirm dialog type
  const [section, setSection]     = useState('general'); // 'general' | 'ai' | 'comfort' | 'diagnostics' | 'danger'

  // ── AI provider state ─────────────────────────────────────────────────────
  const [aiProbeStatus,  setAiProbeStatus]  = useState('idle'); // 'idle' | 'checking' | 'ok' | 'fail'
  const [detectedModels, setDetectedModels] = useState([]);
  const [aiProbeMsg,     setAiProbeMsg]     = useState('');

  const loadStats = useCallback(async () => {
    if (!activeProfileId) return;
    const s = await StorageDiagnostics.getStats(activeProfileId);
    setStats(s);
  }, [activeProfileId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ─── AI provider test ────────────────────────────────────────────────────────
  const handleTestProvider = useCallback(async () => {
    setAiProbeStatus('checking');
    setDetectedModels([]);
    setAiProbeMsg('');
    resetOllamaCache(); // force fresh ping

    const { available, latencyMs, provider } = await isProviderAvailable();
    if (available) {
      const models = await listModels();
      setAiProbeStatus('ok');
      setDetectedModels(models);
      setAiProbeMsg(
        models.length > 0
          ? `${provider} connected · ${latencyMs}ms · ${models.length} model${models.length !== 1 ? 's' : ''} found`
          : `${provider} connected · ${latencyMs}ms · no models detected yet`,
      );
    } else {
      setAiProbeStatus('fail');
      setAiProbeMsg('Could not connect — is the AI runtime running?');
    }
  }, []);

  // ─── Export profile ────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await ProfileIO.exportProfile(activeProfileId);
      const json = JSON.stringify(data, (key, val) => {
        // Blobs can't JSON — skip raw binary in export
        if (val instanceof Blob) return undefined;
        return val;
      }, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `immortail-${profile?.name || 'profile'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // ─── Encrypted backup ────────────────────────────────────────────────────────
  const handleBackup = async () => {
    setBackingUp(true);
    setBackupDone(false);
    try {
      const blob = await BackupEngine.createBackup(activeProfileId);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${profile?.name || 'immortail'}-${new Date().toISOString().slice(0,10)}.immortailbackup`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupDone(true);
      setTimeout(() => setBackupDone(false), 4000);
    } catch (e) {
      alert('Backup failed: ' + e.message);
    } finally {
      setBackingUp(false);
    }
  };

  // ─── Import ────────────────────────────────────────────────────────────────
  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const p    = await ProfileIO.importProfile(data);
      await refreshProfile();
      alert(`✓ Imported ${p.name}'s profile.`);
    } catch (e) {
      alert('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  // ─── Danger actions ────────────────────────────────────────────────────────
  const handleClearAI = async () => {
    await clearCache();
    setConfirm(null);
    alert('AI cache cleared.');
  };

  const handleDeleteProfile = async () => {
    await Profiles.delete(activeProfileId);
    ActiveProfile.clear();
    deactivateProfile();
    navigate(ROUTES.HOME, { replace: true });
  };

  const handleClearAll = async () => {
    await StorageDiagnostics.clearAll();
    deactivateProfile();
    navigate(ROUTES.HOME, { replace: true });
  };

  const fmtSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const SECTIONS = [
    { id: 'general',     label: '⚙️ General'    },
    { id: 'ai',          label: '🤖 AI'          },
    { id: 'comfort',     label: '🕊️ Comfort'    },
    { id: 'diagnostics', label: '📊 Diagnostics' },
    { id: 'danger',      label: '⚠️ Data'        },
  ];

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">
      <PageHeader title="Settings" subtitle={profile?.name ? `${profile.name}'s profile` : undefined} />

      <div className="px-5 space-y-4">
        {/* Section tabs */}
        <div className="flex gap-1 glass-card p-1 rounded-xl">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                section === s.id
                  ? 'bg-immortail-gold/20 text-immortail-gold'
                  : 'text-immortail-soft hover:text-immortail-cream'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── General ── */}
          {section === 'general' && (
            <motion.div key="general" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Theme */}
              <SettingRow label="Theme" desc="Visual appearance">
                <div className="flex gap-1">
                  {['dark', 'light'].map(t => (
                    <button
                      key={t}
                      onClick={() => updateSettings({ theme: t })}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all capitalize ${
                        settings.theme === t
                          ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                          : 'border-white/10 text-immortail-soft'
                      }`}
                    >
                      {t === 'dark' ? '🌙' : '☀️'} {t}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Sound */}
              <SettingRow label="Sound" desc="Enable audio playback">
                <Toggle
                  value={settings.soundEnabled}
                  onChange={v => updateSettings({ soundEnabled: v })}
                />
              </SettingRow>

              {/* Ambient */}
              <SettingRow label="Ambient sound" desc="Background environment sounds">
                <Toggle
                  value={settings.ambientSoundEnabled}
                  onChange={v => updateSettings({ ambientSoundEnabled: v })}
                />
              </SettingRow>

              {/* Animation quality */}
              <SettingRow label="Animation quality" desc="Reduces battery usage on low">
                <div className="flex gap-1">
                  {['low', 'medium', 'high'].map(q => (
                    <button
                      key={q}
                      onClick={() => updateSettings({ animationQuality: q })}
                      className={`px-2 py-1.5 rounded-lg text-xs border transition-all capitalize ${
                        settings.animationQuality === q
                          ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                          : 'border-white/10 text-immortail-soft'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Demo mode (dev only) */}
              {!IS_PROD && (
                <SettingRow label="Demo mode" desc="[Dev only] Enable mock data">
                  <Toggle
                    value={settings.enableDemoMode}
                    onChange={v => updateSettings({ enableDemoMode: v })}
                  />
                </SettingRow>
              )}

              {/* Backup & Restore */}
              <div className="divider-gold" />
              <div className="space-y-2">
                {/* Encrypted backup — primary */}
                <button
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="btn-ghost w-full text-sm py-3 flex items-center justify-center gap-2"
                >
                  {backingUp ? '⏳ Creating backup…' : backupDone ? '✅ Backup saved!' : '💾 Save encrypted backup'}
                </button>
                {/* Restore wizard */}
                {onOpenRestore && (
                  <button
                    onClick={onOpenRestore}
                    className="btn-ghost w-full text-sm py-3 flex items-center justify-center gap-2"
                  >
                    📦 Restore from backup
                  </button>
                )}
                {/* Legacy JSON export (kept for compatibility) */}
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="btn-ghost w-full text-xs py-2 opacity-60"
                >
                  {exporting ? '⏳ Exporting…' : '⬇ Export raw JSON (legacy)'}
                </button>
                <label className="block cursor-pointer">
                  <span className="btn-ghost w-full text-xs py-2 flex items-center justify-center gap-2 opacity-60">
                    {importing ? '⏳ Importing…' : '⬆ Import raw JSON (legacy)'}
                  </span>
                  <input
                    type="file"
                    accept=".json,.immortailbackup,application/octet-stream"
                    className="hidden"
                    onChange={e => handleImport(e.target.files?.[0])}
                  />
                </label>
              </div>
            </motion.div>
          )}

          {/* ── AI Agents ── */}
          {section === 'ai' && (
            <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">

              {/* Header card */}
              <div className="glass-card-warm p-4 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🤖</span>
                  <div>
                    <p className="text-sm font-medium text-immortail-cream">AI Agents</p>
                    <p className="text-xs text-immortail-soft">Choose your local AI runtime</p>
                  </div>
                </div>
                <p className="text-xs text-immortail-soft/70 leading-relaxed">
                  Immortail works offline with its built-in rule engine. Connect a local AI runtime
                  below for richer, more personalised responses. All processing stays on your device.
                </p>
              </div>

              {/* Provider selector */}
              <div className="glass-card p-4 rounded-2xl space-y-3">
                <p className="text-xs font-medium text-immortail-gold uppercase tracking-wider">Provider</p>
                <div className="grid grid-cols-2 gap-2">
                  {AI_PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { updateSettings({ aiProvider: p.id }); setAiProbeStatus('idle'); setDetectedModels([]); }}
                      className={`rounded-xl p-3 text-left border transition-all ${
                        settings.aiProvider === p.id
                          ? 'border-immortail-gold/60 bg-immortail-gold/10'
                          : 'border-white/8 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{p.emoji}</span>
                        <span className={`text-xs font-semibold ${settings.aiProvider === p.id ? 'text-immortail-gold' : 'text-immortail-cream'}`}>{p.label}</span>
                      </div>
                      <p className="text-[10px] text-immortail-soft/60 leading-tight">{p.desc}</p>
                      {p.port && <p className="text-[9px] text-immortail-soft/40 mt-1 font-mono">{p.port}</p>}
                    </button>
                  ))}
                </div>
              </div>

              {/* URL config (only for non-offline providers) */}
              {settings.aiProvider !== 'offline' && (
                <div className="glass-card p-4 rounded-2xl space-y-3">
                  <p className="text-xs font-medium text-immortail-gold uppercase tracking-wider">Connection</p>

                  {/* URL input */}
                  <div className="space-y-1">
                    <label className="text-xs text-immortail-soft">Server URL</label>
                    <input
                      type="text"
                      value={
                        settings.aiProvider === 'ollama'    ? settings.ollamaUrl    :
                        settings.aiProvider === 'lmstudio'  ? settings.lmstudioUrl  :
                        settings.aiProvider === 'gpt4all'   ? settings.gpt4allUrl   :
                        settings.aiProvider === 'jan'       ? settings.janUrl        :
                        settings.aiProvider === 'openwebui' ? settings.openwebuiUrl :
                        settings.customAiUrl
                      }
                      onChange={e => {
                        const field =
                          settings.aiProvider === 'ollama'    ? 'ollamaUrl'    :
                          settings.aiProvider === 'lmstudio'  ? 'lmstudioUrl'  :
                          settings.aiProvider === 'gpt4all'   ? 'gpt4allUrl'   :
                          settings.aiProvider === 'jan'       ? 'janUrl'        :
                          settings.aiProvider === 'openwebui' ? 'openwebuiUrl' :
                          'customAiUrl';
                        updateSettings({ [field]: e.target.value });
                        setAiProbeStatus('idle');
                        setDetectedModels([]);
                      }}
                      placeholder="http://localhost:11434"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-immortail-cream focus:outline-none focus:border-immortail-gold/40"
                      spellCheck={false}
                    />
                  </div>

                  {/* Custom API key (custom provider only) */}
                  {settings.aiProvider === 'custom' && (
                    <div className="space-y-1">
                      <label className="text-xs text-immortail-soft">API Key <span className="opacity-40">(optional)</span></label>
                      <input
                        type="password"
                        value={settings.customAiKey || ''}
                        onChange={e => updateSettings({ customAiKey: e.target.value })}
                        placeholder="Bearer token or API key"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-immortail-cream focus:outline-none focus:border-immortail-gold/40"
                        autoComplete="off"
                      />
                    </div>
                  )}

                  {/* Model selection */}
                  <div className="space-y-1">
                    <label className="text-xs text-immortail-soft">
                      Model
                      <span className="ml-1 opacity-40">(leave blank to use provider default)</span>
                    </label>
                    {detectedModels.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {detectedModels.map(m => (
                          <button
                            key={m}
                            onClick={() => updateSettings({ aiModel: settings.aiModel === m ? '' : m })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition-all ${
                              settings.aiModel === m
                                ? 'border-immortail-gold/60 bg-immortail-gold/15 text-immortail-gold'
                                : 'border-white/10 text-immortail-soft hover:border-white/25'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={settings.aiModel || ''}
                        onChange={e => updateSettings({ aiModel: e.target.value })}
                        placeholder={
                          settings.aiProvider === 'ollama'   ? 'e.g. llama3, mistral, gemma:2b' :
                          settings.aiProvider === 'lmstudio' ? 'e.g. mistral-7b-instruct-v0.2'  :
                          settings.aiProvider === 'gpt4all'  ? 'e.g. mistral-7b-instruct'        :
                          settings.aiProvider === 'jan'      ? 'e.g. mistral-ins-7b-q4'          :
                          'model name'
                        }
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-immortail-cream focus:outline-none focus:border-immortail-gold/40"
                      />
                    )}
                  </div>

                  {/* Test button */}
                  <button
                    onClick={handleTestProvider}
                    disabled={aiProbeStatus === 'checking'}
                    className={`w-full py-2.5 rounded-xl text-xs font-medium border transition-all ${
                      aiProbeStatus === 'ok'
                        ? 'border-green-500/40 bg-green-500/10 text-green-300'
                        : aiProbeStatus === 'fail'
                        ? 'border-red-500/40 bg-red-500/10 text-red-300'
                        : 'border-immortail-gold/30 bg-immortail-gold/8 text-immortail-gold hover:bg-immortail-gold/15'
                    }`}
                  >
                    {aiProbeStatus === 'checking' ? '⏳ Checking connection…' :
                     aiProbeStatus === 'ok'       ? `✓ Connected` :
                     aiProbeStatus === 'fail'      ? '✗ Could not connect — tap to retry' :
                     '🔌 Test connection'}
                  </button>

                  {/* Status message */}
                  {aiProbeMsg ? (
                    <p className={`text-[10px] text-center ${aiProbeStatus === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                      {aiProbeMsg}
                    </p>
                  ) : null}
                </div>
              )}

              {/* Provider info cards */}
              <div className="glass-card p-4 rounded-2xl space-y-3">
                <p className="text-xs font-medium text-immortail-gold uppercase tracking-wider">About open-source AI</p>
                {AI_PROVIDERS.filter(p => p.id !== 'offline').map(p => (
                  <div key={p.id} className="flex gap-3 items-start">
                    <span className="text-lg mt-0.5 flex-shrink-0">{p.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-immortail-cream">{p.label}</span>
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] text-immortail-gold/50 hover:text-immortail-gold">
                            ↗ install
                          </a>
                        )}
                      </div>
                      <p className="text-[10px] text-immortail-soft/60 leading-relaxed">{p.about}</p>
                      {p.models && <p className="text-[9px] text-immortail-soft/40 mt-0.5">Popular models: {p.models}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Current active provider indicator */}
              <div className="glass-card p-3 rounded-xl flex items-center justify-between">
                <span className="text-xs text-immortail-soft">Active provider</span>
                <span className="text-xs font-medium text-immortail-gold">
                  {AI_PROVIDERS.find(p => p.id === settings.aiProvider)?.label || 'Offline'}
                </span>
              </div>

            </motion.div>
          )}

          {/* ── Comfort Mode ── */}
          {section === 'comfort' && (
            <motion.div key="comfort" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="glass-card-warm p-4 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🕊️</span>
                  <div>
                    <p className="text-sm font-medium text-immortail-cream">Comfort Mode</p>
                    <p className="text-xs text-immortail-soft">A gentler, calmer experience</p>
                  </div>
                </div>
                <p className="text-xs text-immortail-soft leading-relaxed">
                  Comfort Mode softens wording, reduces emotional intensity, and creates a more peaceful space.
                  Designed for sensitive moments when you just want to be present.
                </p>
              </div>

              <SettingRow label="Comfort Mode" desc="Softer wording and calmer experience">
                <Toggle
                  value={settings.comfortMode || false}
                  onChange={v => updateSettings({ comfortMode: v })}
                />
              </SettingRow>

              <SettingRow label="Reduced animations" desc="Calmer, slower movements">
                <Toggle
                  value={settings.reducedAnimations || false}
                  onChange={v => updateSettings({ reducedAnimations: v, animationQuality: v ? 'low' : 'high' })}
                />
              </SettingRow>

              <SettingRow label="Memory moments" desc="Gently surface old memories while visiting">
                <Toggle
                  value={settings.memoryMomentsEnabled !== false}
                  onChange={v => updateSettings({ memoryMomentsEnabled: v })}
                />
              </SettingRow>

              <SettingRow label="Ambient voice" desc="Calm narration during emotional transitions">
                <Toggle
                  value={settings.ambientSoundEnabled || false}
                  onChange={v => updateSettings({ ambientSoundEnabled: v })}
                />
              </SettingRow>

              <SettingRow label="Peaceful ambience" desc="Auto-match environment to time of day">
                <Toggle
                  value={settings.autoEnv !== false}
                  onChange={v => updateSettings({ autoEnv: v })}
                />
              </SettingRow>
            </motion.div>
          )}

          {/* ── Diagnostics ── */}
          {section === 'diagnostics' && (
            <motion.div key="diagnostics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* AI status */}
              <div className="glass-card p-4">
                <h3 className="text-sm font-medium text-immortail-cream mb-3">🤖 AI Engine</h3>
                <div className="space-y-2 text-sm">
                  <StatusRow label="Status" value={aiStatus} color={aiStatus === 'ready' ? 'text-green-400' : aiStatus === 'loading' ? 'text-yellow-400' : 'text-red-400'} />
                </div>
                <button onClick={() => { clearCache(); rebuild(); }} className="btn-ghost w-full text-xs py-2 mt-3">
                  🔄 Clear AI Cache + Rebuild
                </button>
              </div>

              {/* Storage stats */}
              {stats && (
                <div className="glass-card p-4 space-y-3">
                  <h3 className="text-sm font-medium text-immortail-cream">💾 Storage</h3>
                  <div className="space-y-1.5 text-sm">
                    <StatusRow label="Photos"    value={`${stats.counts.photos} files · ${fmtSize(stats.sizes.photos)}`} />
                    <StatusRow label="Sounds"    value={`${stats.counts.sounds} files · ${fmtSize(stats.sizes.sounds)}`} />
                    <StatusRow label="Memories"  value={`${stats.counts.memories} entries`} />
                    <StatusRow label="Total used" value={fmtSize(stats.sizes.total)} />
                    {stats.quota && (
                      <StatusRow label="Device quota" value={`${fmtSize(stats.quota.usage)} / ${fmtSize(stats.quota.quota)}`} />
                    )}
                  </div>
                  <button onClick={loadStats} className="btn-ghost w-full text-xs py-2">↻ Refresh</button>
                </div>
              )}

              {/* PWA / SW */}
              <div className="glass-card p-4 space-y-2">
                <h3 className="text-sm font-medium text-immortail-cream">📱 PWA</h3>
                <StatusRow label="Offline" value={typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Supported' : 'Not supported'} />
                <StatusRow label="Install" value={typeof window !== 'undefined' ? 'Available' : '—'} />
                <button
                  onClick={() => {
                    if (navigator.serviceWorker?.controller) {
                      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                      alert('Cache cleared.');
                    }
                  }}
                  className="btn-ghost w-full text-xs py-2 mt-1"
                >
                  🗑 Clear Service Worker Cache
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Danger zone ── */}
          {section === 'danger' && (
            <motion.div key="danger" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="glass-card border-red-900/30 p-4 space-y-3">
                <h3 className="text-sm font-medium text-red-300">⚠️ Danger Zone</h3>
                <p className="text-xs text-immortail-soft">These actions are irreversible. Proceed carefully.</p>

                <div className="space-y-2">
                  <button
                    onClick={() => setConfirm('clearAI')}
                    className="btn-ghost w-full text-sm py-3 border-yellow-900/50 text-yellow-300"
                  >
                    🤖 Clear AI Cache
                  </button>
                  <button
                    onClick={() => setConfirm('deleteProfile')}
                    className="btn-danger w-full text-sm py-3"
                  >
                    🐾 Delete This Dog Profile
                  </button>
                  <button
                    onClick={() => setConfirm('clearAll')}
                    className="btn-danger w-full text-sm py-3 bg-red-950/60 border-red-800/60"
                  >
                    💣 Clear Everything
                  </button>
                </div>
              </div>

              <p className="text-center text-xs text-immortail-soft/30">
                Immortail™ v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
              </p>
              <p className="text-center text-xs text-immortail-soft/20">
                All data lives on your device only.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            type={confirm}
            onConfirm={() => {
              if (confirm === 'clearAI')        handleClearAI();
              if (confirm === 'deleteProfile')  handleDeleteProfile();
              if (confirm === 'clearAll')       handleClearAll();
            }}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>

      <NavBar />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SettingRow({ label, desc, children }) {
  return (
    <div className="glass-card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-immortail-cream">{label}</p>
        {desc && <p className="text-xs text-immortail-soft mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${value ? 'bg-immortail-gold' : 'bg-white/20'}`}
    >
      <motion.div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
        animate={{ left: value ? '24px' : '2px' }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      />
    </button>
  );
}

function StatusRow({ label, value, color = 'text-immortail-cream' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-immortail-soft text-xs">{label}</span>
      <span className={`text-xs ${color}`}>{value}</span>
    </div>
  );
}

function ConfirmDialog({ type, onConfirm, onCancel }) {
  const messages = {
    clearAI:       { title: 'Clear AI Cache?',       body: 'Your AI personality model will be reset. You can rebuild it anytime.', btn: 'Clear Cache', color: 'text-yellow-300' },
    deleteProfile: { title: 'Delete This Profile?',  body: 'All photos, sounds, and memories for this dog will be permanently deleted.', btn: 'Delete', color: 'text-red-300' },
    clearAll:      { title: 'Delete Everything?',    body: 'ALL profiles, memories, photos, and sounds will be permanently deleted. This cannot be undone.', btn: 'Delete Everything', color: 'text-red-300' },
  };
  const msg = messages[type];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="glass-card w-full max-w-sm p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className={`font-display text-lg ${msg.color}`}>{msg.title}</h3>
        <p className="text-immortail-soft text-sm leading-relaxed">{msg.body}</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="btn-danger flex-1 py-3">{msg.btn}</button>
          <button onClick={onCancel}  className="btn-ghost flex-1 py-3">Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
