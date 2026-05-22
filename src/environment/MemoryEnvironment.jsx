/**
 * Immortail™ — Memory Environment
 * ─────────────────────────────────────────────────────────────────────────────
 * The immersive background environment the virtual dog lives in.
 * 10 atmospheric modes with cross-fade transitions.
 *
 * Enhanced:
 *   - AnimatePresence cross-fade when mode changes (no hard cut)
 *   - Ambient glow reacts to emotional environment
 *   - Each environment has a distinct floor texture gradient
 *   - Lighting: warm environments cast warmer glows, night is cold
 */
import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ENV_MODES } from '../core/constants.js';

// ── Environment configuration ─────────────────────────────────────────────────
const ENV_CONFIG = {
  [ENV_MODES.DAY]: {
    bg:       'linear-gradient(180deg, #3A5A8C 0%, #7EB0D4 38%, #C8D8A0 72%, #8B7040 100%)',
    floor:    'linear-gradient(0deg, #6B5530 0%, #8B7355 60%, transparent 100%)',
    ambience: 'rgba(255,220,150,0.10)',
    particles:'rgba(255,255,180,0.55)',
    label:    '☀️ Day',
  },
  [ENV_MODES.DUSK]: {
    bg:       'linear-gradient(180deg, #1A0A2E 0%, #4A1A5C 28%, #C4603A 62%, #7B3A0A 100%)',
    floor:    'linear-gradient(0deg, #3A1A08 0%, #5C3010 60%, transparent 100%)',
    ambience: 'rgba(200,100,50,0.13)',
    particles:'rgba(255,180,100,0.50)',
    label:    '🌅 Dusk',
  },
  [ENV_MODES.NIGHT]: {
    bg:       'linear-gradient(180deg, #04040F 0%, #0D0D2A 50%, #151530 100%)',
    floor:    'linear-gradient(0deg, #10102A 0%, #1A1A38 60%, transparent 100%)',
    ambience: 'rgba(80,80,180,0.07)',
    particles:'rgba(200,200,255,0.35)',
    label:    '🌙 Night',
  },
  [ENV_MODES.RAIN]: {
    bg:       'linear-gradient(180deg, #121E28 0%, #1E2E3A 50%, #2A3A48 100%)',
    floor:    'linear-gradient(0deg, #182030 0%, #243040 60%, transparent 100%)',
    ambience: 'rgba(80,130,180,0.10)',
    particles:'rgba(160,210,255,0.45)',
    label:    '🌧️ Rain',
    special:  'rain',
  },
  [ENV_MODES.SUNSET]: {
    bg:       'linear-gradient(180deg, #200E04 0%, #7A2E08 22%, #D8600A 50%, #F0A020 75%, #B87818 100%)',
    floor:    'linear-gradient(0deg, #4A2008 0%, #7A3A10 60%, transparent 100%)',
    ambience: 'rgba(240,140,60,0.16)',
    particles:'rgba(255,200,100,0.55)',
    label:    '🌇 Sunset',
  },
  [ENV_MODES.FIREPLACE]: {
    bg:       'linear-gradient(180deg, #080402 0%, #160A04 50%, #200E06 100%)',
    floor:    'linear-gradient(0deg, #120803 0%, #1E100A 60%, transparent 100%)',
    ambience: 'rgba(190,70,15,0.12)',
    particles:'rgba(255,130,50,0.40)',
    label:    '🔥 Fireplace',
    special:  'fire',
  },
  [ENV_MODES.SNOW]: {
    bg:       'linear-gradient(180deg, #7090A8 0%, #A0BCD0 38%, #C8DCE8 72%, #D8E8F4 100%)',
    floor:    'linear-gradient(0deg, #B0CCE0 0%, #CCDDE8 60%, transparent 100%)',
    ambience: 'rgba(180,210,240,0.12)',
    particles:'rgba(255,255,255,0.80)',
    label:    '❄️ Snow',
    special:  'snow',
  },
  [ENV_MODES.WOODLAND]: {
    bg:       'linear-gradient(180deg, #0E1E08 0%, #1A3210 28%, #284820 58%, #386830 100%)',
    floor:    'linear-gradient(0deg, #183010 0%, #224020 60%, transparent 100%)',
    ambience: 'rgba(70,150,50,0.10)',
    particles:'rgba(160,240,120,0.40)',
    label:    '🌲 Woodland',
  },
  [ENV_MODES.BEACH]: {
    bg:       'linear-gradient(180deg, #1A6898 0%, #3890C0 33%, #60C0E0 62%, #E8D090 80%, #C0980A 100%)',
    floor:    'linear-gradient(0deg, #A07808 0%, #C8A030 60%, transparent 100%)',
    ambience: 'rgba(80,190,210,0.10)',
    particles:'rgba(255,255,200,0.50)',
    label:    '🏖️ Beach',
    special:  'beach',
  },
  [ENV_MODES.GOLDEN]: {
    bg:       'linear-gradient(180deg, #0E1820 0%, #304460 22%, #C89040 58%, #E8B850 78%, #B88820 100%)',
    floor:    'linear-gradient(0deg, #705010 0%, #987030 60%, transparent 100%)',
    ambience: 'rgba(210,160,70,0.16)',
    particles:'rgba(255,230,140,0.60)',
    label:    '✨ Golden Hour',
  },
};

export default function MemoryEnvironment({ mode = ENV_MODES.DAY, children, className = '', style }) {
  const config = ENV_CONFIG[mode] || ENV_CONFIG[ENV_MODES.DAY];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* ── Background cross-fade layer ─────────────────────────────────── */}
      <AnimatePresence mode="sync">
        <motion.div
          key={mode}
          className="absolute inset-0"
          style={{ background: config.bg }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        />
      </AnimatePresence>

      {/* ── Ambient glow (cross-fades too) ──────────────────────────────── */}
      <AnimatePresence mode="sync">
        <motion.div
          key={mode + '_amb'}
          className="absolute inset-0 pointer-events-none"
          style={{ background: config.ambience }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        />
      </AnimatePresence>

      {/* ── Particles (mode-keyed so they reset on change) ──────────────── */}
      <EnvironmentParticles mode={mode} color={config.particles} />

      {/* ── Special effects ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {mode === ENV_MODES.RAIN      && <RainEffect  key="rain"  />}
        {mode === ENV_MODES.NIGHT     && <StarField   key="stars" />}
        {mode === ENV_MODES.FIREPLACE && <FireEffect  key="fire"  />}
        {mode === ENV_MODES.SNOW      && <SnowEffect  key="snow"  />}
        {mode === ENV_MODES.BEACH     && <BeachEffect key="beach" />}
      </AnimatePresence>

      {/* ── Floor ─────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="sync">
        <motion.div
          key={mode + '_floor'}
          className="absolute bottom-0 left-0 right-0 h-20"
          style={{ background: config.floor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.85 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.0 }}
        />
      </AnimatePresence>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

// ── Particles ─────────────────────────────────────────────────────────────────
function EnvironmentParticles({ mode, color }) {
  const particles = useMemo(() => {
    if (mode === ENV_MODES.NIGHT) return [];
    const count = mode === ENV_MODES.RAIN || mode === ENV_MODES.SNOW ? 0 : 7;
    return Array.from({ length: count }, (_, i) => ({
      id:    i,
      x:     6 + i * 13,
      delay: i * 0.55,
      dur:   3.2 + (i % 3) * 0.8,
      size:  1.5 + (i % 3),
      drift: (i % 2 ? 10 : -10),
    }));
  }, [mode]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, bottom: '22%', width: p.size, height: p.size, background: color }}
          animate={{ y: [-15, -70, -15], x: [0, p.drift, 0], opacity: [0, 0.75, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Rain ──────────────────────────────────────────────────────────────────────
function RainEffect() {
  const drops = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    id: i, x: (i * 3.1) % 100,
    delay: (i * 0.09) % 1.4,
    dur:   0.55 + (i % 5) * 0.08,
    h:     8 + (i % 5) * 2,
    lean:  2 + (i % 3),
  })), []);

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {drops.map(d => (
        <motion.div
          key={d.id}
          className="absolute bg-blue-300/25"
          style={{
            left: `${d.x}%`, height: d.h,
            width: 1,
            transform: `rotate(${d.lean}deg)`,
          }}
          animate={{ y: ['-5%', '110%'] }}
          transition={{ duration: d.dur, repeat: Infinity, delay: d.delay, ease: 'linear' }}
        />
      ))}
      {/* Rain mist at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-10"
           style={{ background: 'linear-gradient(0deg,rgba(100,150,200,0.15) 0%,transparent 100%)' }} />
    </motion.div>
  );
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function StarField() {
  const stars = useMemo(() => Array.from({ length: 45 }, (_, i) => ({
    id: i,
    x: (i * 2.3 + 1) % 100,
    y: (i * 2.9 + 2) % 62,
    size: 1 + (i % 3) * 0.7,
    delay: i * 0.08,
    dur: 1.8 + (i % 5) * 0.5,
  })), []);

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      {stars.map(s => (
        <motion.div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0.15, 0.95, 0.15] }}
          transition={{ duration: s.dur, repeat: Infinity, delay: s.delay }}
        />
      ))}
      {/* Moon */}
      <div
        className="absolute rounded-full bg-white/85"
        style={{ right: '14%', top: '8%', width: 18, height: 18,
                 boxShadow: '0 0 18px rgba(220,230,255,0.4)' }}
      />
    </motion.div>
  );
}

// ── Fire flicker ──────────────────────────────────────────────────────────────
function FireEffect() {
  const embers = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    id: i,
    x: 12 + (i * 5.8) % 76,
    delay: (i * 0.22) % 2.2,
    dur: 1.1 + (i % 6) * 0.22,
    size: 2 + (i % 4),
    hue: i % 3,
  })), []);

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0 }}
    >
      {/* Glow base */}
      <div className="absolute bottom-0 left-0 right-0 h-2/5"
           style={{ background: 'linear-gradient(0deg,rgba(200,70,10,0.22) 0%,rgba(200,70,10,0.05) 60%,transparent 100%)' }} />
      {/* Warm ceiling bounce */}
      <div className="absolute top-0 left-0 right-0 h-1/4"
           style={{ background: 'linear-gradient(180deg,rgba(160,50,5,0.08) 0%,transparent 100%)' }} />

      {embers.map(e => {
        const col = e.hue === 0 ? '#FF9040' : e.hue === 1 ? '#FF6020' : '#FFBB30';
        return (
          <motion.div
            key={e.id}
            className="absolute rounded-full"
            style={{ left: `${e.x}%`, bottom: '4%', width: e.size, height: e.size, background: col }}
            animate={{ y: [0, -(55 + e.size * 10)], x: [0, (e.id % 2 ? 14 : -14)],
                       opacity: [0.95, 0.5, 0], scale: [1, 0.5, 0] }}
            transition={{ duration: e.dur, repeat: Infinity, delay: e.delay, ease: 'easeOut' }}
          />
        );
      })}
    </motion.div>
  );
}

// ── Snow ──────────────────────────────────────────────────────────────────────
function SnowEffect() {
  const flakes = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    x: (i * 3.7) % 100,
    delay: (i * 0.16) % 3.5,
    dur: 4 + (i % 6) * 0.6,
    size: 1.5 + (i % 4) * 0.8,
    drift: (i % 2 ? 18 : -18),
  })), []);

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
    >
      {flakes.map(f => (
        <motion.div
          key={f.id}
          className="absolute rounded-full bg-white/85"
          style={{ left: `${f.x}%`, top: '-3%', width: f.size, height: f.size }}
          animate={{ y: '112%', x: [0, f.drift, 0] }}
          transition={{ duration: f.dur, repeat: Infinity, delay: f.delay, ease: 'linear' }}
        />
      ))}
    </motion.div>
  );
}

// ── Beach waves ───────────────────────────────────────────────────────────────
function BeachEffect() {
  return (
    <motion.div
      className="absolute bottom-6 left-0 right-0 pointer-events-none overflow-hidden h-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0 }}
    >
      {/* Two wave layers for depth */}
      <motion.div
        className="absolute left-0 right-0 h-6 rounded-[50%]"
        style={{ background: 'rgba(100,200,220,0.28)', bottom: 2 }}
        animate={{ x: ['-2%', '2%', '-2%'], scaleY: [1, 1.12, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute left-0 right-0 h-4 rounded-[50%]"
        style={{ background: 'rgba(150,220,240,0.20)', bottom: 6 }}
        animate={{ x: ['2%', '-2%', '2%'], scaleY: [1, 0.9, 1] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
    </motion.div>
  );
}
