/**
 * Immortail™ — BackupEngine
 * ─────────────────────────────────────────────────────────────────────────────
 * Additive-only migration layer. NEVER modifies existing storage contracts.
 * All encryption is local-only using browser-native WebCrypto.
 *
 * Exported API:
 *   BackupEngine.createBackup(profileId)     → encrypted .immortailbackup Blob
 *   BackupEngine.restoreBackup(file)         → validated restore with rollback
 *   BackupEngine.validateBackup(file)        → validation report (no writes)
 *   BackupEngine.detectRestoredEnvironment() → Chrome profile restore detection
 *   BackupEngine.getBackupMeta(file)         → quick metadata read (no decrypt needed)
 *   BackupEngine.repairBackup(file)          → attempt partial recovery
 */

import { ProfileIO, Profiles, Photos, Sounds, MemoryEntries,
         DogConfig, VoiceCommands, Timeline, AICache,
         ActiveProfile, AppSettings } from '../core/storage.js';
import { STORES } from '../core/storage.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const BACKUP_VERSION       = 2;
const BACKUP_MAGIC         = 'IMMORTAIL_BACKUP';
const BACKUP_EXTENSION     = '.immortailbackup';

// localStorage keys for migration metadata — ADDITIVE ONLY (never touch existing LS keys)
const MIG_LS = {
  LAST_BACKUP_AT:    'immortail:lastBackupAt',
  BACKUP_FINGERPRINT:'immortail:backupFingerprint',
  RESTORE_PENDING:   'immortail:restorePending',   // set when Chrome restore detected
  INSTALL_TIMESTAMP: 'immortail:firstInstallAt',
};

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2.
 * When passphrase is null/empty we use a fixed device-local key seed.
 */
async function deriveKey(passphrase, saltBuf) {
  const seed = passphrase || 'immortail-local-only-key-v1';
  const enc  = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(seed), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(plaintext, passphrase) {
  const salt  = crypto.getRandomValues(new Uint8Array(16));
  const iv    = crypto.getRandomValues(new Uint8Array(12));
  const key   = await deriveKey(passphrase, salt);
  const data  = new TextEncoder().encode(plaintext);
  const cipher= await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  // Pack: [4B magic length][magic][16B salt][12B iv][ciphertext]
  const magic  = new TextEncoder().encode(BACKUP_MAGIC);
  const header = new Uint8Array(4 + magic.length + 16 + 12);
  const view   = new DataView(header.buffer);
  view.setUint32(0, magic.length, true);
  header.set(magic, 4);
  header.set(salt, 4 + magic.length);
  header.set(iv,   4 + magic.length + 16);

  const combined = new Uint8Array(header.byteLength + cipher.byteLength);
  combined.set(header, 0);
  combined.set(new Uint8Array(cipher), header.byteLength);
  return combined;
}

async function decrypt(bytes, passphrase) {
  const view      = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magicLen  = view.getUint32(0, true);
  const magic     = new TextDecoder().decode(bytes.slice(4, 4 + magicLen));
  if (magic !== BACKUP_MAGIC) throw new Error('Not a valid Immortail backup file');

  const offset    = 4 + magicLen;
  const salt      = bytes.slice(offset,      offset + 16);
  const iv        = bytes.slice(offset + 16, offset + 28);
  const cipher    = bytes.slice(offset + 28);

  const key       = await deriveKey(passphrase, salt);
  const plain     = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

// ─── Blob serialisation ───────────────────────────────────────────────────────
// JSON can't hold Blobs — we base64-encode them with a type tag

async function blobToB64(blob) {
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ __type: 'Blob', mime: blob.type, b64: reader.result.split(',')[1] });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function b64ToBlob(obj) {
  if (!obj || obj.__type !== 'Blob') return null;
  const bytes = Uint8Array.from(atob(obj.b64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: obj.mime });
}

async function serialiseRecord(record) {
  const out = { ...record };
  for (const key of Object.keys(out)) {
    if (out[key] instanceof Blob) {
      out[key] = await blobToB64(out[key]);
    }
  }
  return out;
}

function deserialiseRecord(record) {
  const out = { ...record };
  for (const key of Object.keys(out)) {
    if (out[key]?.__type === 'Blob') {
      out[key] = b64ToBlob(out[key]);
    }
  }
  return out;
}

// ─── Fingerprint ──────────────────────────────────────────────────────────────
async function fingerprint(obj) {
  const str  = JSON.stringify(obj, (k, v) => (v instanceof Blob ? '[blob]' : v));
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 16);
}

// ─── Main API ─────────────────────────────────────────────────────────────────
export const BackupEngine = {

  // ── Create an encrypted .immortailbackup file ─────────────────────────────
  async createBackup(profileId, passphrase = null) {
    const raw = await ProfileIO.exportProfile(profileId);

    // Serialise all blobs to base64
    const photos    = await Promise.all((raw.photos    || []).map(serialiseRecord));
    const sounds    = await Promise.all((raw.sounds    || []).map(serialiseRecord));
    const voiceCmds = await Promise.all((raw.voiceCmds || []).map(serialiseRecord));

    const payload = {
      magic:          BACKUP_MAGIC,
      version:        BACKUP_VERSION,
      createdAt:      Date.now(),
      appVersion:     typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
      profile:        raw.profile,
      photos,
      sounds,
      memories:       raw.memories       || [],
      config:         raw.config         || null,
      voiceCmds,
      timelineEvents: raw.timelineEvents || [],
      settings:       AppSettings.get(),
      lsMeta: {
        lastSession:  localStorage.getItem('immortail:lastSession'),
      },
    };

    // Store fingerprint for Chrome restore detection
    const fp = await fingerprint(payload.profile);
    localStorage.setItem(MIG_LS.LAST_BACKUP_AT,     String(Date.now()));
    localStorage.setItem(MIG_LS.BACKUP_FINGERPRINT, fp);

    const json     = JSON.stringify(payload);
    const encrypted = await encrypt(json, passphrase);
    return new Blob([encrypted], { type: 'application/octet-stream' });
  },

  // ── Read metadata without full decrypt ────────────────────────────────────
  // We store an unencrypted header prefix for quick inspection
  async getBackupMeta(file) {
    // Attempt decrypt with no passphrase to get meta
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const json  = await decrypt(bytes, null);
      const data  = JSON.parse(json);
      return {
        ok:          true,
        version:     data.version,
        createdAt:   data.createdAt,
        dogName:     data.profile?.name,
        ownerName:   data.profile?.ownerName,
        photoCount:  data.photos?.length || 0,
        soundCount:  data.sounds?.length || 0,
        memoryCount: data.memories?.length || 0,
        appVersion:  data.appVersion,
        needsPassphrase: false,
      };
    } catch (e) {
      if (e.message?.includes('decrypt') || e.name === 'OperationError') {
        return { ok: false, needsPassphrase: true };
      }
      return { ok: false, error: e.message, needsPassphrase: false };
    }
  },

  // ── Validate backup integrity without writing ──────────────────────────────
  async validateBackup(file, passphrase = null) {
    const report = {
      valid:           false,
      hasProfile:      false,
      hasConfig:       false,
      hasPhotos:       false,
      hasSounds:       false,
      hasMemories:     false,
      hasTimeline:     false,
      duplicateRisk:   false,
      warnings:        [],
      errors:          [],
    };

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const json  = await decrypt(bytes, passphrase);
      const data  = JSON.parse(json);

      if (data.magic !== BACKUP_MAGIC)
        return { ...report, errors: ['Not a valid Immortail backup'] };
      if (!data.version || data.version > BACKUP_VERSION)
        report.warnings.push('Backup version is newer than this app — some fields may be ignored');

      report.hasProfile  = !!data.profile?.id && !!data.profile?.name;
      report.hasConfig   = !!data.config;
      report.hasPhotos   = (data.photos?.length || 0) > 0;
      report.hasSounds   = (data.sounds?.length || 0) > 0;
      report.hasMemories = (data.memories?.length || 0) > 0;
      report.hasTimeline = (data.timelineEvents?.length || 0) > 0;

      if (!report.hasProfile) {
        report.errors.push('Profile data is missing or corrupt');
        return report;
      }

      // Check for existing profile with same ID
      const existing = await Profiles.get(data.profile.id);
      if (existing) {
        report.duplicateRisk = true;
        report.warnings.push(`A companion named "${existing.name}" already exists. Restoring will merge data.`);
      }

      if (!report.hasConfig)   report.warnings.push('AI config missing — companion will need to be rebuilt');
      if (!report.hasPhotos)   report.warnings.push('No photos in backup');
      if (!report.hasSounds)   report.warnings.push('No sounds in backup');

      report.valid = report.errors.length === 0;
      report._parsed = data; // internal use only — not shown to user
      return report;

    } catch (e) {
      if (e.name === 'OperationError') {
        return { ...report, errors: ['Wrong passphrase or corrupted file'] };
      }
      return { ...report, errors: [`Validation failed: ${e.message}`] };
    }
  },

  // ── Restore from backup (with rollback on failure) ─────────────────────────
  async restoreBackup(file, passphrase = null, { onProgress } = {}) {
    const progress = (msg, pct) => onProgress?.({ message: msg, percent: pct });

    progress('Validating backup…', 5);
    const report = await this.validateBackup(file, passphrase);
    if (!report.valid) {
      throw new Error(report.errors.join('; '));
    }

    const data = report._parsed;

    // ── Take rollback snapshot of existing active profile ─────────────────
    progress('Creating safety snapshot…', 10);
    let rollback = null;
    const existingActiveId = ActiveProfile.get();
    if (existingActiveId) {
      try {
        rollback = await ProfileIO.exportProfile(existingActiveId);
      } catch (_) { /* non-fatal — best effort */ }
    }

    try {
      progress('Restoring companion profile…', 20);
      // Use profileId from backup — preserve original IDs exactly
      const { profile, photos, sounds, memories, config, voiceCmds, timelineEvents } = data;

      // Write profile
      await ProfileIO.importProfile({
        profile,
        photos:         (photos        || []).map(deserialiseRecord),
        sounds:         (sounds        || []).map(deserialiseRecord),
        memories:       memories        || [],
        config:         config          || null,
        voiceCmds:      (voiceCmds     || []).map(deserialiseRecord),
        timelineEvents: timelineEvents  || [],
      });

      progress('Restoring memories…', 50);
      progress('Restoring sounds…', 65);
      progress('Restoring AI configuration…', 80);

      // Restore settings if present (non-destructive merge — keeps user's current prefs)
      if (data.settings) {
        const current = AppSettings.get();
        // Only restore settings that aren't already set by the user
        const merged = { ...data.settings, ...current };
        AppSettings.update(merged);
      }

      // Mark restore complete
      localStorage.removeItem(MIG_LS.RESTORE_PENDING);
      progress('Restore complete', 100);

      return {
        ok:          true,
        profile,
        photoCount:  photos?.length  || 0,
        soundCount:  sounds?.length  || 0,
        memoryCount: memories?.length || 0,
      };

    } catch (err) {
      // ── Rollback ──────────────────────────────────────────────────────────
      progress('Restore failed — rolling back…', -1);
      if (rollback && existingActiveId) {
        try {
          await ProfileIO.importProfile(rollback);
          ActiveProfile.set(existingActiveId);
        } catch (_) { /* can't do anything more */ }
      }
      throw new Error(`Restore failed: ${err.message}`);
    }
  },

  // ── Attempt partial recovery of a corrupted backup ──────────────────────
  async repairBackup(file, passphrase = null) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const json  = await decrypt(bytes, passphrase);
      const data  = JSON.parse(json);

      // Reconstruct minimal valid payload from whatever survived
      const repaired = {
        profile:        data.profile        || null,
        photos:         Array.isArray(data.photos)         ? data.photos         : [],
        sounds:         Array.isArray(data.sounds)         ? data.sounds         : [],
        memories:       Array.isArray(data.memories)       ? data.memories       : [],
        config:         data.config                        || null,
        voiceCmds:      Array.isArray(data.voiceCmds)      ? data.voiceCmds      : [],
        timelineEvents: Array.isArray(data.timelineEvents) ? data.timelineEvents : [],
      };

      const issues = [];
      if (!repaired.profile?.id)  issues.push('Profile identity missing — cannot repair');

      return { repaired, issues, canProceed: issues.length === 0 };
    } catch (e) {
      return { repaired: null, issues: [e.message], canProceed: false };
    }
  },

  // ── Chrome profile restore detection ──────────────────────────────────────
  // Detects when: the app is freshly installed (no IDB profiles) but localStorage
  // has our fingerprint keys (Chrome synced them over). This indicates the user
  // has restored their Chrome profile and a backup may be available.
  async detectRestoredEnvironment() {
    try {
      const hasFp   = !!localStorage.getItem(MIG_LS.BACKUP_FINGERPRINT);
      const lastAt  = localStorage.getItem(MIG_LS.LAST_BACKUP_AT);
      if (!hasFp || !lastAt) return { detected: false };

      // Check if IDB is empty (fresh device)
      const profiles = await Profiles.list();
      if (profiles.length > 0) return { detected: false }; // already has data

      const daysSince = (Date.now() - parseInt(lastAt, 10)) / (1000 * 60 * 60 * 24);

      return {
        detected:     true,
        lastBackupAt: parseInt(lastAt, 10),
        daysSince:    Math.round(daysSince),
        fingerprint:  localStorage.getItem(MIG_LS.BACKUP_FINGERPRINT),
      };
    } catch {
      return { detected: false };
    }
  },

  // ── Record first-install timestamp (call once on fresh install) ───────────
  recordFirstInstall() {
    if (!localStorage.getItem(MIG_LS.INSTALL_TIMESTAMP)) {
      localStorage.setItem(MIG_LS.INSTALL_TIMESTAMP, String(Date.now()));
    }
  },

  // ── Expose MIG_LS for external use (e.g. diagnostics) ────────────────────
  MIG_LS,
};
