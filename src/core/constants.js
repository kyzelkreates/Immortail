// Immortail™ — App Constants

export const APP_NAME    = 'Immortail™';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
export const IS_PROD     = typeof __IS_PROD__     !== 'undefined' ? __IS_PROD__     : false;

// ─── Routes ───────────────────────────────────────────────────────────────────
export const ROUTES = {
  HOME:        '/',
  CREATE:      '/create-dog',
  DASHBOARD:   '/dashboard',
  IMMORTAIL:   '/immortail',
  MEMORIES:    '/memories',
  SOUNDS:      '/sounds',
  VIDEOS:      '/videos',
  MEMORY_WALK: '/memory-walk',
  TIMELINE:    '/timeline',
  SETTINGS:    '/settings',
};

// ─── Dog personality traits ───────────────────────────────────────────────────
export const PERSONALITY_TRAITS = [
  { id: 'playful',    label: 'Playful',    emoji: '🎾', description: 'Always ready for a game' },
  { id: 'calm',       label: 'Calm',       emoji: '😌', description: 'Gentle and relaxed soul' },
  { id: 'anxious',    label: 'Anxious',    emoji: '🥺', description: 'Sensitive and attentive' },
  { id: 'cuddly',     label: 'Cuddly',     emoji: '🤗', description: 'Loves to be close' },
  { id: 'energetic',  label: 'Energetic',  emoji: '⚡', description: 'Full of life and bounce' },
  { id: 'protective', label: 'Protective', emoji: '🛡️', description: 'Loyal guardian' },
  { id: 'stubborn',   label: 'Stubborn',   emoji: '😤', description: 'Knows what they want' },
  { id: 'gentle',     label: 'Gentle',     emoji: '🌸', description: 'Soft and careful' },
  { id: 'curious',    label: 'Curious',    emoji: '🔍', description: 'Always exploring' },
];

// ─── Sound types ──────────────────────────────────────────────────────────────
export const SOUND_TYPES = [
  { id: 'bark',       label: 'Bark',          emoji: '🔊' },
  { id: 'whine',      label: 'Whining',        emoji: '😢' },
  { id: 'pant',       label: 'Panting',        emoji: '😤' },
  { id: 'walk',       label: 'Walking',        emoji: '🐾' },
  { id: 'collar',     label: 'Collar jingle',  emoji: '🔔' },
  { id: 'happy',      label: 'Happy sounds',   emoji: '😊' },
  { id: 'growl',      label: 'Growl',          emoji: '😠' },
  { id: 'howl',       label: 'Howl',           emoji: '🌙' },
  { id: 'sniff',      label: 'Sniffing',       emoji: '👃' },
  { id: 'other',      label: 'Other',          emoji: '🎵' },
];

// ─── Dog breeds (common) ──────────────────────────────────────────────────────
export const DOG_BREEDS = [
  'Labrador Retriever', 'Golden Retriever', 'German Shepherd', 'Bulldog',
  'Poodle', 'Beagle', 'Rottweiler', 'Yorkshire Terrier', 'Dachshund',
  'Boxer', 'Shih Tzu', 'Chihuahua', 'Husky', 'Doberman', 'Maltese',
  'Border Collie', 'Cocker Spaniel', 'Jack Russell', 'Cavalier King Charles',
  'French Bulldog', 'Pomeranian', 'Staffordshire Bull Terrier', 'Whippet',
  'Dalmatian', 'Great Dane', 'Greyhound', 'Bichon Frise', 'Schnauzer',
  'Weimaraner', 'Shiba Inu', 'Akita', 'Chow Chow', 'Samoyed',
  'Australian Shepherd', 'Mixed Breed / Crossbreed', 'Other'
];

// ─── Dog colours ──────────────────────────────────────────────────────────────
export const DOG_COLOURS = [
  { id: 'black',         label: 'Black',           hex: '#1a1a1a' },
  { id: 'white',         label: 'White',           hex: '#f5f5f5' },
  { id: 'brown',         label: 'Brown',           hex: '#8B4513' },
  { id: 'golden',        label: 'Golden',          hex: '#DAA520' },
  { id: 'cream',         label: 'Cream',           hex: '#FFFDD0' },
  { id: 'grey',          label: 'Grey',            hex: '#808080' },
  { id: 'tan',           label: 'Tan',             hex: '#D2B48C' },
  { id: 'reddish',       label: 'Reddish-brown',   hex: '#8B2500' },
  { id: 'brindle',       label: 'Brindle',         hex: '#5C4033' },
  { id: 'spotted',       label: 'Spotted / Mixed', hex: '#A0936A' },
  { id: 'tricolour',     label: 'Tri-colour',      hex: '#3B2F2F' },
];

// ─── Timeline event types ─────────────────────────────────────────────────────
export const TIMELINE_EVENT_TYPES = [
  { id: 'birth',       label: 'Birthday',         emoji: '🎂' },
  { id: 'adoption',    label: 'Adoption Day',      emoji: '🏠' },
  { id: 'milestone',   label: 'Milestone',         emoji: '⭐' },
  { id: 'memory',      label: 'Memory',            emoji: '💭' },
  { id: 'adventure',   label: 'Adventure',         emoji: '🌲' },
  { id: 'health',      label: 'Health',            emoji: '❤️' },
  { id: 'funny',       label: 'Funny Moment',      emoji: '😂' },
  { id: 'last',        label: 'Last Memory',       emoji: '🌅' },
];

// ─── Interaction types ────────────────────────────────────────────────────────
export const INTERACTIONS = {
  PET:       'pet',
  THROW_TOY: 'throw_toy',
  CALL:      'call',
  REWARD:    'reward',
  BEDTIME:   'bedtime',
  PLAY:      'play',
  CUDDLE:    'cuddle',
};

// ─── Dog animation states ─────────────────────────────────────────────────────
export const DOG_STATES = {
  IDLE:       'idle',
  HAPPY:      'happy',
  EXCITED:    'excited',
  SLEEPING:   'sleeping',
  WALKING:    'walking',
  SITTING:    'sitting',
  PLAYING:    'playing',
  LISTENING:  'listening',
  WAGGING:    'wagging',
  RUNNING:    'running',
};

// ─── Environment modes ────────────────────────────────────────────────────────
export const ENV_MODES = {
  DAY:       'day',
  DUSK:      'dusk',
  NIGHT:     'night',
  RAIN:      'rain',
  // Extended environments
  SUNSET:    'sunset',
  FIREPLACE: 'fireplace',
  SNOW:      'snow',
  WOODLAND:  'woodland',
  BEACH:     'beach',
  GOLDEN:    'golden',
};

// Auto-detect environment from time of day
export function getAutoEnvMode() {
  const h = new Date().getHours();
  if (h >= 6  && h < 10)  return ENV_MODES.GOLDEN;   // morning golden hour
  if (h >= 10 && h < 17)  return ENV_MODES.DAY;
  if (h >= 17 && h < 19)  return ENV_MODES.SUNSET;
  if (h >= 19 && h < 21)  return ENV_MODES.DUSK;
  return ENV_MODES.NIGHT;
}

// Whether current hour is "night" (calmer behaviour)
export function isNightTime() {
  const h = new Date().getHours();
  return h >= 21 || h < 7;
}

// ─── AI analysis types ────────────────────────────────────────────────────────
export const AI_ANALYSIS = {
  PHOTO:       'photo',
  SOUND:       'sound',
  PERSONALITY: 'personality',
  MEMORY:      'memory',
  COMBINED:    'combined',
};

// ─── Max upload sizes ─────────────────────────────────────────────────────────
export const MAX_PHOTO_SIZE_MB    = 20;
export const MAX_SOUND_SIZE_MB    = 50;
export const MAX_PHOTOS_PER_DOG   = 100;
export const MAX_SOUNDS_PER_DOG   = 50;
export const THUMBNAIL_SIZE       = 200; // px
export const COMPRESSED_MAX_SIZE  = 1200; // px max dimension
export const JPEG_QUALITY         = 0.82;

// ─── Emotional save state presets ─────────────────────────────────────────────
export const MOMENT_PRESETS = [
  { id: 'sleepy',     label: 'Sleepy evening',  emoji: '😴', env: 'night',     dogState: 'sleeping' },
  { id: 'playful',    label: 'Playful time',     emoji: '🎾', env: 'day',       dogState: 'playing'  },
  { id: 'beach',      label: 'Beach day',        emoji: '🏖️', env: 'beach',     dogState: 'happy'    },
  { id: 'fireplace',  label: 'Fireplace rest',   emoji: '🔥', env: 'fireplace', dogState: 'sleeping' },
  { id: 'walk',       label: 'Morning walk',     emoji: '🌅', env: 'golden',    dogState: 'walking'  },
  { id: 'woodland',   label: 'Woodland wander',  emoji: '🌲', env: 'woodland',  dogState: 'idle'     },
  { id: 'snow',       label: 'Snowy day',        emoji: '❄️', env: 'snow',      dogState: 'excited'  },
  { id: 'sunset',     label: 'Sunset cuddle',    emoji: '🌇', env: 'sunset',    dogState: 'happy'    },
];

// ─── Comfort mode wording map ─────────────────────────────────────────────────
export const COMFORT_WORDS = {
  standard: {
    companion:  'companion',
    memorial:   'memory space',
    reconstruct:'rebuild from memories',
    passed:     'who has passed',
    legacy:     'legacy',
  },
  comfort: {
    companion:  'friend',
    memorial:   'their space',
    reconstruct:'bring back to life',
    passed:     'who you loved',
    legacy:     'story',
  },
};

// ─── Video memory constants ───────────────────────────────────────────────────
export const MAX_VIDEO_SIZE_MB   = 200;
export const MAX_VIDEOS_PER_DOG  = 20;
export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

// ─── Companion ritual presets ─────────────────────────────────────────────────
export const COMPANION_RITUALS = [
  { id: 'bedtime',   label: 'Bedtime',         emoji: '😴', env: 'fireplace', dogState: 'sleeping', hour: [21,22,23,0] },
  { id: 'morning',   label: 'Morning greeting', emoji: '🌅', env: 'golden',    dogState: 'excited',  hour: [6,7,8,9]   },
  { id: 'fireplace', label: 'Fireplace rest',   emoji: '🔥', env: 'fireplace', dogState: 'sleeping', hour: null        },
  { id: 'memorial',  label: 'Memorial candle',  emoji: '🕯️', env: 'night',     dogState: 'sitting',  hour: null        },
  { id: 'evening',   label: 'Calm evening',     emoji: '🌙', env: 'dusk',      dogState: 'sitting',  hour: [18,19,20]  },
  { id: 'walk',      label: 'Memory walk',      emoji: '🐾', env: 'golden',    dogState: 'walking',  hour: null        },
];

// ─── Quiet companion mode ─────────────────────────────────────────────────────
export const QUIET_MODE_TIMEOUT_MS = 8 * 60 * 1000; // 8 min inactivity → suggest quiet mode

// ─── Favourite spot keys (localStorage) ──────────────────────────────────────
export const SPOT_LS_KEY        = 'immortail:favouriteSpot';
export const RITUAL_LS_KEY      = 'immortail:ritualHistory';
export const ADAPTATION_LS_KEY  = 'immortail:adaptation';
