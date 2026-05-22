/**
 * Immortail™ — Virtual Dog Canvas Renderer
 * ─────────────────────────────────────────────────────────────────────────────
 * State-driven, procedural, emotionally alive.
 * All drawing is pure Canvas 2D — mobile GPU safe.
 * No external deps. No game engine. No GPU-heavy systems.
 *
 * Architecture:
 *   - Single shared RAF loop (no duplicates)
 *   - Procedural animation blending via lerp
 *   - All state transitions are smooth (no hard cuts)
 *   - Performance-safe: pauses on hidden tabs, throttles on low FPS
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
  size:         1.0,
  earShape:     'floppy',   // 'floppy' | 'pointed' | 'folded'
  tailShape:    'wavy',     // 'wavy' | 'straight' | 'curly'
  bodyShape:    'medium',   // 'small' | 'medium' | 'large'
};

// ─── Blended animation state ──────────────────────────────────────────────────
// All values are live (tick-updated). Transitions lerp smoothly.
const ANIM_DEFAULTS = {
  // Tail
  tailAngle:     0,
  tailDir:       1,
  tailSpeed:     0.05,
  tailSpeedTarget: 0.05,

  // Breathing
  breathPhase:   0,          // continuous phase (no direction flip — smoother)
  breathRhythm:  1.0,
  breathRhythmTarget: 1.0,
  breathScale:   1.0,

  // Blink
  blinkTimer:    0,
  blinkInterval: 220,        // randomised per blink
  blinkOpen:     true,
  blinkEase:     1.0,        // 1=open 0=closed (eased)

  // Ears
  earAngle:      0,
  earDir:        1,
  earLift:       0,           // extra upward tilt for alert/curious
  earLiftTarget: 0,

  // Head
  headTiltAngle:    0,
  headTiltTarget:   0,
  headNodPhase:     0,         // subtle nod cycle

  // Eye gaze
  eyeGazeX:     0,
  eyeGazeXTarget:0,
  eyeGazeY:     0,
  eyeGazeYTarget:0,
  eyeGazeTimer: 0,            // countdown until next gaze shift

  // Body
  restingOffset: 0,           // body drops when sitting/sleeping (lerped)
  restingOffsetTarget: 0,
  bodyRockAngle: 0,           // subtle body rock when walking
  bodyRockPhase: 0,

  // Walk/movement
  walkPhase:     0,
  walkSpeed:     0,
  walkSpeedTarget: 0,
  posX:          0,           // horizontal wander offset (-40 to +40)
  posXTarget:    0,
  posXSpeed:     0,
  legSwingPhase: 0,

  // Bounce (excited)
  bounceY:       0,
  bounceYTarget: 0,

  // Stretch animation
  stretchPhase:  0,
  stretching:    false,
  stretchTimer:  0,

  // Paw adjustment
  pawAdjPhase:   0,
  pawAdjActive:  false,
  pawAdjTimer:   0,

  // Idle variance (organic noise)
  noisePhase:    0,

  // Introduction sequence
  introPhase:    0,          // 0=not started 1=in progress 2=done
  introAlpha:    0,
  introOffsetY:  60,

  // Shadow
  shadowAlpha:   0.15,

  // Tail rest offset
  tailRestAngle: 0,

  // Touch point (for head-follow)
  touchX:        null,
  touchY:        null,
  touchFade:     0,           // fades gaze back to centre when no touch
};

let _anim       = { ...ANIM_DEFAULTS };
let _state      = DOG_STATES.IDLE;
let _prevState  = DOG_STATES.IDLE;
let _appearance = { ...DEFAULT_APPEARANCE };
let _raf        = null;
let _canvas     = null;
let _ctx        = null;
let _paused     = false;
let _lastTs     = 0;
let _frameDt    = 16;         // actual frame delta — used for dt-scaled lerps
let _quality    = 'high';    // 'low' | 'medium' | 'high'
let _throttleMs = 0;          // skip frames when > 0

// Stretch & paw timers (organic autonomous behaviours)
let _nextStretchAt  = Date.now() + randBetween(15000, 45000);
let _nextPawAdjAt   = Date.now() + randBetween(8000,  20000);
let _nextWanderAt   = Date.now() + randBetween(5000,  18000);
let _nextGazeShiftAt= Date.now() + randBetween(3000,   7000);
let _nextBlinkAt    = Date.now() + randBetween(2000,   5000);

// ─── Public API ───────────────────────────────────────────────────────────────

export function initRenderer(canvas, appearance = {}) {
  // Never start a second loop if already running on this canvas
  if (_raf) cancelAnimationFrame(_raf);
  _canvas     = canvas;
  _ctx        = canvas.getContext('2d', { alpha: true });
  _appearance = { ...DEFAULT_APPEARANCE, ...appearance };
  _anim       = { ...ANIM_DEFAULTS };
  _state      = DOG_STATES.IDLE;
  _paused     = false;
  _quality    = 'high';

  // Page visibility — pause RAF when hidden (saves battery)
  document.addEventListener('visibilitychange', _onVisibility);
  startLoop();
}

export function destroyRenderer() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf    = null;
  _canvas = null;
  _ctx    = null;
  document.removeEventListener('visibilitychange', _onVisibility);
}

export function setDogState(newState) {
  if (newState === _state) return;
  _prevState = _state;
  _state     = newState;
  _applyStateTargets(newState);
}

export function setQuality(q) {
  _quality    = q;
  _throttleMs = q === 'low' ? 50 : q === 'medium' ? 25 : 0;
}

export function updateAppearance(app) {
  _appearance = { ...DEFAULT_APPEARANCE, ...app };
}

/** Tell renderer where the user's pointer/touch is (for head follow). */
export function setPointerPosition(canvasX, canvasY) {
  _anim.touchX    = canvasX;
  _anim.touchY    = canvasY;
  _anim.touchFade = 1.0;
}

/** Clear pointer (user lifted finger/mouse). */
export function clearPointer() {
  _anim.touchFade = 0;
}

/** Trigger the cinematic introduction sequence (call after AI reconstruction). */
export function playIntroduction() {
  _anim.introPhase   = 1;
  _anim.introAlpha   = 0;
  _anim.introOffsetY = 60;
}

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

// ─── State targets ─────────────────────────────────────────────────────────────
function _applyStateTargets(state) {
  _anim.tailRestAngle = (Math.random() - 0.5) * 0.15;

  switch (state) {
    case DOG_STATES.EXCITED:
      _anim.tailSpeedTarget       = 0.20;
      _anim.breathRhythmTarget    = 1.45;
      _anim.restingOffsetTarget   = 0;
      _anim.earLiftTarget         = 0.12;
      _anim.headTiltTarget        = 0;
      _anim.walkSpeedTarget       = 0;
      _anim.bounceYTarget         = 10;
      break;
    case DOG_STATES.HAPPY:
      _anim.tailSpeedTarget       = 0.12;
      _anim.breathRhythmTarget    = 1.15;
      _anim.restingOffsetTarget   = 0;
      _anim.earLiftTarget         = 0.05;
      _anim.bounceYTarget         = 2;
      break;
    case DOG_STATES.SLEEPING:
      _anim.tailSpeedTarget       = 0.007;
      _anim.breathRhythmTarget    = 0.38;
      _anim.restingOffsetTarget   = 20;
      _anim.earLiftTarget         = -0.05;
      _anim.headTiltTarget        = 0.08;
      _anim.walkSpeedTarget       = 0;
      _anim.bounceYTarget         = 0;
      _anim.posXTarget            = 0;
      break;
    case DOG_STATES.SITTING:
      _anim.tailSpeedTarget       = 0.038;
      _anim.breathRhythmTarget    = 0.72;
      _anim.restingOffsetTarget   = 10;
      _anim.earLiftTarget         = 0;
      _anim.walkSpeedTarget       = 0;
      _anim.bounceYTarget         = 0;
      break;
    case DOG_STATES.LISTENING:
      _anim.tailSpeedTarget       = 0.055;
      _anim.breathRhythmTarget    = 0.92;
      _anim.earLiftTarget         = 0.20;  // ears prick up
      _anim.headTiltTarget        = 0.16;  // curious tilt
      _anim.walkSpeedTarget       = 0;
      _anim.bounceYTarget         = 0;
      break;
    case DOG_STATES.WALKING:
      _anim.tailSpeedTarget       = 0.07;
      _anim.breathRhythmTarget    = 1.1;
      _anim.restingOffsetTarget   = 0;
      _anim.walkSpeedTarget       = 0.04;
      _anim.bounceYTarget         = 0;
      break;
    case DOG_STATES.PLAYING:
      _anim.tailSpeedTarget       = 0.16;
      _anim.breathRhythmTarget    = 1.3;
      _anim.restingOffsetTarget   = 0;
      _anim.earLiftTarget         = 0.08;
      _anim.walkSpeedTarget       = 0.06;
      _anim.bounceYTarget         = 5;
      break;
    case DOG_STATES.WAGGING:
      _anim.tailSpeedTarget       = 0.22;
      _anim.breathRhythmTarget    = 1.1;
      _anim.bounceYTarget         = 1;
      break;
    case DOG_STATES.RUNNING:
      _anim.tailSpeedTarget       = 0.14;
      _anim.breathRhythmTarget    = 1.5;
      _anim.walkSpeedTarget       = 0.10;
      _anim.bounceYTarget         = 4;
      break;
    case DOG_STATES.IDLE:
    default:
      _anim.tailSpeedTarget       = 0.048;
      _anim.breathRhythmTarget    = 1.0;
      _anim.restingOffsetTarget   = 0;
      _anim.earLiftTarget         = 0;
      _anim.headTiltTarget        = 0;
      _anim.walkSpeedTarget       = 0;
      _anim.bounceYTarget         = 0;
      break;
  }
}

// ─── RAF loop ──────────────────────────────────────────────────────────────────
function startLoop() {
  const loop = (ts) => {
    if (!_canvas || !_ctx) return;
    _raf = requestAnimationFrame(loop);

    if (_paused) return;

    // Frame throttle (low-end devices)
    if (_throttleMs > 0 && ts - _lastTs < _throttleMs) return;
    _frameDt = Math.min(ts - _lastTs, 50); // cap at 50ms to prevent spiral
    _lastTs  = ts;

    tick(_frameDt);
    draw();
  };
  _raf = requestAnimationFrame(loop);
}

function _onVisibility() {
  _paused = document.hidden;
  if (!_paused) _lastTs = 0; // reset to avoid huge dt on resume
}

// ─── Tick — all animation advances ───────────────────────────────────────────
function tick(dt) {
  const now  = Date.now();
  const s    = _state;
  const fast = dt / 16; // normalise to 60fps

  // ── Smooth lerp toward targets ────────────────────────────────────────────
  const lerpF  = 0.06 * fast;  // gentle blend speed
  const lerpM  = 0.03 * fast;  // medium blend (body)
  const lerpS  = 0.01 * fast;  // slow blend (position)

  _anim.tailSpeed      = lerp(_anim.tailSpeed,      _anim.tailSpeedTarget,      lerpF);
  _anim.breathRhythm   = lerp(_anim.breathRhythm,   _anim.breathRhythmTarget,   lerpM);
  _anim.restingOffset  = lerp(_anim.restingOffset,  _anim.restingOffsetTarget,  lerpM);
  _anim.earLift        = lerp(_anim.earLift,        _anim.earLiftTarget,        lerpF);
  _anim.headTiltAngle  = lerp(_anim.headTiltAngle,  _anim.headTiltTarget || 0,  lerpF);
  _anim.bounceY        = lerp(_anim.bounceY,        _anim.bounceYTarget,        lerpF);
  _anim.walkSpeed      = lerp(_anim.walkSpeed,      _anim.walkSpeedTarget,      lerpM);
  _anim.posX           = lerp(_anim.posX,           _anim.posXTarget,           lerpS);

  // ── Tail wag ──────────────────────────────────────────────────────────────
  _anim.tailAngle += _anim.tailDir * _anim.tailSpeed * fast;
  const tailMax = 0.35 + _anim.tailSpeedTarget * 1.2;
  if (Math.abs(_anim.tailAngle) > tailMax) _anim.tailDir *= -1;

  // ── Breathing — sine wave (no direction flip = smoother) ─────────────────
  _anim.breathPhase += 0.0018 * _anim.breathRhythm * fast;
  _anim.breathScale  = 1.0 + Math.sin(_anim.breathPhase) * 0.018 * _anim.breathRhythm;

  // ── Blink ─────────────────────────────────────────────────────────────────
  if (now >= _nextBlinkAt && s !== DOG_STATES.SLEEPING) {
    _anim.blinkOpen  = false;
    _anim.blinkEase  = 0;
    // Reopen after 90–130ms
    setTimeout(() => {
      _anim.blinkOpen = true;
      _nextBlinkAt    = Date.now() + randBetween(2500, 6000);
    }, randBetween(90, 130));
  }
  // Ease blink
  _anim.blinkEase = lerp(_anim.blinkEase, _anim.blinkOpen ? 1 : 0, 0.25 * fast);

  // ── Ears ──────────────────────────────────────────────────────────────────
  _anim.earAngle += _anim.earDir * (0.004 + Math.abs(_anim.earLift) * 0.006) * fast;
  if (Math.abs(_anim.earAngle) > 0.10 + _anim.earLift * 0.5) _anim.earDir *= -1;

  // ── Head subtle nod ───────────────────────────────────────────────────────
  _anim.headNodPhase += 0.0008 * fast;
  // nodAngle used in draw (very subtle)

  // ── Eye gaze drift ────────────────────────────────────────────────────────
  if (now >= _nextGazeShiftAt) {
    // Shift gaze to a new organic point
    _anim.eyeGazeXTarget = (Math.random() - 0.5) * 3.5;
    _anim.eyeGazeYTarget = (Math.random() - 0.5) * 2.0;
    _nextGazeShiftAt     = now + randBetween(2500, 5500);
  }
  // If user pointer is near, follow it gently
  if (_anim.touchFade > 0.1 && _anim.touchX !== null && _canvas) {
    const cx     = _canvas.width  / (window.devicePixelRatio || 1) / 2;
    const cy     = _canvas.height / (window.devicePixelRatio || 1) / 2;
    const dx     = (_anim.touchX - cx) / cx;
    const dy     = (_anim.touchY - cy) / cy;
    _anim.eyeGazeXTarget = clamp(dx * 4, -4, 4);
    _anim.eyeGazeYTarget = clamp(dy * 2, -2, 2);
  }
  _anim.touchFade      = lerp(_anim.touchFade || 0, 0, 0.01 * fast);
  _anim.eyeGazeX       = lerp(_anim.eyeGazeX,  _anim.eyeGazeXTarget, 0.03 * fast);
  _anim.eyeGazeY       = lerp(_anim.eyeGazeY,  _anim.eyeGazeYTarget, 0.02 * fast);

  // ── Walk cycle ────────────────────────────────────────────────────────────
  if (_anim.walkSpeed > 0.005) {
    _anim.walkPhase    += _anim.walkSpeed * fast * 1.8;
    _anim.legSwingPhase = _anim.walkPhase;
    _anim.bodyRockPhase += _anim.walkSpeed * fast * 0.9;
    _anim.bodyRockAngle = Math.sin(_anim.bodyRockPhase) * 0.025 * (_anim.walkSpeed / 0.04);
  } else {
    _anim.bodyRockAngle  = lerp(_anim.bodyRockAngle, 0, 0.05 * fast);
  }

  // ── Autonomous wander (walking states) ───────────────────────────────────
  if (now >= _nextWanderAt && (_state === DOG_STATES.WALKING || _state === DOG_STATES.PLAYING)) {
    _anim.posXTarget = (Math.random() - 0.5) * 50;
    _nextWanderAt    = now + randBetween(3000, 8000);
  }
  // Drift back to centre when not walking
  if (_anim.walkSpeedTarget < 0.01 && Math.abs(_anim.posX) > 1) {
    _anim.posXTarget = lerp(_anim.posXTarget, 0, 0.002 * fast);
  }

  // ── Stretch (autonomous, organic) ────────────────────────────────────────
  if (now >= _nextStretchAt && !_anim.stretching &&
      (s === DOG_STATES.IDLE || s === DOG_STATES.SITTING)) {
    _anim.stretching   = true;
    _anim.stretchTimer = 0;
    _nextStretchAt     = now + randBetween(20000, 50000);
  }
  if (_anim.stretching) {
    _anim.stretchTimer += fast;
    _anim.stretchPhase  = Math.min(_anim.stretchTimer / 80, 1);
    if (_anim.stretchTimer > 90) {
      _anim.stretching  = false;
      _anim.stretchPhase = 0;
    }
  }

  // ── Paw adjustment (organic fidget) ──────────────────────────────────────
  if (now >= _nextPawAdjAt && !_anim.pawAdjActive &&
      s !== DOG_STATES.WALKING && s !== DOG_STATES.RUNNING && s !== DOG_STATES.SLEEPING) {
    _anim.pawAdjActive = true;
    _anim.pawAdjTimer  = 0;
    _nextPawAdjAt      = now + randBetween(10000, 25000);
  }
  if (_anim.pawAdjActive) {
    _anim.pawAdjTimer += fast;
    _anim.pawAdjPhase  = Math.sin((_anim.pawAdjTimer / 30) * Math.PI);
    if (_anim.pawAdjTimer > 35) {
      _anim.pawAdjActive = false;
      _anim.pawAdjPhase  = 0;
    }
  }

  // ── Organic noise (prevents any perfectly looping motion) ─────────────────
  _anim.noisePhase += 0.003 * fast;

  // ── Introduction sequence ─────────────────────────────────────────────────
  if (_anim.introPhase === 1) {
    _anim.introAlpha   = lerp(_anim.introAlpha,   1,  0.035 * fast);
    _anim.introOffsetY = lerp(_anim.introOffsetY, 0,  0.04  * fast);
    if (_anim.introAlpha > 0.985) _anim.introPhase = 2;
  }
}

// ─── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  const W   = _canvas.width  / (window.devicePixelRatio || 1);
  const H   = _canvas.height / (window.devicePixelRatio || 1);
  const a   = _appearance;
  const dpr = window.devicePixelRatio || 1;

  // Map logical canvas coords
  const scale = (a.size || 1) * Math.min(W, H) / 320;
  const cx    = W / 2 + _anim.posX;
  const cy    = H / 2 + _anim.restingOffset - _anim.bounceY
                  + Math.sin(_anim.noisePhase * 0.7) * 0.6;

  _ctx.clearRect(0, 0, W * dpr, H * dpr);

  // Introduction fade/slide
  if (_anim.introPhase === 1) {
    _ctx.save();
    _ctx.globalAlpha = _anim.introAlpha;
    _ctx.translate(0, _anim.introOffsetY);
  }

  _ctx.save();
  _ctx.translate(cx, cy);

  // Body rock (walk cycle)
  _ctx.rotate(_anim.bodyRockAngle);

  _ctx.scale(scale, scale);

  // ── Draw order: shadow → tail → legs → body → head → ears → face ──────────
  _ctx.restore();
  _ctx.save();
  _ctx.translate(cx, cy);
  _ctx.scale(scale, scale);

  drawShadow(a, W, H, cx, cy, scale);
  drawTail(a);
  drawLegs(a);
  drawBody(a);
  drawHead(a);
  drawEars(a);
  drawFace(a);

  // Stretch overlay
  if (_anim.stretchPhase > 0) drawStretch(a);

  _ctx.restore();

  // Sleep Zs (drawn at canvas level, not dog level)
  if (_state === DOG_STATES.SLEEPING) drawSleepZs(W, H);

  if (_anim.introPhase === 1) _ctx.restore();
}

// ─── Shadow ────────────────────────────────────────────────────────────────────
function drawShadow(a, W, H, cx, cy, scale) {
  // Soft elliptical ground shadow — cinematic depth
  const sw = 90 * scale * (a.bodyShape === 'large' ? 1.2 : a.bodyShape === 'small' ? 0.85 : 1);
  const sh = 10 * scale;
  const sy = cy + 50 * scale + (_anim.restingOffset > 5 ? 8 * scale : 0);

  _ctx.restore(); // step out of dog transform for shadow
  _ctx.save();

  const grad = _ctx.createRadialGradient(cx, sy, 0, cx, sy, sw);
  grad.addColorStop(0, `rgba(0,0,0,${_anim.restingOffset > 10 ? 0.22 : 0.15})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  _ctx.fillStyle = grad;
  _ctx.beginPath();
  _ctx.ellipse(cx, sy, sw, sh, 0, 0, Math.PI * 2);
  _ctx.fill();

  _ctx.restore();
  _ctx.save();
  _ctx.translate(cx, cy);
  _ctx.scale(scale, scale);
}

// ─── Tail ──────────────────────────────────────────────────────────────────────
function drawTail(a) {
  const angle = _anim.tailAngle + _anim.tailRestAngle;
  const lift  = _anim.tailSpeedTarget > 0.12 ? 0.6 : 0.3;

  _ctx.save();
  _ctx.translate(58, -8 - Math.sin(_anim.noisePhase) * 1.5);
  _ctx.rotate(angle + lift);
  _ctx.beginPath();
  _ctx.strokeStyle = a.tailColour;
  _ctx.lineWidth   = 11;
  _ctx.lineCap     = 'round';
  _ctx.lineJoin    = 'round';

  if (a.tailShape === 'curly') {
    _ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const x = t * 35 * Math.cos(t * Math.PI * 1.8);
      const y = -t * 38 * Math.sin(t * Math.PI * 0.9);
      t === 0 ? _ctx.moveTo(x, y) : _ctx.lineTo(x, y);
    }
  } else if (a.tailShape === 'straight') {
    _ctx.moveTo(0, 0);
    _ctx.lineTo(0, -48);
  } else {
    // Wavy — natural curve
    _ctx.moveTo(0, 0);
    _ctx.bezierCurveTo(
      12, -20,
      30 + Math.sin(_anim.noisePhase * 1.3) * 3, -32,
      48, -14 + Math.sin(_anim.tailAngle * 2) * 4
    );
  }
  _ctx.stroke();
  _ctx.restore();
}

// ─── Legs ──────────────────────────────────────────────────────────────────────
function drawLegs(a) {
  const isWalking = _anim.walkSpeed > 0.008;
  const pawAdj    = _anim.pawAdjPhase;
  const sitting   = _state === DOG_STATES.SITTING || _state === DOG_STATES.SLEEPING;

  const legDefs = [
    { x: -46, y: 28, front: true,  left: true  },
    { x: -18, y: 28, front: true,  left: false },
    { x:  18, y: 28, front: false, left: true  },
    { x:  46, y: 28, front: false, left: false },
  ];

  legDefs.forEach(({ x, y, front, left }) => {
    let swing  = 0;
    let legLen = sitting ? 28 : 38;

    if (isWalking) {
      const phase = _anim.legSwingPhase + (front ? 0 : Math.PI) + (left ? 0 : Math.PI / 2);
      swing = Math.sin(phase) * 8 * (_anim.walkSpeed / 0.04);
    }

    // Paw adjustment — one front paw lifts slightly
    const isAdjustedPaw = pawAdj !== 0 && front && left;
    const pawOffY = isAdjustedPaw ? pawAdj * -6 : 0;

    _ctx.fillStyle = a.bodyColour;
    _ctx.beginPath();
    _ctx.roundRect(
      x - 8 + swing * 0.4,
      y,
      15,
      legLen,
      7
    );
    _ctx.fill();

    // Paw
    _ctx.fillStyle = darken(a.bodyColour, 22);
    _ctx.beginPath();
    _ctx.ellipse(
      x + swing * 0.5,
      y + legLen + 4 + pawOffY,
      sitting ? 9 : 10,
      sitting ? 5 : 6,
      0, 0, Math.PI * 2
    );
    _ctx.fill();
    // Paw toe highlight
    _ctx.fillStyle = darken(a.bodyColour, 35);
    for (let t = -1; t <= 1; t++) {
      _ctx.beginPath();
      _ctx.ellipse(x + swing * 0.5 + t * 3.5, y + legLen + 4 + pawOffY, 2, 1.5, 0, 0, Math.PI * 2);
      _ctx.fill();
    }
  });
}

// ─── Body ──────────────────────────────────────────────────────────────────────
function drawBody(a) {
  const bw      = a.bodyShape === 'large' ? 128 : a.bodyShape === 'small' ? 88 : 108;
  const bh      = a.bodyShape === 'large' ? 74  : a.bodyShape === 'small' ? 54  : 64;
  const stretch = _anim.stretchPhase;
  const noise   = Math.sin(_anim.noisePhase * 1.1) * 0.5;

  // Stretch deform
  const stretchW = bw + stretch * 18;
  const stretchH = bh - stretch * 6;

  _ctx.save();
  _ctx.rotate(_anim.bodyRockAngle * 0.5 + noise * 0.003);

  // Body fill
  _ctx.fillStyle = a.bodyColour;
  _ctx.beginPath();
  _ctx.ellipse(0, 20, stretchW / 2, stretchH / 2, 0, 0, Math.PI * 2);
  _ctx.fill();

  // Belly
  _ctx.fillStyle = a.bellyColour;
  _ctx.beginPath();
  _ctx.ellipse(0, 30, stretchW / 4.5, stretchH / 3.5, 0, 0, Math.PI * 2);
  _ctx.fill();

  // Coat shading — soft highlight on top
  const grad = _ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  _ctx.fillStyle = grad;
  _ctx.beginPath();
  _ctx.ellipse(0, 20, stretchW / 2, stretchH / 2, 0, 0, Math.PI * 2);
  _ctx.fill();

  _ctx.restore();
}

// ─── Head ──────────────────────────────────────────────────────────────────────
function drawHead(a) {
  // Head tilt + subtle nod
  const tilt = _anim.headTiltAngle
    + Math.sin(_anim.headNodPhase) * 0.012
    + Math.sin(_anim.noisePhase * 0.6) * 0.005;

  _ctx.save();
  _ctx.translate(-18, -52 + Math.sin(_anim.breathPhase * 0.5) * 0.8);
  _ctx.rotate(tilt);

  _ctx.fillStyle = a.bodyColour;
  _ctx.beginPath();
  _ctx.ellipse(0, 0, 44, 39, -0.08, 0, Math.PI * 2);
  _ctx.fill();

  // Head highlight
  const hgrad = _ctx.createRadialGradient(-8, -12, 2, 0, 0, 44);
  hgrad.addColorStop(0, 'rgba(255,255,255,0.10)');
  hgrad.addColorStop(1, 'rgba(0,0,0,0)');
  _ctx.fillStyle = hgrad;
  _ctx.beginPath();
  _ctx.ellipse(0, 0, 44, 39, -0.08, 0, Math.PI * 2);
  _ctx.fill();

  _ctx.restore();
}

// ─── Ears ──────────────────────────────────────────────────────────────────────
function drawEars(a) {
  const tilt    = _anim.headTiltAngle;
  const earBase = -0.08 + Math.sin(_anim.noisePhase * 0.4) * 0.003;
  const lift    = _anim.earLift;

  _ctx.save();
  _ctx.translate(-18, -76);
  _ctx.rotate(tilt + earBase);

  const ec = a.earColour;
  if (a.earShape === 'floppy') {
    // Left ear — hangs with gravity feel
    _ctx.save();
    _ctx.translate(-28, 0);
    _ctx.rotate(-0.25 - lift * 0.3 + _anim.earAngle * 0.6);
    _ctx.fillStyle = ec;
    _ctx.beginPath();
    _ctx.ellipse(0, 18, 13, 26, -0.2, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.fillStyle = darken(ec, 15);
    _ctx.beginPath();
    _ctx.ellipse(2, 20, 7, 16, -0.1, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.restore();

    // Right ear
    _ctx.save();
    _ctx.translate(5, 0);
    _ctx.rotate(0.25 + lift * 0.3 - _anim.earAngle * 0.6);
    _ctx.fillStyle = ec;
    _ctx.beginPath();
    _ctx.ellipse(0, 18, 13, 26, 0.2, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.fillStyle = darken(ec, 15);
    _ctx.beginPath();
    _ctx.ellipse(-2, 20, 7, 16, 0.1, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.restore();

  } else if (a.earShape === 'pointed') {
    // Pointed — prick up when alert
    const uprightL = -0.3 + lift * 0.5 + _anim.earAngle * 0.3;
    const uprightR =  0.3 - lift * 0.5 - _anim.earAngle * 0.3;
    _ctx.fillStyle = ec;
    _ctx.save(); _ctx.rotate(uprightL);
    _ctx.beginPath(); _ctx.moveTo(-44, 2); _ctx.lineTo(-28, -34); _ctx.lineTo(-14, 2); _ctx.closePath(); _ctx.fill();
    _ctx.fillStyle = lighten(ec, 20); // inner ear
    _ctx.beginPath(); _ctx.moveTo(-40, 2); _ctx.lineTo(-28, -26); _ctx.lineTo(-18, 2); _ctx.closePath(); _ctx.fill();
    _ctx.restore();

    _ctx.fillStyle = ec;
    _ctx.save(); _ctx.rotate(uprightR);
    _ctx.beginPath(); _ctx.moveTo(-2, 2); _ctx.lineTo(14, -34); _ctx.lineTo(28, 2); _ctx.closePath(); _ctx.fill();
    _ctx.fillStyle = lighten(ec, 20);
    _ctx.beginPath(); _ctx.moveTo(2, 2); _ctx.lineTo(14, -26); _ctx.lineTo(24, 2); _ctx.closePath(); _ctx.fill();
    _ctx.restore();

  } else {
    // Folded
    _ctx.fillStyle = ec;
    _ctx.beginPath(); _ctx.ellipse(-26, 8 - lift * 8, 13, 18, -0.5 - lift * 0.3, 0, Math.PI * 2); _ctx.fill();
    _ctx.beginPath(); _ctx.ellipse(4,   8 - lift * 8, 13, 18,  0.5 + lift * 0.3, 0, Math.PI * 2); _ctx.fill();
  }

  _ctx.restore();
}

// ─── Face ──────────────────────────────────────────────────────────────────────
function drawFace(a) {
  const tilt       = _anim.headTiltAngle;
  const blinkRatio = _anim.blinkEase; // 1=open 0=closed
  const sleeping   = _state === DOG_STATES.SLEEPING;

  _ctx.save();
  _ctx.translate(-18, -52);
  _ctx.rotate(tilt);

  // Eyes
  const eyeDefs = [
    { x: -16, y: -10 },
    { x:  14, y: -10 },
  ];

  eyeDefs.forEach(({ x, y }) => {
    const gx = _anim.eyeGazeX;
    const gy = _anim.eyeGazeY;

    if (sleeping) {
      // Closed eye — curved line
      _ctx.strokeStyle = a.eyeColour;
      _ctx.lineWidth   = 2.5;
      _ctx.lineCap     = 'round';
      _ctx.beginPath();
      _ctx.arc(x, y, 7, Math.PI, 0, false);
      _ctx.stroke();
    } else {
      // White sclera
      _ctx.fillStyle = '#F8F4EE';
      _ctx.beginPath();
      _ctx.ellipse(x, y, 9, 9 * blinkRatio, 0, 0, Math.PI * 2);
      _ctx.fill();

      // Iris — warm colour
      _ctx.fillStyle = a.eyeColour;
      _ctx.beginPath();
      _ctx.ellipse(x + gx, y + gy, 5.5, 5.5 * blinkRatio, 0, 0, Math.PI * 2);
      _ctx.fill();

      // Pupil
      _ctx.fillStyle = '#0A0806';
      _ctx.beginPath();
      _ctx.ellipse(x + gx, y + gy, 2.8, 2.8 * blinkRatio, 0, 0, Math.PI * 2);
      _ctx.fill();

      // Catchlight — makes eyes feel alive
      if (blinkRatio > 0.5) {
        _ctx.fillStyle = 'rgba(255,255,255,0.75)';
        _ctx.beginPath();
        _ctx.ellipse(x + gx - 1.5, y + gy - 1.5, 1.8, 1.8, 0, 0, Math.PI * 2);
        _ctx.fill();
      }

      // Blink shade
      if (blinkRatio < 0.95) {
        _ctx.fillStyle = `rgba(${hexToRgb(a.bodyColour)},${(1 - blinkRatio) * 0.9})`;
        _ctx.beginPath();
        _ctx.ellipse(x, y - 9, 11, 10, 0, 0, Math.PI);
        _ctx.fill();
      }
    }
  });

  // Nose
  _ctx.fillStyle = a.noseColour;
  _ctx.beginPath();
  _ctx.ellipse(-1, -26, 10, 7, 0, 0, Math.PI * 2);
  _ctx.fill();
  // Nose highlight
  _ctx.fillStyle = 'rgba(255,255,255,0.2)';
  _ctx.beginPath();
  _ctx.ellipse(-3, -28, 4, 2.5, -0.3, 0, Math.PI * 2);
  _ctx.fill();

  // Mouth
  _ctx.strokeStyle = a.noseColour;
  _ctx.lineWidth   = 2.5;
  _ctx.lineCap     = 'round';
  _ctx.beginPath();
  _ctx.moveTo(-1, -19);
  _ctx.quadraticCurveTo(-9, -12, -12, -10);
  _ctx.moveTo(-1, -19);
  _ctx.quadraticCurveTo(7, -12, 10, -10);
  _ctx.stroke();

  // Happy tongue
  if (_state === DOG_STATES.HAPPY || _state === DOG_STATES.EXCITED || _state === DOG_STATES.PLAYING) {
    const tongueX = Math.sin(_anim.tailAngle * 1.5) * 1.5; // wiggles with tail
    _ctx.fillStyle = '#E07888';
    _ctx.beginPath();
    _ctx.ellipse(-1 + tongueX, -5, 7.5, 9, 0.05, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.fillStyle = darken('#E07888', 20);
    _ctx.beginPath();
    _ctx.moveTo(-1 + tongueX, -5);
    _ctx.lineTo(-1 + tongueX, 4);
    _ctx.lineWidth = 1.5;
    _ctx.stroke();
  }

  _ctx.restore();
}

// ─── Stretch overlay ───────────────────────────────────────────────────────────
function drawStretch(a) {
  // Front body elongates, front legs extend — classic dog stretch
  const t = _anim.stretchPhase;
  if (t <= 0) return;

  _ctx.save();
  _ctx.globalAlpha = Math.min(t * 2, 1 - Math.max(0, t - 0.5) * 2); // fade in/out

  // Front extension
  _ctx.fillStyle = a.bodyColour;
  _ctx.beginPath();
  _ctx.ellipse(-50, 20, 20, 18, 0, 0, Math.PI * 2);
  _ctx.fill();

  // Extended front paws
  _ctx.fillStyle = darken(a.bodyColour, 22);
  [-62, -40].forEach(px => {
    _ctx.beginPath();
    _ctx.ellipse(px, 42 + t * 8, 9, 5, 0, 0, Math.PI * 2);
    _ctx.fill();
  });

  _ctx.globalAlpha = 1;
  _ctx.restore();
}

// ─── Sleep Zs ─────────────────────────────────────────────────────────────────
function drawSleepZs(W, H) {
  const t    = Date.now() / 1000;
  const dpr  = window.devicePixelRatio || 1;

  _ctx.save();
  _ctx.scale(dpr, dpr);

  const zDefs = [
    { text: 'z',  x: W * 0.64, y: H * 0.32, size: 16, speed: 1.1, offset: 0   },
    { text: 'z',  x: W * 0.70, y: H * 0.24, size: 20, speed: 0.8, offset: 1.0 },
    { text: 'Z',  x: W * 0.76, y: H * 0.16, size: 24, speed: 0.6, offset: 2.2 },
  ];

  zDefs.forEach(({ text, x, y, size, speed, offset }) => {
    const alpha  = 0.3 + 0.3 * Math.sin(t * speed + offset);
    const floatY = Math.sin(t * speed * 0.7 + offset) * 4;
    _ctx.globalAlpha = alpha;
    _ctx.font        = `bold ${size}px serif`;
    _ctx.fillStyle   = '#C9A84C';
    _ctx.fillText(text, x, y + floatY);
  });

  _ctx.globalAlpha = 1;
  _ctx.restore();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function randBetween(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function darken(hex, amount = 30) {
  if (!hex || hex.length < 7) return hex || '#000';
  let r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  let g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  let b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function lighten(hex, amount = 30) {
  if (!hex || hex.length < 7) return hex || '#fff';
  let r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  let g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  let b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function hexToRgb(hex) {
  if (!hex || hex.length < 7) return '0,0,0';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
