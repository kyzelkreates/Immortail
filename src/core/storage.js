/**
 * Immortail™ Core Storage — SINGLE SOURCE OF TRUTH
 * All app state, media, and config flows through here.
 * Uses IndexedDB for media/models, localStorage for metadata/settings.
 */

import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';

// ─── DB Config ────────────────────────────────────────────────────────────────
const DB_NAME    = 'immortail-db';
const DB_VERSION = 1;

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
    await MemoryEntries.deleteByProfile(id);
    await DogConfig.delete(id);
    await VoiceCommands.deleteByProfile(id);
    await Timeline.deleteByProfile(id);
    await AICache.deleteByProfile(id);
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
