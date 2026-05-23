/**
 * Immortail™ Core Storage — SINGLE SOURCE OF TRUTH
 * All app state, media, and config flows through here.
 * Uses IndexedDB for media/models, localStorage for metadata/settings.
 */

import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';

// ─── DB Config ────────────────────────────────────────────────────────────────
const DB_NAME    = 'immortail-db';
const DB_VERSION = 4;

const STORES = {
  PHOTOS:      'photos',
  SOUNDS:      'sounds',
  MEMORIES:    'memories',
  PROFILES:    'profiles',
  AI_MODELS:   'ai_models',
  AI_CACHE:    'ai_cache',
  DOG_CONFIG:  'dog_config',
  VOICE_CMDS:  'voice_commands',
  TIMELINE:    'timeline',
  SETTINGS:    'settings',
  VIDEOS:      'videos',          // v2
  ADAPTATION:  'adaptation',     // v2 — companion learning
  AI_REGISTRY: 'ai_registry',   // v3 — AI module boot registry
  AI_JOBS:     'ai_jobs',       // v4 — agent orchestrator job queue
};

// ─── LS Keys ──────────────────────────────────────────────────────────────────
const LS = {
  ACTIVE_PROFILE:  'immortail:activeProfile',
  APP_SETTINGS:    'immortail:settings',
  INSTALL_PROMPT:  'immortail:installDismissed',
  ONBOARDING_DONE: 'immortail:onboardingDone',
  LAST_SESSION:    'immortail:lastSession',
  THEME:           'immortail:theme',
};

// ─── DB initialisation ────────────────────────────────────────────────────────
let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Photos
      if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
        const s = db.createObjectStore(STORES.PHOTOS, { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
        s.createIndex('createdAt', 'createdAt');
      }
      // Sounds
      if (!db.objectStoreNames.contains(STORES.SOUNDS)) {
        const s = db.createObjectStore(STORES.SOUNDS, { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
        s.createIndex('type', 'type');
      }
      // Memories (written)
      if (!db.objectStoreNames.contains(STORES.MEMORIES)) {
        const s = db.createObjectStore(STORES.MEMORIES, { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
        s.createIndex('date', 'date');
      }
      // Dog profiles
      if (!db.objectStoreNames.contains(STORES.PROFILES)) {
        db.createObjectStore(STORES.PROFILES, { keyPath: 'id' });
      }
      // AI model blobs
      if (!db.objectStoreNames.contains(STORES.AI_MODELS)) {
        db.createObjectStore(STORES.AI_MODELS, { keyPath: 'name' });
      }
      // AI analysis cache
      if (!db.objectStoreNames.contains(STORES.AI_CACHE)) {
        const s = db.createObjectStore(STORES.AI_CACHE, { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
      }
      // Dog config (generated)
      if (!db.objectStoreNames.contains(STORES.DOG_CONFIG)) {
        db.createObjectStore(STORES.DOG_CONFIG, { keyPath: 'profileId' });
      }
      // Voice commands
      if (!db.objectStoreNames.contains(STORES.VOICE_CMDS)) {
        const s = db.createObjectStore(STORES.VOICE_CMDS, { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
      }
      // Timeline events
      if (!db.objectStoreNames.contains(STORES.TIMELINE)) {
        const s = db.createObjectStore(STORES.TIMELINE, { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
        s.createIndex('date', 'date');
      }
      // Settings
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      // ── v2 stores ─────────────────────────────────────────────────────────
      // Videos (memory video uploads)
      if (!db.objectStoreNames.contains(STORES.VIDEOS)) {
        const v = db.createObjectStore(STORES.VIDEOS, { keyPath: 'id' });
        v.createIndex('profileId', 'profileId');
        v.createIndex('createdAt', 'createdAt');
      }
      // Companion adaptation (ritual history, spot preferences)
      if (!db.objectStoreNames.contains(STORES.ADAPTATION)) {
        db.createObjectStore(STORES.ADAPTATION, { keyPath: 'profileId' });
      }
      // ── v3 stores ─────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORES.AI_REGISTRY)) {
        db.createObjectStore(STORES.AI_REGISTRY, { keyPath: 'key' });
      }
      // ── v4 stores ─────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains(STORES.AI_JOBS)) {
        const j = db.createObjectStore(STORES.AI_JOBS, { keyPath: 'id' });
        j.createIndex('profileId',  'profileId');
        j.createIndex('agent',      'agent');
        j.createIndex('status',     'status');
        j.createIndex('createdAt',  'createdAt');
      }
    }
  });
  return _db;
}

// ─── Generic helpers ──────────────────────────────────────────────────────────
async function dbGet(store, key) {
  const db = await getDB();
  return db.get(store, key);
}
async function dbPut(store, value) {
  const db = await getDB();
  return db.put(store, value);
}
async function dbDelete(store, key) {
  const db = await getDB();
  return db.delete(store, key);
}
async function dbGetAllByIndex(store, indexName, value) {
  const db = await getDB();
  return db.getAllFromIndex(store, indexName, value);
}
async function dbGetAll(store) {
  const db = await getDB();
  return db.getAll(store);
}
async function dbClear(store) {
  const db = await getDB();
  return db.clear(store);
}

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const Profiles = {
  async create(data) {
    const profile = { id: uuidv4(), createdAt: Date.now(), updatedAt: Date.now(), ...data };
    await dbPut(STORES.PROFILES, profile);
    return profile;
  },
  async update(id, data) {
    const existing = await dbGet(STORES.PROFILES, id);
    if (!existing) throw new Error('Profile not found');
    const updated = { ...existing, ...data, id, updatedAt: Date.now() };
    await dbPut(STORES.PROFILES, updated);
    return updated;
  },
  async get(id) { return dbGet(STORES.PROFILES, id); },
  async list() { return dbGetAll(STORES.PROFILES); },
  async delete(id) {
    await dbDelete(STORES.PROFILES, id);
    // Cascade delete all profile data
    await Photos.deleteByProfile(id);
    await Sounds.deleteByProfile(id);
    await Videos.deleteByProfile(id);
    await MemoryEntries.deleteByProfile(id);
    await DogConfig.delete(id);
    await VoiceCommands.deleteByProfile(id);
    await Timeline.deleteByProfile(id);
    await AICache.deleteByProfile(id);
    await CompanionAdaptation.delete(id);
  }
};

// ─── Active profile ───────────────────────────────────────────────────────────
export const ActiveProfile = {
  get() { return localStorage.getItem(LS.ACTIVE_PROFILE); },
  set(id) { localStorage.setItem(LS.ACTIVE_PROFILE, id); },
  clear() { localStorage.removeItem(LS.ACTIVE_PROFILE); }
};

// ─── Photos ───────────────────────────────────────────────────────────────────
export const Photos = {
  async add(profileId, { file, blob, thumbnail, metadata = {} }) {
    const id = uuidv4();
    const record = {
      id, profileId,
      blob,           // compressed image blob
      thumbnail,      // small thumbnail blob
      metadata: { name: file?.name, type: file?.type, size: file?.size, ...metadata },
      createdAt: Date.now(),
      analysed: false,
      analysisResult: null
    };
    await dbPut(STORES.PHOTOS, record);
    return record;
  },
  async get(id) { return dbGet(STORES.PHOTOS, id); },
  async listByProfile(profileId) { return dbGetAllByIndex(STORES.PHOTOS, 'profileId', profileId); },
  async update(id, data) {
    const existing = await dbGet(STORES.PHOTOS, id);
    if (!existing) throw new Error('Photo not found');
    await dbPut(STORES.PHOTOS, { ...existing, ...data, id });
    return { ...existing, ...data, id };
  },
  async delete(id) { return dbDelete(STORES.PHOTOS, id); },
  async deleteByProfile(profileId) {
    const items = await this.listByProfile(profileId);
    await Promise.all(items.map(i => dbDelete(STORES.PHOTOS, i.id)));
  }
};

// ─── Sounds ───────────────────────────────────────────────────────────────────
export const Sounds = {
  async add(profileId, { blob, metadata = {}, type = 'bark' }) {
    const id = uuidv4();
    const record = {
      id, profileId, blob, type,
      metadata: { name: metadata.name, size: metadata.size, duration: metadata.duration, ...metadata },
      createdAt: Date.now(),
      analysed: false,
      analysisResult: null,
      tags: []
    };
    await dbPut(STORES.SOUNDS, record);
    return record;
  },
  async get(id) { return dbGet(STORES.SOUNDS, id); },
  async listByProfile(profileId) { return dbGetAllByIndex(STORES.SOUNDS, 'profileId', profileId); },
  async update(id, data) {
    const existing = await dbGet(STORES.SOUNDS, id);
    if (!existing) throw new Error('Sound not found');
    await dbPut(STORES.SOUNDS, { ...existing, ...data, id });
    return { ...existing, ...data, id };
  },
  async delete(id) { return dbDelete(STORES.SOUNDS, id); },
  async deleteByProfile(profileId) {
    const items = await this.listByProfile(profileId);
    await Promise.all(items.map(i => dbDelete(STORES.SOUNDS, i.id)));
  }
};

// ─── Memory entries ───────────────────────────────────────────────────────────
export const MemoryEntries = {
  async add(profileId, { title, text, date, emotionalTags = [], mediaIds = [] }) {
    const id = uuidv4();
    const record = { id, profileId, title, text, date: date || Date.now(), emotionalTags, mediaIds, createdAt: Date.now() };
    await dbPut(STORES.MEMORIES, record);
    return record;
  },
  async get(id) { return dbGet(STORES.MEMORIES, id); },
  async listByProfile(profileId) { return dbGetAllByIndex(STORES.MEMORIES, 'profileId', profileId); },
  async update(id, data) {
    const existing = await dbGet(STORES.MEMORIES, id);
    if (!existing) throw new Error('Memory not found');
    await dbPut(STORES.MEMORIES, { ...existing, ...data, id });
    return { ...existing, ...data, id };
  },
  async delete(id) { return dbDelete(STORES.MEMORIES, id); },
  async deleteByProfile(profileId) {
    const items = await this.listByProfile(profileId);
    await Promise.all(items.map(i => dbDelete(STORES.MEMORIES, i.id)));
  }
};

// ─── Dog config (AI generated) ────────────────────────────────────────────────
export const DogConfig = {
  async save(profileId, config) {
    await dbPut(STORES.DOG_CONFIG, { profileId, config, updatedAt: Date.now() });
  },
  async get(profileId) {
    const record = await dbGet(STORES.DOG_CONFIG, profileId);
    return record?.config || null;
  },
  async delete(profileId) { return dbDelete(STORES.DOG_CONFIG, profileId); }
};

// ─── Voice commands ───────────────────────────────────────────────────────────
export const VoiceCommands = {
  async add(profileId, { phrase, blob, reaction }) {
    const id = uuidv4();
    const record = { id, profileId, phrase, blob, reaction, createdAt: Date.now() };
    await dbPut(STORES.VOICE_CMDS, record);
    return record;
  },
  async listByProfile(profileId) { return dbGetAllByIndex(STORES.VOICE_CMDS, 'profileId', profileId); },
  async delete(id) { return dbDelete(STORES.VOICE_CMDS, id); },
  async deleteByProfile(profileId) {
    const items = await this.listByProfile(profileId);
    await Promise.all(items.map(i => dbDelete(STORES.VOICE_CMDS, i.id)));
  }
};


// ─── Videos ───────────────────────────────────────────────────────────────────
export const Videos = {
  async add(profileId, { blob, thumbnail, metadata = {}, extractedSoundBlob = null, analysis = null }) {
    const id = uuidv4();
    const record = {
      id, profileId,
      blob,                // full video blob (may be large — stored in IDB)
      thumbnail,           // first-frame thumbnail blob
      extractedSoundBlob,  // audio extracted from video (null until processed)
      metadata: {
        name:     metadata.name,
        type:     metadata.type,
        size:     metadata.size,
        duration: metadata.duration || 0,
        ...metadata,
      },
      analysis,            // { dominantColour, ambientType, movementIntensity, … }
      processed: false,    // true after local video AI analysis complete
      createdAt: Date.now(),
    };
    await dbPut(STORES.VIDEOS, record);
    return record;
  },
  async get(id)                { return dbGet(STORES.VIDEOS, id); },
  async listByProfile(profileId) { return dbGetAllByIndex(STORES.VIDEOS, 'profileId', profileId); },
  async update(id, data) {
    const existing = await dbGet(STORES.VIDEOS, id);
    if (!existing) throw new Error('Video not found');
    await dbPut(STORES.VIDEOS, { ...existing, ...data, id });
    return { ...existing, ...data, id };
  },
  async delete(id) { return dbDelete(STORES.VIDEOS, id); },
  async deleteByProfile(profileId) {
    const items = await this.listByProfile(profileId);
    await Promise.all(items.map(i => dbDelete(STORES.VIDEOS, i.id)));
  },
};

// ─── Companion Adaptation (ritual + spot learning) ────────────────────────────
export const CompanionAdaptation = {
  async get(profileId) {
    const record = await dbGet(STORES.ADAPTATION, profileId);
    return record || {
      profileId,
      ritualCounts:    {},   // { ritualId: count }
      spotPreference:  null, // 'sofa' | 'fireplace' | 'garden' | …
      envPreference:   null,
      lastEnv:         null,
      interactionLog:  [],   // last 50 interaction timestamps + types
      totalSessions:   0,
      updatedAt:       0,
    };
  },
  async save(profileId, data) {
    await dbPut(STORES.ADAPTATION, { ...data, profileId, updatedAt: Date.now() });
  },
  async logRitual(profileId, ritualId) {
    const ad = await this.get(profileId);
    ad.ritualCounts[ritualId] = (ad.ritualCounts[ritualId] || 0) + 1;
    await this.save(profileId, ad);
  },
  async logEnv(profileId, env) {
    const ad = await this.get(profileId);
    ad.lastEnv = env;
    // Derive preferred env from last 20 usage records
    if (!ad.envLog) ad.envLog = [];
    ad.envLog = [env, ...ad.envLog].slice(0, 20);
    const freq = {};
    ad.envLog.forEach(e => { freq[e] = (freq[e] || 0) + 1; });
    ad.envPreference = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    await this.save(profileId, ad);
  },
  async incrementSession(profileId) {
    const ad = await this.get(profileId);
    ad.totalSessions = (ad.totalSessions || 0) + 1;
    await this.save(profileId, ad);
  },
  async delete(profileId) { return dbDelete(STORES.ADAPTATION, profileId); },
};

// ─── Timeline ─────────────────────────────────────────────────────────────────
export const Timeline = {
  async add(profileId, { date, title, description, type, mediaId }) {
    const id = uuidv4();
    const record = { id, profileId, date, title, description, type: type || 'memory', mediaId, createdAt: Date.now() };
    await dbPut(STORES.TIMELINE, record);
    return record;
  },
  async listByProfile(profileId) {
    const items = await dbGetAllByIndex(STORES.TIMELINE, 'profileId', profileId);
    return items.sort((a, b) => a.date - b.date);
  },
  async delete(id) { return dbDelete(STORES.TIMELINE, id); },
  async deleteByProfile(profileId) {
    const items = await this.listByProfile(profileId);
    await Promise.all(items.map(i => dbDelete(STORES.TIMELINE, i.id)));
  }
};

// ─── AI cache ─────────────────────────────────────────────────────────────────
export const AICache = {
  async save(profileId, analysisType, result) {
    const id = `${profileId}:${analysisType}`;
    await dbPut(STORES.AI_CACHE, { id, profileId, analysisType, result, savedAt: Date.now() });
  },
  async get(profileId, analysisType) {
    const record = await dbGet(STORES.AI_CACHE, `${profileId}:${analysisType}`);
    return record?.result || null;
  },
  async deleteByProfile(profileId) {
    const db = await getDB();
    const items = await db.getAllFromIndex(STORES.AI_CACHE, 'profileId', profileId);
    await Promise.all(items.map(i => dbDelete(STORES.AI_CACHE, i.id)));
  },
  async clearAll() { return dbClear(STORES.AI_CACHE); }
};

// ─── AI model cache ───────────────────────────────────────────────────────────
export const AIModels = {
  async save(name, blob) { await dbPut(STORES.AI_MODELS, { name, blob, savedAt: Date.now() }); },
  async get(name) {
    const record = await dbGet(STORES.AI_MODELS, name);
    return record?.blob || null;
  },
  async clearAll() { return dbClear(STORES.AI_MODELS); }
};

// ─── App settings ─────────────────────────────────────────────────────────────
const IS_PROD = typeof __IS_PROD__ !== 'undefined' ? __IS_PROD__ : false;

const DEFAULT_SETTINGS = {
  theme: 'dark',
  enableDemoMode: IS_PROD ? false : false, // ALWAYS false in prod
  soundEnabled: true,
  ambientSoundEnabled: true,
  animationQuality: 'high', // 'low' | 'medium' | 'high'
  notificationsEnabled: false,
  autoSave: true,
  language: 'en',
};

export const AppSettings = {
  get() {
    try {
      const raw = localStorage.getItem(LS.APP_SETTINGS);
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (IS_PROD) merged.enableDemoMode = false; // Production guard
      return merged;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  set(key, value) {
    const current = this.get();
    if (IS_PROD && key === 'enableDemoMode') return; // Guard
    current[key] = value;
    localStorage.setItem(LS.APP_SETTINGS, JSON.stringify(current));
  },
  update(updates) {
    const current = this.get();
    const merged = { ...current, ...updates };
    if (IS_PROD) merged.enableDemoMode = false;
    localStorage.setItem(LS.APP_SETTINGS, JSON.stringify(merged));
    return merged;
  },
  reset() {
    localStorage.setItem(LS.APP_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  }
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
export const Onboarding = {
  isDone() { return localStorage.getItem(LS.ONBOARDING_DONE) === 'true'; },
  markDone() { localStorage.setItem(LS.ONBOARDING_DONE, 'true'); },
  reset() { localStorage.removeItem(LS.ONBOARDING_DONE); }
};

// ─── Install prompt ───────────────────────────────────────────────────────────
export const InstallPrompt = {
  isDismissed() { return localStorage.getItem(LS.INSTALL_PROMPT) === 'true'; },
  dismiss() { localStorage.setItem(LS.INSTALL_PROMPT, 'true'); }
};

// ─── Storage diagnostics ──────────────────────────────────────────────────────
export const StorageDiagnostics = {
  async getStats(profileId) {
    const [photos, sounds, memories, voiceCmds, timelineEvents] = await Promise.all([
      Photos.listByProfile(profileId),
      Sounds.listByProfile(profileId),
      MemoryEntries.listByProfile(profileId),
      VoiceCommands.listByProfile(profileId),
      Timeline.listByProfile(profileId),
    ]);

    const photoSize = photos.reduce((acc, p) => acc + (p.blob?.size || 0) + (p.thumbnail?.size || 0), 0);
    const soundSize = sounds.reduce((acc, s) => acc + (s.blob?.size || 0), 0);
    const voiceSize = voiceCmds.reduce((acc, v) => acc + (v.blob?.size || 0), 0);

    let quota = null;
    if (navigator.storage?.estimate) {
      quota = await navigator.storage.estimate();
    }

    return {
      counts: { photos: photos.length, sounds: sounds.length, memories: memories.length, voiceCommands: voiceCmds.length, timelineEvents: timelineEvents.length },
      sizes: { photos: photoSize, sounds: soundSize, voices: voiceSize, total: photoSize + soundSize + voiceSize },
      quota
    };
  },

  async clearAll() {
    const db = await getDB();
    await Promise.all(Object.values(STORES).map(s => db.clear(s)));
    Object.keys(LS).forEach(k => localStorage.removeItem(LS[k]));
  }
};

// ─── Export/Import profile ────────────────────────────────────────────────────
export const ProfileIO = {
  async exportProfile(profileId) {
    const [profile, photos, sounds, memories, config, voiceCmds, timelineEvents] = await Promise.all([
      Profiles.get(profileId),
      Photos.listByProfile(profileId),
      Sounds.listByProfile(profileId),
      MemoryEntries.listByProfile(profileId),
      DogConfig.get(profileId),
      VoiceCommands.listByProfile(profileId),
      Timeline.listByProfile(profileId),
    ]);

    return {
      exportVersion: '1.0',
      exportedAt: Date.now(),
      profile,
      photos,
      sounds,
      memories,
      config,
      voiceCmds,
      timelineEvents
    };
  },

  async importProfile(data) {
    const { profile, photos, sounds, memories, config, voiceCmds, timelineEvents } = data;
    if (!profile?.id) throw new Error('Invalid profile export');

    await dbPut(STORES.PROFILES, profile);
    await Promise.all([
      ...photos.map(p => dbPut(STORES.PHOTOS, p)),
      ...sounds.map(s => dbPut(STORES.SOUNDS, s)),
      ...memories.map(m => dbPut(STORES.MEMORIES, m)),
      ...(voiceCmds || []).map(v => dbPut(STORES.VOICE_CMDS, v)),
      ...(timelineEvents || []).map(t => dbPut(STORES.TIMELINE, t)),
    ]);
    if (config) await DogConfig.save(profile.id, config);
    return profile;
  }
};
// ─── AI Jobs (agent orchestrator job queue) ──────────────────────────────────
// Stores: running | ok | fallback | error jobs from agentOrchestrator.js.
// All AI agent state flows through here — single source of truth.
export const AIJobs = {
  /** Create a new job record (status: 'running'). */
  async create(record) {
    return dbPut(STORES.AI_JOBS, {
      id:          record.id,
      agent:       record.agent      || 'unknown',
      prompt:      record.prompt     || '',
      status:      record.status     || 'running',
      result:      record.result     || null,
      error:       record.error      || null,
      profileId:   record.profileId  || null,
      durationMs:  null,
      createdAt:   record.createdAt  || Date.now(),
      completedAt: null,
    });
  },

  /** Update an existing job (merge partial fields). */
  async update(id, fields) {
    const existing = await dbGet(STORES.AI_JOBS, id);
    if (!existing) return;
    return dbPut(STORES.AI_JOBS, { ...existing, ...fields });
  },

  /** Get a single job by ID. */
  async get(id) { return dbGet(STORES.AI_JOBS, id); },

  /** List all jobs, newest first (up to limit). */
  async list({ limit = 50 } = {}) {
    const all = await dbGetAll(STORES.AI_JOBS);
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },

  /** List jobs by profile. */
  async listByProfile(profileId) {
    return dbGetAllByIndex(STORES.AI_JOBS, 'profileId', profileId);
  },

  /** List jobs by status ('running' | 'ok' | 'fallback' | 'error'). */
  async listByStatus(status) {
    return dbGetAllByIndex(STORES.AI_JOBS, 'status', status);
  },

  /** Delete a single job. */
  async delete(id) { return dbDelete(STORES.AI_JOBS, id); },

  /** Purge completed jobs older than maxAgeMs (default: 7 days). */
  async purgeOld(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const all = await dbGetAll(STORES.AI_JOBS);
    const cutoff = Date.now() - maxAgeMs;
    const toDelete = all.filter(
      j => j.status !== 'running' && j.createdAt < cutoff
    );
    await Promise.all(toDelete.map(j => dbDelete(STORES.AI_JOBS, j.id)));
    return toDelete.length;
  },

  /** Mark any stale 'running' jobs as 'error' (e.g. after app restart). */
  async recoverStale() {
    const running = await dbGetAllByIndex(STORES.AI_JOBS, 'status', 'running');
    const staleMs = 60000; // jobs running > 60s at startup are stale
    const now = Date.now();
    await Promise.all(
      running
        .filter(j => now - j.createdAt > staleMs)
        .map(j => dbPut(STORES.AI_JOBS, {
          ...j,
          status:      'error',
          error:       'Job interrupted (app restarted)',
          completedAt: now,
        }))
    );
  },
};

// ─── AI Registry (boot kernel persistence) ───────────────────────────────────
// Stores a lightweight record of AI module initialisation state.
// Key is always 'singleton' — one record for the whole app.
// Only serialisable state stored here — no live objects or running processes.
export const AIRegistry = {
  REGISTRY_KEY: 'singleton',

  /** Save AI registry snapshot to IDB after successful boot. */
  async save(snapshot) {
    await dbPut(STORES.AI_REGISTRY, {
      key:        AIRegistry.REGISTRY_KEY,
      version:    snapshot.version    || '1.0',
      modules:    snapshot.modules    || [],
      configKeys: snapshot.configKeys || [],
      bootsAt:    snapshot.bootsAt    || Date.now(),
      savedAt:    Date.now(),
    });
  },

  /** Read last persisted registry from IDB. Returns null on fresh install. */
  async get() {
    const record = await dbGet(STORES.AI_REGISTRY, AIRegistry.REGISTRY_KEY);
    return record || null;
  },

  /** Clear registry (e.g. on app reset or failed boot). */
  async clear() {
    return dbDelete(STORES.AI_REGISTRY, AIRegistry.REGISTRY_KEY);
  },
};


// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initStorage() {
  try {
    await getDB();
    return { ok: true };
  } catch (err) {
    console.error('[Storage] Init failed:', err);
    return { ok: false, error: err.message };
  }
}

export { STORES, LS };
