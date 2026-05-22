/**
 * Immortail™ — Virtual Dog Canvas Renderer
 * State-driven, lightweight, no external deps.
 * All drawing is pure Canvas 2D — mobile GPU safe.
 */
import { DOG_COLOURS, DOG_STATES } from '../core/constants.js';

// ─── Default dog appearance ───────────────────────────────────────────────────
export const DEFAULT_APPEARANCE = {
  bodyColour:   '#C8860A',
  earColour:    '#A06808',
  noseColour:   '#2C1A08',
  eyeColour:    '#3D2B1A',
  bellyColour:  '#F0D090',
  tailColour:   '#C8860A',
  size:         1.0,        // scale factor 0.7–1.3
  earShape:     'floppy',   // 'floppy' | 'pointed' | 'folded'
  tailShape:    'wavy',     // 'wavy' | 'straight' | 'curly'
  bodyShape:    'medium',   // 'small' | 'medium' | 'large'
};

// ─── Animation state values ───────────────────────────────────────────────────
const ANIM = {
  tailAngle:    0,
  tailDir:      1,
  tailSpeed:    0.05,
  breathScale:  1,
  breathDir:    1,
  blinkTimer:   0,
  blinkOpen:    true,
  earAngle:     0,
  earDir:       1,
  walkOffset:   0,
  bounceY:      0,
  bounceDir:    1,
  // Emotional presence additions
  headTiltAngle: 0,
  headTiltDir:   1,
  headTiltActive:false,
  headTiltTimer: 0,
  eyeGazeX:     0,   // subtle eye tracking offset
  eyeGazeY:     0,
  eyeGazeTarget:{ x: 0, y: 0 },
  breathRhythm: 1.0, // 1=normal, 0.5=sleepy, 1.4=excited
  tailRestAngle:0,   // resting base offset varies
  idleVariance: 0,   // smooth noise for organic feel
  idleVarDir:   1,
  restingOffset:0,   // body drops slightly when sitting/sleeping
  restingDir:   1,
};

let _anim = { ...ANIM };
let _state = DOG_STATES.IDLE;
let _appearance = { ...DEFAULT_APPEARANCE };
let _raf = null;
let _canvas = null;
let _ctx    = null;

/**
 * Initialise the renderer on a canvas element.
 */
export function initRenderer(canvas, appearance = {}) {
  _canvas     = canvas;
  _ctx        = canvas.getContext('2d');
  _appearance = { ...DEFAULT_APPEARANCE, ...appearance };
  _anim       = { ...ANIM };
  startLoop();
}

/**
 * Destroy and stop rendering.
 */
export function destroyRenderer() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf    = null;
  _canvas = null;
  _ctx    = null;
}

/**
 * Set dog state (idle, happy, excited, sleeping, etc.)
 */
export function setDogState(state) {
  _state = state;
  switch (state) {
    case DOG_STATES.EXCITED:
      _anim.tailSpeed    = 0.18; _anim.bounceDir = 1;
      _anim.breathRhythm = 1.4; _anim.restingOffset = 0; break;
    case DOG_STATES.HAPPY:
      _anim.tailSpeed    = 0.10;
      _anim.breathRhythm = 1.1; _anim.restingOffset = 0; break;
    case DOG_STATES.SLEEPING:
      _anim.tailSpeed    = 0.008;
      _anim.breathRhythm = 0.45; _anim.restingOffset = 18; break;
    case DOG_STATES.SITTING:
      _anim.tailSpeed    = 0.04;
      _anim.breathRhythm = 0.75; _anim.restingOffset = 8; break;
    case DOG_STATES.LISTENING:
      _anim.tailSpeed    = 0.06;
      _anim.breathRhythm = 0.9;
      // Trigger head tilt
      _anim.headTiltActive = true;
      _anim.headTiltTimer  = 0; break;
    case DOG_STATES.IDLE:
    default:
      _anim.tailSpeed    = 0.05;
      _anim.breathRhythm = 1.0; _anim.restingOffset = 0;
      _anim.headTiltActive = false;
      break;
  }
  // Randomise tail resting angle per state change for organic variety
  _anim.tailRestAngle = (Math.random() - 0.5) * 0.15;
}

/**
 * Update appearance (called after AI config is generated).
 */
export function updateAppearance(app) {
  _appearance = { ...DEFAULT_APPEARANCE, ...app };
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function startLoop() {
  if (_raf) cancelAnimationFrame(_raf);
  const loop = () => {
    if (!_canvas || !_ctx) return;
    tick();
    draw();
    _raf = requestAnimationFrame(loop);
  };
  _raf = requestAnimationFrame(loop);
}

function tick() {
  // Tail wag
  _anim.tailAngle += _anim.tailDir * _anim.tailSpeed;
  if (Math.abs(_anim.tailAngle) > 0.45) _anim.tailDir *= -1;

  // Breathing — rhythm-aware
  const breathStep = 0.0008 * _anim.breathRhythm;
  _anim.breathScale += _anim.breathDir * breathStep;
  const breathMax = _state === DOG_STATES.SLEEPING ? 1.012 : 0.99 + 0.038 * _anim.breathRhythm;
  if (_anim.breathScale > breathMax || _anim.breathScale < 0.988) _anim.breathDir *= -1;

  // Resting body offset (sits/sleeps lower)
  if (_anim.restingOffset > 0) {
    _anim.restingDir = 1; // move toward resting
  } else {
    _anim.restingDir = -1;
  }

  // Blink
  _anim.blinkTimer++;
  if (_anim.blinkTimer > 200 && _anim.blinkOpen) {
    _anim.blinkOpen = false;
    setTimeout(() => { _anim.blinkOpen = true; _anim.blinkTimer = 0; }, 150);
  }

  // Ear twitch — organic speed variation
  const earSpeed = 0.006 + Math.abs(_anim.idleVariance) * 0.003;
  _anim.earAngle += _anim.earDir * earSpeed;
  if (Math.abs(_anim.earAngle) > 0.09) _anim.earDir *= -1;

  // Head tilt (listening, curious moments)
  if (_anim.headTiltActive) {
    _anim.headTiltTimer++;
    _anim.headTiltAngle = Math.sin(_anim.headTiltTimer * 0.02) * 0.18;
    if (_anim.headTiltTimer > 160) _anim.headTiltActive = false;
  } else {
    _anim.headTiltAngle *= 0.94; // spring back to 0
  }

  // Idle variance — perlin-like smooth randomness for organic feel
  _anim.idleVariance += _anim.idleVarDir * 0.004;
  if (Math.abs(_anim.idleVariance) > 1) _anim.idleVarDir *= -1;

  // Subtle eye gaze shift (every ~3s drift to slightly different point)
  _anim.eyeGazeX = Math.sin(Date.now() / 3100) * 1.5;
  _anim.eyeGazeY = Math.cos(Date.now() / 4200) * 1.0;

  // Excited bounce
  if (_state === DOG_STATES.EXCITED) {
    _anim.bounceY += _anim.bounceDir * 2.5;
    if (_anim.bounceY > 12 || _anim.bounceY < 0) _anim.bounceDir *= -1;
  } else {
    _anim.bounceY = 0;
  }
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function draw() {
  const W = _canvas.width;
  const H = _canvas.height;
  const a = _appearance;
  const scale = (a.size || 1) * Math.min(W, H) / 320;
  const cx = W / 2;
  const cy = H / 2 - _anim.bounceY;

  _ctx.clearRect(0, 0, W, H);
  _ctx.save();
  _ctx.translate(cx, cy);
  _ctx.scale(scale * _anim.breathScale, scale);

  // Drawing order: tail → body → legs → head → ears → face
  drawTail(a);
  drawLegs(a);
  drawBody(a);
  drawHead(a);
  drawEars(a);
  drawFace(a);

  _ctx.restore();

  // Sleeping Zs
  if (_state === DOG_STATES.SLEEPING) drawSleepZs(W, H);
}

function drawTail(a) {
  const angle = _anim.tailAngle * (_anim.tailDir > 0 ? 1 : -1);
  _ctx.save();
  _ctx.translate(60, -10);
  _ctx.rotate(angle + 0.3);
  _ctx.beginPath();
  _ctx.strokeStyle = a.tailColour;
  _ctx.lineWidth = 12;
  _ctx.lineCap = 'round';
  if (a.tailShape === 'curly') {
    _ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const x = t * 40 * Math.cos(t * Math.PI * 2);
      const y = -t * 40 * Math.sin(t * Math.PI);
      t === 0 ? _ctx.moveTo(x, y) : _ctx.lineTo(x, y);
    }
  } else {
    _ctx.moveTo(0, 0);
    _ctx.quadraticCurveTo(30, -30, 50, -10);
  }
  _ctx.stroke();
  _ctx.restore();
}

function drawLegs(a) {
  _ctx.fillStyle = a.bodyColour;
  const legPositions = [[-50, 30], [-20, 30], [20, 30], [50, 30]];
  legPositions.forEach(([x, y]) => {
    _ctx.beginPath();
    _ctx.roundRect(x - 8, y, 16, 40, 8);
    _ctx.fill();
    // Paw
    _ctx.fillStyle = darken(a.bodyColour, 20);
    _ctx.beginPath();
    _ctx.ellipse(x, y + 44, 10, 6, 0, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.fillStyle = a.bodyColour;
  });
}

function drawBody(a) {
  const bw = a.bodyShape === 'large' ? 130 : a.bodyShape === 'small' ? 90 : 110;
  const bh = a.bodyShape === 'large' ? 75  : a.bodyShape === 'small' ? 55  : 65;
  _ctx.fillStyle = a.bodyColour;
  _ctx.beginPath();
  _ctx.ellipse(0, 20, bw / 2, bh / 2, 0, 0, Math.PI * 2);
  _ctx.fill();
  // Belly
  _ctx.fillStyle = a.bellyColour;
  _ctx.beginPath();
  _ctx.ellipse(0, 30, bw / 4, bh / 3, 0, 0, Math.PI * 2);
  _ctx.fill();
}

function drawHead(a) {
  _ctx.save();
  _ctx.translate(-20, -55);
  _ctx.rotate(_anim.headTiltAngle);
  _ctx.fillStyle = a.bodyColour;
  _ctx.beginPath();
  _ctx.ellipse(0, 0, 45, 40, -0.1, 0, Math.PI * 2);
  _ctx.fill();
  _ctx.restore();
}

function drawEars(a) {
  _ctx.save();
  _ctx.translate(-20, -80);
  _ctx.rotate(_anim.earAngle);

  const earColour = a.earColour;
  if (a.earShape === 'floppy') {
    _ctx.fillStyle = earColour;
    // Left ear
    _ctx.save(); _ctx.translate(-30, 0);
    _ctx.beginPath();
    _ctx.ellipse(0, 15, 14, 25, -0.3, 0, Math.PI * 2);
    _ctx.fill(); _ctx.restore();
    // Right ear
    _ctx.save(); _ctx.translate(5, 0);
    _ctx.beginPath();
    _ctx.ellipse(0, 15, 14, 25, 0.3, 0, Math.PI * 2);
    _ctx.fill(); _ctx.restore();
  } else if (a.earShape === 'pointed') {
    _ctx.fillStyle = earColour;
    // Left
    _ctx.beginPath();
    _ctx.moveTo(-45, 0); _ctx.lineTo(-30, -30); _ctx.lineTo(-15, 0); _ctx.closePath(); _ctx.fill();
    // Right
    _ctx.beginPath();
    _ctx.moveTo(0, 0); _ctx.lineTo(15, -30); _ctx.lineTo(30, 0); _ctx.closePath(); _ctx.fill();
  } else {
    // Folded
    _ctx.fillStyle = earColour;
    _ctx.beginPath();
    _ctx.ellipse(-28, 8, 14, 18, -0.5, 0, Math.PI * 2); _ctx.fill();
    _ctx.beginPath();
    _ctx.ellipse(2, 8, 14, 18, 0.5, 0, Math.PI * 2); _ctx.fill();
  }
  _ctx.restore();
}

function drawFace(a) {
  // Eyes
  const eyeY = -60;
  const eyeOpenRatio = _anim.blinkOpen ? 1 : 0.05;

  [-35, -5].forEach(ex => {
    const gazeX = _anim.eyeGazeX;
    const gazeY = _anim.eyeGazeY;
    // White
    _ctx.fillStyle = '#fff';
    _ctx.beginPath();
    _ctx.ellipse(ex, eyeY, 9, 9 * eyeOpenRatio, 0, 0, Math.PI * 2);
    _ctx.fill();
    // Iris — shifts with gaze
    _ctx.fillStyle = a.eyeColour;
    _ctx.beginPath();
    _ctx.ellipse(ex + gazeX, eyeY + gazeY, 5, 5 * eyeOpenRatio, 0, 0, Math.PI * 2);
    _ctx.fill();
    // Pupil
    _ctx.fillStyle = '#111';
    _ctx.beginPath();
    _ctx.ellipse(ex + gazeX, eyeY + gazeY, 2.5, 2.5 * eyeOpenRatio, 0, 0, Math.PI * 2);
    _ctx.fill();
    // Shine
    _ctx.fillStyle = 'rgba(255,255,255,0.7)';
    _ctx.beginPath();
    _ctx.ellipse(ex + gazeX + 2, eyeY + gazeY - 2, 1.5, 1.5, 0, 0, Math.PI * 2);
    _ctx.fill();
  });

  // Nose
  _ctx.fillStyle = a.noseColour;
  _ctx.beginPath();
  _ctx.ellipse(-20, -40, 10, 7, 0, 0, Math.PI * 2);
  _ctx.fill();

  // Mouth
  _ctx.strokeStyle = a.noseColour;
  _ctx.lineWidth = 2.5;
  _ctx.lineCap = 'round';
  _ctx.beginPath();
  _ctx.moveTo(-20, -33);
  _ctx.quadraticCurveTo(-28, -26, -30, -24);
  _ctx.moveTo(-20, -33);
  _ctx.quadraticCurveTo(-12, -26, -10, -24);
  _ctx.stroke();

  // Happy state — tongue
  if (_state === DOG_STATES.HAPPY || _state === DOG_STATES.EXCITED) {
    _ctx.fillStyle = '#E88090';
    _ctx.beginPath();
    _ctx.ellipse(-20, -18, 8, 10, 0, 0, Math.PI * 2);
    _ctx.fill();
  }
}

function drawSleepZs(W, H) {
  _ctx.font = 'bold 18px serif';
  _ctx.fillStyle = 'rgba(201,168,76,0.6)';
  const t = Date.now() / 1000;
  _ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 1.2);
  _ctx.fillText('z', W * 0.65, H * 0.3);
  _ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 0.8 + 1);
  _ctx.font = 'bold 24px serif';
  _ctx.fillText('z', W * 0.72, H * 0.22);
  _ctx.globalAlpha = 1;
}

// ─── Colour utility ───────────────────────────────────────────────────────────
function darken(hex, amount = 30) {
  let r = parseInt(hex.slice(1, 3), 16) - amount;
  let g = parseInt(hex.slice(3, 5), 16) - amount;
  let b = parseInt(hex.slice(5, 7), 16) - amount;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Build appearance config from dog profile + AI config.
 */
export function buildAppearanceFromConfig(profile, aiConfig) {
  const colourHex = DOG_COLOURS.find(c => c.id === profile?.colour)?.hex || '#C8860A';
  const base = {
    bodyColour:  colourHex,
    earColour:   darken(colourHex, 25),
    tailColour:  colourHex,
    bellyColour: lighten(colourHex, 40),
    noseColour:  '#2C1A08',
    eyeColour:   '#3D2B1A',
    size:        1.0,
    earShape:    'floppy',
    tailShape:   'wavy',
    bodyShape:   'medium',
  };
  if (!aiConfig) return base;
  return {
    ...base,
    ...(aiConfig.appearance || {}),
    earShape:  aiConfig.appearance?.earShape  || base.earShape,
    tailShape: aiConfig.appearance?.tailShape || base.tailShape,
    bodyShape: aiConfig.appearance?.bodyShape || base.bodyShape,
    size:      aiConfig.appearance?.size      || base.size,
  };
}

function lighten(hex, amount = 30) {
  let r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  let g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  let b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
