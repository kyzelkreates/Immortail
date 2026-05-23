/**
 * Immortail™ — AI Task Overlay  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinematic fullscreen overlay shown during long-running AI tasks.
 * Blocks user interaction while critical tasks run.
 * Unmounts cleanly when task completes or fails.
 *
 * Design: luxury, calm, emotionally safe. Apple/OpenAI-level polish.
 * No harsh animations. No progress bars that stall. Always feels alive.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAITask } from '../../system/useAITask.js';
import { formatETA } from '../../system/aiTaskManager.js';

// ── Floating orb config ────────────────────────────────────────────────────────
const ORBS = [
  { size: 280, x: '15%',  y: '20%', delay: 0,    dur: 12 },
  { size: 200, x: '70%',  y: '55%', delay: 2,    dur: 15 },
  { size: 160, x: '40%',  y: '75%', delay: 1.5,  dur: 10 },
  { size: 120, x: '80%',  y: '10%', delay: 3,    dur: 14 },
  { size:  90, x: '5%',   y: '65%', delay: 0.8,  dur: 11 },
];

// Stage text rotates with a soft fade
function StageText({ text }) {
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={text}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="text-immortail-soft text-sm text-center leading-relaxed max-w-xs mx-auto"
      >
        {text}
      </motion.p>
    </AnimatePresence>
  );
}

export default function AITaskOverlay() {
  const { task, isActive, isFailed, isCompleted } = useAITask();
  const visible = !!task;

  // Smoothed progress — never jumps backward, interpolates forward gently
  const [smoothPct, setSmoothPct]   = useState(0);
  const [etaLabel,  setEtaLabel]    = useState(null);
  const smoothRef  = useRef(0);
  const etaRef     = useRef(null);
  const tickRef    = useRef(null);

  // Reset smoothPct when a new task starts
  useEffect(() => {
    if (!task) { smoothRef.current = 0; setSmoothPct(0); return; }
    if (task.pct === 0) { smoothRef.current = 0; setSmoothPct(0); }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth progress interpolation ticker (runs every 200ms)
  useEffect(() => {
    if (!visible) { clearInterval(tickRef.current); return; }

    tickRef.current = setInterval(() => {
      const target = task?.pct ?? 0;
      const current = smoothRef.current;
      // Move 15% of the gap each tick — feels alive, never stalls
      const next = current + (target - current) * 0.15 + 0.2;
      const clamped = Math.min(target + 2, Math.max(current, next)); // never overshoot target by more than 2%
      smoothRef.current = clamped;
      setSmoothPct(Math.min(100, clamped));
    }, 200);

    return () => clearInterval(tickRef.current);
  }, [visible, task?.pct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ETA countdown (independent of progress — ticks every second)
  useEffect(() => {
    if (!isActive) { clearInterval(etaRef.current); setEtaLabel(null); return; }

    const tick = () => {
      if (!task?.etaMs) { setEtaLabel(null); return; }
      const eta = formatETA(task.etaMs - (Date.now() - (task.startedAt + (task.etaMs - task.etaMs))));
      // Compute live ETA from task startedAt + estimatedMs
      const elapsed  = Date.now() - task.startedAt;
      const pct      = task.pct || 1;
      const totalEst = (elapsed / pct) * 100;
      const remaining = Math.max(0, totalEst - elapsed);
      setEtaLabel(formatETA(remaining));
    };

    tick();
    etaRef.current = setInterval(tick, 1000);
    return () => clearInterval(etaRef.current);
  }, [isActive, task?.pct, task?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ pointerEvents: isActive ? 'all' : 'none' }}
          aria-live="polite"
          aria-label={task?.currentStage || 'AI processing'}
        >
          {/* ── Background ─────────────────────────────────────────────── */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 30% 40%, #0D0A1A 0%, #08060F 60%, #04030A 100%)',
            }}
          />

          {/* ── Animated ambient orbs ──────────────────────────────────── */}
          {ORBS.map((orb, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                width:  orb.size,
                height: orb.size,
                left:   orb.x,
                top:    orb.y,
                background: isFailed
                  ? 'radial-gradient(circle, rgba(220,60,60,0.07) 0%, transparent 70%)'
                  : isCompleted
                  ? 'radial-gradient(circle, rgba(80,220,120,0.06) 0%, transparent 70%)'
                  : i % 2 === 0
                  ? 'radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(140,100,200,0.05) 0%, transparent 70%)',
                filter: 'blur(40px)',
              }}
              animate={{
                x:       [0, (i % 2 === 0 ? 1 : -1) * 20, 0],
                y:       [0, (i % 3 === 0 ? 1 : -1) * 15, 0],
                opacity: [0.6, 1, 0.6],
                scale:   [1, 1.05, 1],
              }}
              transition={{
                duration:   orb.dur,
                delay:      orb.delay,
                repeat:     Infinity,
                ease:       'easeInOut',
              }}
            />
          ))}

          {/* ── Holographic grid (subtle) ─────────────────────────────── */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(201,168,76,0.3) 1px, transparent 1px),
                linear-gradient(90deg, rgba(201,168,76,0.3) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />

          {/* ── Content ────────────────────────────────────────────────── */}
          <div className="relative z-10 flex flex-col items-center gap-8 px-8 w-full max-w-sm">

            {/* Logo / status icon */}
            <motion.div
              animate={isFailed
                ? { scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }
                : isCompleted
                ? { scale: 1, opacity: 1 }
                : {
                    scale:   [1, 1.08, 1],
                    opacity: [0.8, 1, 0.8],
                    rotate:  [0, 2, -2, 0],
                  }
              }
              transition={{ duration: 3, repeat: isFailed || isCompleted ? 0 : Infinity, ease: 'easeInOut' }}
              className="text-6xl select-none"
              style={{ filter: 'drop-shadow(0 0 24px rgba(201,168,76,0.3))' }}
            >
              {isFailed ? '⚠️' : isCompleted ? '✅' : '🐾'}
            </motion.div>

            {/* Title */}
            <div className="text-center space-y-1">
              <motion.h2
                className="font-display text-xl text-immortail-cream"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {isFailed
                  ? 'AI setup interrupted'
                  : isCompleted
                  ? 'Reconstruction complete'
                  : 'IMMORTAIL AI is working…'
                }
              </motion.h2>
              <motion.p
                className="text-xs text-immortail-soft/50 uppercase tracking-widest"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {task?.label || 'Processing'}
              </motion.p>
            </div>

            {/* Stage text */}
            <div className="min-h-[40px] flex items-center">
              {isFailed ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center space-y-2"
                >
                  <p className="text-red-400/80 text-sm text-center">
                    {task?.errorMessage || 'Something went wrong.'}
                  </p>
                  <p className="text-immortail-soft/50 text-xs text-center">
                    Safely recovering — your memories are safe.
                  </p>
                </motion.div>
              ) : isCompleted ? (
                <motion.p
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-immortail-gold text-sm text-center"
                >
                  {task?.currentStage}
                </motion.p>
              ) : (
                <StageText text={task?.currentStage || '…'} />
              )}
            </div>

            {/* Progress bar */}
            {!isFailed && (
              <div className="w-full space-y-3">
                <div className="relative h-0.5 rounded-full overflow-hidden bg-white/8">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width:      `${smoothPct}%`,
                      background: isCompleted
                        ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                        : 'linear-gradient(90deg, #C9A84C, #E8C76A, #C9A84C)',
                      backgroundSize: '200% 100%',
                    }}
                    animate={isCompleted ? {} : { backgroundPosition: ['0% 0%', '100% 0%', '0% 0%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  />
                  {/* Shimmer */}
                  {!isCompleted && (
                    <motion.div
                      className="absolute inset-y-0 w-8 rounded-full"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }}
                      animate={{ left: ['-2rem', '105%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear', repeatDelay: 0.5 }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-immortail-soft/40 font-mono">
                    {Math.round(smoothPct)}%
                  </span>
                  {etaLabel && isActive && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-immortail-soft/40"
                    >
                      {task?.stalling
                        ? 'Final optimisation in progress…'
                        : `Est. ${etaLabel} remaining`
                      }
                    </motion.span>
                  )}
                </div>
              </div>
            )}

            {/* Particle field — 5 floating dots */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-immortail-gold/30"
                  style={{ left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 25}%` }}
                  animate={{
                    y:       [0, -12 - i * 4, 0],
                    opacity: [0, 0.6, 0],
                    scale:   [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration:    2.5 + i * 0.4,
                    delay:       i * 0.5,
                    repeat:      Infinity,
                    ease:        'easeInOut',
                  }}
                />
              ))}
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
