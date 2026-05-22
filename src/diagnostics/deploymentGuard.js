/**
 * Immortail™ — Deployment Firewall
 * Runs on app init. Validates production safety rules.
 * Fails loudly in dev, silently guards in prod.
 */
import { AppSettings } from '../core/storage.js';
import { IS_PROD } from '../core/constants.js';

const CHECKS = [];
const RESULTS = [];

function check(name, fn) {
  CHECKS.push({ name, fn });
}

// ── Rule 1: Demo mode disabled in prod ───────────────────────────────────────
check('demo-mode-disabled', () => {
  if (!IS_PROD) return { ok: true, msg: 'Dev mode — demo allowed' };
  const settings = AppSettings.get();
  if (settings.enableDemoMode) {
    AppSettings.set('enableDemoMode', false); // auto-fix
    return { ok: true, msg: 'Auto-disabled demo mode in prod' };
  }
  return { ok: true, msg: 'Demo mode disabled ✓' };
});

// ── Rule 2: No backend/cloud deps ────────────────────────────────────────────
check('no-backend-deps', () => {
  // We check for any injected cloud config vars
  const forbidden = ['FIREBASE_API_KEY', 'SUPABASE_URL', 'MONGODB_URI'];
  for (const key of forbidden) {
    if (typeof window !== 'undefined' && window[key]) {
      return { ok: false, msg: `Forbidden backend config detected: ${key}` };
    }
  }
  return { ok: true, msg: 'No backend dependencies ✓' };
});

// ── Rule 3: IndexedDB available ──────────────────────────────────────────────
check('indexeddb-available', () => {
  if (typeof indexedDB === 'undefined') {
    return { ok: false, msg: 'IndexedDB not available in this environment' };
  }
  return { ok: true, msg: 'IndexedDB available ✓' };
});

// ── Rule 4: Service Worker supported ────────────────────────────────────────
check('service-worker-supported', () => {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, msg: 'Service Worker not supported — offline mode unavailable' };
  }
  return { ok: true, msg: 'Service Worker supported ✓' };
});

// ── Rule 5: Web Audio API available ─────────────────────────────────────────
check('web-audio-available', () => {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
    return { ok: false, msg: 'Web Audio API not available' };
  }
  return { ok: true, msg: 'Web Audio API available ✓' };
});

// ── Rule 6: Canvas available ─────────────────────────────────────────────────
check('canvas-available', () => {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext) {
    return { ok: false, msg: 'Canvas 2D not available' };
  }
  return { ok: true, msg: 'Canvas 2D available ✓' };
});

// ── Rule 7: Web Workers supported ────────────────────────────────────────────
check('web-workers-supported', () => {
  if (typeof Worker === 'undefined') {
    return { ok: false, msg: 'Web Workers not supported — AI runs in degraded mode' };
  }
  return { ok: true, msg: 'Web Workers supported ✓' };
});

/**
 * Run all checks. Returns { passed, failed, results }.
 */
export async function runDeploymentChecks() {
  const results = [];
  for (const { name, fn } of CHECKS) {
    try {
      const result = fn();
      results.push({ name, ...result });
    } catch (e) {
      results.push({ name, ok: false, msg: e.message });
    }
  }

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  if (!IS_PROD) {
    console.group('[Immortail™] Deployment checks');
    results.forEach(r => {
      const icon = r.ok ? '✅' : '❌';
      console.log(`${icon} ${r.name}: ${r.msg}`);
    });
    console.log(`Passed: ${passed}/${results.length}`);
    console.groupEnd();
  }

  return { passed, failed, total: results.length, results };
}

/**
 * Called once on app init.
 */
export async function initDeploymentGuard() {
  const { failed, results } = await runDeploymentChecks();
  if (failed > 0 && IS_PROD) {
    // Soft fail — log only critical issues, don't block UX
    const critical = results.filter(r => !r.ok && ['indexeddb-available', 'canvas-available'].includes(r.name));
    if (critical.length > 0) {
      console.error('[Immortail™] Critical checks failed:', critical.map(r => r.msg));
    }
  }
  return results;
}
