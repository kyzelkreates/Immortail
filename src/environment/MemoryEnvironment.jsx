/**
 * Immortail™ — Memory Environment
 * The immersive background environment the virtual dog lives in.
 * Supports: day, dusk, night, rain modes with ambient particles/effects.
 */
import { useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ENV_MODES } from '../core/constants.js';

const ENV_CONFIG = {
  [ENV_MODES.DAY]: {
    bg:        'linear-gradient(180deg, #3A5A8C 0%, #7EB0D4 40%, #D4A96A 80%, #8B6914 100%)',
    floorBg:   '#8B7355',
    ambience:  'rgba(255,220,150,0.12)',
    particles: 'rgba(255,255,200,0.6)',
    label:     '☀️ Day',
  },
  [ENV_MODES.DUSK]: {
    bg:        'linear-gradient(180deg, #1A0A2E 0%, #4A1A5C 30%, #C4603A 65%, #8B4A1A 100%)',
    floorBg:   '#5C3D1A',
    ambience:  'rgba(200,100,50,0.15)',
    particles: 'rgba(255,180,100,0.5)',
    label:     '🌅 Dusk',
  },
  [ENV_MODES.NIGHT]: {
    bg:        'linear-gradient(180deg, #050510 0%, #0D0D2A 50%, #1A1A3A 100%)',
    floorBg:   '#1A1A2E',
    ambience:  'rgba(100,100,200,0.08)',
    particles: 'rgba(200,200,255,0.4)',
    label:     '🌙 Night',
  },
  [ENV_MODES.RAIN]: {
    bg:        'linear-gradient(180deg, #1A2A3A 0%, #2A3A4A 50%, #3A4A5A 100%)',
    floorBg:   '#2A3A3A',
    ambience:  'rgba(100,150,200,0.12)',
    particles: 'rgba(180,220,255,0.5)',
    label:     '🌧️ Rain',
    special:   'rain',
  },
  [ENV_MODES.SUNSET]: {
    bg:        'linear-gradient(180deg, #2A1A0A 0%, #8C3A10 25%, #E8701A 55%, #F4A830 75%, #C88820 100%)',
    floorBg:   '#6B3A10',
    ambience:  'rgba(240,140,60,0.18)',
    particles: 'rgba(255,200,100,0.55)',
    label:     '🌇 Sunset',
  },
  [ENV_MODES.FIREPLACE]: {
    bg:        'linear-gradient(180deg, #0A0604 0%, #1A0E06 50%, #2A180A 100%)',
    floorBg:   '#1A1008',
    ambience:  'rgba(200,80,20,0.14)',
    particles: 'rgba(255,140,60,0.45)',
    label:     '🔥 Fireplace',
    special:   'fire',
  },
  [ENV_MODES.SNOW]: {
    bg:        'linear-gradient(180deg, #8AA8C0 0%, #B8CCE0 40%, #D8E8F0 80%, #E8F0F8 100%)',
    floorBg:   '#C8DCE8',
    ambience:  'rgba(180,210,240,0.15)',
    particles: 'rgba(255,255,255,0.8)',
    label:     '❄️ Snow',
    special:   'snow',
  },
  [ENV_MODES.WOODLAND]: {
    bg:        'linear-gradient(180deg, #1A3010 0%, #2A5020 30%, #3A6828 60%, #4A7830 100%)',
    floorBg:   '#2A4818',
    ambience:  'rgba(80,160,60,0.12)',
    particles: 'rgba(180,240,140,0.45)',
    label:     '🌲 Woodland',
  },
  [ENV_MODES.BEACH]: {
    bg:        'linear-gradient(180deg, #2A7AAC 0%, #4AAAD4 35%, #7ACCEE 65%, #F4E0A8 80%, #C8A858 100%)',
    floorBg:   '#D4B870',
    ambience:  'rgba(100,200,220,0.12)',
    particles: 'rgba(255,255,220,0.55)',
    label:     '🏖️ Beach',
    special:   'beach',
  },
  [ENV_MODES.GOLDEN]: {
    bg:        'linear-gradient(180deg, #1A2A40 0%, #4A6A90 25%, #D4A060 60%, #F0C870 80%, #C8A840 100%)',
    floorBg:   '#8B7030',
    ambience:  'rgba(220,170,80,0.18)',
    particles: 'rgba(255,230,150,0.6)',
    label:     '✨ Golden Hour',
  },
};

export default function MemoryEnvironment({ mode = ENV_MODES.DAY, children, className = '' }) {
  const config = ENV_CONFIG[mode] || ENV_CONFIG[ENV_MODES.DAY];

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: config.bg }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: config.ambience }}
      />

      {/* Particles */}
      <EnvironmentParticles mode={mode} color={config.particles} />

      {/* Rain effect */}
      {mode === ENV_MODES.RAIN && <RainEffect />}

      {/* Stars (night) */}
      {mode === ENV_MODES.NIGHT && <StarField />}

      {/* Floor */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 rounded-t-[50%]"
        style={{ background: config.floorBg, opacity: 0.7 }}
      />

      {/* Fire flicker (fireplace) */}
      {mode === ENV_MODES.FIREPLACE && <FireEffect />}

      {/* Snow fall */}
      {mode === ENV_MODES.SNOW && <SnowEffect />}

      {/* Beach waves */}
      {mode === ENV_MODES.BEACH && <BeachEffect />}

      {/* Content */}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

// ─── Particles ────────────────────────────────────────────────────────────────
function EnvironmentParticles({ mode, color }) {
  const particles = useMemo(() => {
    const count = mode === ENV_MODES.NIGHT ? 0 : 8;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 5 + i * 12,
      delay: i * 0.5,
      dur: 3 + (i % 3),
      size: 2 + (i % 3),
    }));
  }, [mode]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: '20%',
            width:  p.size,
            height: p.size,
            background: color,
          }}
          animate={{ y: [-20, -80, -20], opacity: [0, 0.8, 0] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ─── Rain ─────────────────────────────────────────────────────────────────────
function RainEffect() {
  const drops = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i, x: (i * 3.3) % 100, delay: (i * 0.1) % 1.5, dur: 0.6 + (i % 4) * 0.1,
  })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {drops.map(d => (
        <motion.div
          key={d.id}
          className="absolute w-px bg-blue-300/30"
          style={{ left: `${d.x}%`, height: 12 }}
          animate={{ y: ['-5%', '110%'] }}
          transition={{ duration: d.dur, repeat: Infinity, delay: d.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function StarField() {
  const stars = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: (i * 2.5) % 100,
    y: (i * 3.1) % 60,
    size: 1 + (i % 3),
    delay: i * 0.1,
  })), []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map(s => (
        <motion.div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 2 + s.delay, repeat: Infinity, delay: s.delay }}
        />
      ))}
    </div>
  );
}

// ─── Fire flicker ─────────────────────────────────────────────────────────────
function FireEffect() {
  const embers = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: 10 + (i * 6.5) % 80,
    delay: i * 0.3 % 2,
    dur: 1.2 + (i % 5) * 0.25,
    size: 2 + (i % 4),
  })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Warm glow from bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3"
           style={{ background: 'linear-gradient(0deg, rgba(220,80,10,0.25) 0%, transparent 100%)' }} />
      {embers.map(e => (
        <motion.div
          key={e.id}
          className="absolute rounded-full"
          style={{ left: `${e.x}%`, bottom: '5%', width: e.size, height: e.size,
                   background: e.id % 3 === 0 ? '#FF9040' : '#FF6020' }}
          animate={{ y: [0, -60 - e.size * 8], x: [0, (e.id % 2 ? 12 : -12)],
                     opacity: [0.9, 0.6, 0], scale: [1, 0.6, 0] }}
          transition={{ duration: e.dur, repeat: Infinity, delay: e.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

// ─── Snow fall ────────────────────────────────────────────────────────────────
function SnowEffect() {
  const flakes = useMemo(() => Array.from({ length: 25 }, (_, i) => ({
    id: i,
    x: (i * 4) % 100,
    delay: (i * 0.18) % 3,
    dur: 3.5 + (i % 5) * 0.5,
    size: 2 + (i % 3),
    drift: (i % 2 ? 15 : -15),
  })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {flakes.map(f => (
        <motion.div
          key={f.id}
          className="absolute rounded-full bg-white/80"
          style={{ left: `${f.x}%`, top: '-4%', width: f.size, height: f.size }}
          animate={{ y: '110%', x: [0, f.drift, 0] }}
          transition={{ duration: f.dur, repeat: Infinity, delay: f.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

// ─── Beach waves ──────────────────────────────────────────────────────────────
function BeachEffect() {
  const waveRef = useRef(null);
  useEffect(() => {
    const el = waveRef.current;
    if (!el) return;
    // gentle CSS animation via keyframe
    el.style.animation = 'beachWave 4s ease-in-out infinite';
  }, []);

  return (
    <>
      <style>{`
        @keyframes beachWave {
          0%,100% { transform: scaleX(1) translateX(0); opacity: 0.35; }
          50%      { transform: scaleX(1.04) translateX(-2%); opacity: 0.5; }
        }
      `}</style>
      <div className="absolute bottom-8 left-0 right-0 pointer-events-none overflow-hidden h-10">
        <div ref={waveRef}
             className="absolute left-0 right-0 h-6 rounded-full"
             style={{ background: 'rgba(100,200,220,0.30)', bottom: 0 }} />
        <motion.div
          className="absolute left-0 right-0 h-4 rounded-full"
          style={{ background: 'rgba(140,220,240,0.22)', bottom: 4 }}
          animate={{ x: ['-3%', '3%', '-3%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </>
  );
}
