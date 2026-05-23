/**
 * Immortail™ — AI Task Manager  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all long-running async operations.
 * Vanilla JS module — no React, no framework dependencies.
 * Consumed by useAITask() hook for React integration.
 *
 * Guarantees:
 *   - One task at a time (activeTaskLock)
 *   - Duplicate execution guard (idempotent createTask)
 *   - Every task terminates (timeout kill-switch at 3 min)
 *   - Stale state never leaks (completeTask/failTask always reset)
 *   - Cancellation safe (cancel sets cancelled flag, pending promises ignore results)
 *   - ETA engine updates dynamically as stages complete
 */

// ─── Task stage presets ────────────────────────────────────────────────────────
export const STAGES = {
  RECONSTRUCT: [
    'Initialising AI core…',
    'Loading emotional memory graph…',
    'Analysing photographs…',
    'Processing sound patterns…',
    'Reconstructing personality…',
    'Generating immersive presence…',
    'Optimising emotional memory…',
    'Finalising reconstruction…',
  ],
  VIDEO: [
    'Reading video memory…',
    'Extracting audio track…',
    'Analysing sound patterns…',
    'Detecting emotional signals…',
    'Building memory analysis…',
    'Saving to memory library…',
  ],
  GENERIC: [
    'Preparing…',
    'Processing…',
    'Finalising…',
  ],
};

// Default stage durations (ms) — used for ETA before history exists
const DEFAULT_STAGE_MS = {
  RECONSTRUCT: 18000,  // ~2.4 min total (8 stages × avg 18s)
  VIDEO:       10000,
  GENERIC:     5000,
};

const TASK_TIMEOUT_MS = 3 * 60 * 1000;  // 3-minute hard kill

// ─── Internal state ────────────────────────────────────────────────────────────
let _activeTask    = null;
let _listeners     = new Set();
let _taskHistory   = [];  // completed task durations for ETA calibration
const _LS_HISTORY  = 'immortail:taskDurations';

// Load persisted history
try {
  _taskHistory = JSON.parse(localStorage.getItem(_LS_HISTORY) || '[]');
} catch {}

// ─── Listener (pub-sub for React) ─────────────────────────────────────────────
export function subscribeToTask(cb) {
  _listeners.add(cb);
  // Immediately notify subscriber of current state
  cb(_activeTask ? { ..._activeTask } : null);
  return () => _listeners.delete(cb);
}

function _notify() {
  _listeners.forEach(cb => cb(_activeTask ? { ..._activeTask } : null));
}

// ─── ETA engine ────────────────────────────────────────────────────────────────
function estimateTotalMs(taskType) {
  const relevant = _taskHistory.filter(h => h.type === taskType).slice(-5);
  if (relevant.length >= 2) {
    const avg = relevant.reduce((s, h) => s + h.durationMs, 0) / relevant.length;
    return Math.round(avg);
  }
  return DEFAULT_STAGE_MS[taskType] || DEFAULT_STAGE_MS.GENERIC;
}

function computeETA(task) {
  const elapsed   = Date.now() - task.startedAt;
  const pct       = task.pct || 0;
  if (pct <= 0) return estimateTotalMs(task.type);
  if (pct >= 100) return 0;
  const totalEst  = (elapsed / pct) * 100;
  return Math.max(0, Math.round(totalEst - elapsed));
}

export function formatETA(ms) {
  if (!ms || ms <= 0) return null;
  const secs = Math.round(ms / 1000);
  if (secs < 60)    return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── Task lifecycle ────────────────────────────────────────────────────────────

/**
 * Create and start a new AI task.
 * Returns { id, cancel } — or throws if a task is already active.
 *
 * @param {string} type     — 'RECONSTRUCT' | 'VIDEO' | 'GENERIC'
 * @param {string} label    — display name (e.g. "Rebuilding Buddy")
 * @param {string[]} stages — override STAGES[type] if needed
 */
export function createTask(type = 'GENERIC', label = 'Processing…', stages) {
  if (_activeTask && !_activeTask.cancelled && !_activeTask.completed && !_activeTask.failed) {
    // Duplicate guard — return existing task's cancel handle
    console.warn('[AITaskManager] Task already active:', _activeTask.id);
    return { id: _activeTask.id, cancel: () => cancelTask(_activeTask.id), duplicate: true };
  }

  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const taskStages = stages || STAGES[type] || STAGES.GENERIC;
  const estimatedMs = estimateTotalMs(type);

  _activeTask = {
    id,
    type,
    label,
    stages:       taskStages,
    currentStage: taskStages[0],
    stageIndex:   0,
    pct:          0,
    startedAt:    Date.now(),
    estimatedMs,
    etaMs:        estimatedMs,
    completed:    false,
    failed:       false,
    cancelled:    false,
    errorMessage: null,
    stalling:     false,
  };

  // Hard timeout kill-switch — prevents any task hanging forever
  const killTimer = setTimeout(() => {
    if (_activeTask?.id === id && !_activeTask.completed && !_activeTask.cancelled) {
      failTask(id, 'Task timed out after 3 minutes. Please try again.');
    }
  }, TASK_TIMEOUT_MS);

  // Store kill timer so completeTask can clear it
  _activeTask._killTimer = killTimer;

  // Stall detection — if pct hasn't changed in 30s, show "Final optimisation…"
  let lastPct = 0;
  const stallTimer = setInterval(() => {
    if (!_activeTask || _activeTask.id !== id) { clearInterval(stallTimer); return; }
    if (_activeTask.pct === lastPct && !_activeTask.completed && !_activeTask.failed) {
      _activeTask.stalling = true;
      _activeTask.currentStage = 'Final optimisation in progress…';
      _notify();
    } else {
      lastPct = _activeTask.pct;
      _activeTask.stalling = false;
    }
  }, 30000);
  _activeTask._stallTimer = stallTimer;

  _notify();
  return { id, cancel: () => cancelTask(id), duplicate: false };
}

/**
 * Update task progress. pct: 0-100. stage: optional string override.
 */
export function updateProgress(id, pct, stage) {
  if (!_activeTask || _activeTask.id !== id) return;
  if (_activeTask.cancelled) return;

  const clampedPct = Math.min(100, Math.max(0, Math.round(pct)));

  // Advance to next preset stage based on pct
  const stages     = _activeTask.stages;
  const stageIdx   = Math.min(
    stages.length - 1,
    Math.floor((clampedPct / 100) * stages.length)
  );

  _activeTask.pct          = clampedPct;
  _activeTask.stageIndex   = stageIdx;
  _activeTask.currentStage = stage || stages[stageIdx];
  _activeTask.stalling     = false;
  _activeTask.etaMs        = computeETA(_activeTask);

  _notify();
}

/**
 * Mark task complete. Saves duration to history for future ETA calibration.
 */
export function completeTask(id) {
  if (!_activeTask || _activeTask.id !== id) return;
  const durationMs = Date.now() - _activeTask.startedAt;

  clearTimeout(_activeTask._killTimer);
  clearInterval(_activeTask._stallTimer);

  _activeTask.completed    = true;
  _activeTask.pct          = 100;
  _activeTask.currentStage = 'Complete';
  _activeTask.etaMs        = 0;

  // Save duration history for ETA calibration
  _taskHistory = [..._taskHistory.slice(-9), { type: _activeTask.type, durationMs }];
  try { localStorage.setItem(_LS_HISTORY, JSON.stringify(_taskHistory)); } catch {}

  _notify();

  // Auto-dismiss overlay after brief completion display (1.5s)
  setTimeout(() => {
    if (_activeTask?.id === id) {
      _activeTask = null;
      _notify();
    }
  }, 1500);
}

/**
 * Mark task failed. Shows error message in overlay.
 */
export function failTask(id, message = 'Something went wrong. Please try again.') {
  if (!_activeTask || _activeTask.id !== id) return;

  clearTimeout(_activeTask._killTimer);
  clearInterval(_activeTask._stallTimer);

  _activeTask.failed       = true;
  _activeTask.errorMessage = message;
  _activeTask.currentStage = 'AI setup interrupted. Safely recovering…';

  _notify();

  // Auto-dismiss after 4s recovery display
  setTimeout(() => {
    if (_activeTask?.id === id) {
      _activeTask = null;
      _notify();
    }
  }, 4000);
}

/**
 * Cancel a running task safely.
 */
export function cancelTask(id) {
  if (!_activeTask || _activeTask.id !== id) return;

  clearTimeout(_activeTask._killTimer);
  clearInterval(_activeTask._stallTimer);

  _activeTask.cancelled    = true;
  _activeTask.currentStage = 'Cancelled';

  _notify();

  setTimeout(() => {
    if (_activeTask?.id === id) {
      _activeTask = null;
      _notify();
    }
  }, 800);
}

/**
 * Get current active task snapshot (null if none).
 */
export function getActiveTask() {
  return _activeTask ? { ..._activeTask } : null;
}

/**
 * True if ANY non-terminal task is active.
 */
export function isTaskActive() {
  return !!_activeTask && !_activeTask.completed && !_activeTask.failed && !_activeTask.cancelled;
}
