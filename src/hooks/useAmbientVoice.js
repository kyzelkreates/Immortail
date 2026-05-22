/**
 * Immortail™ — useAmbientVoice
 * ─────────────────────────────────────────────────────────────────────────────
 * Gentle ambient narration using browser-native SpeechSynthesis.
 * THIS IS NOT A CHATBOT. Calm, warm, comforting emotional narration only.
 * Additive only. No backend. No network. Fully local.
 *
 * Usage:
 *   const { speak, cancel, supported } = useAmbientVoice({ enabled })
 *   speak('restore-reassurance', { name: 'Buddy' })
 *   speak('bedtime',             { name: 'Bella'  })
 */

import { useCallback, useRef, useEffect } from 'react';

// ── Script library ─────────────────────────────────────────────────────────
// Concise, warm, non-chatbot scripts. No questions. No dialogue.
const SCRIPTS = {
  'welcome-back': (p) =>
    `Welcome back. ${p.name || 'They'} ${p.name ? 'missed you.' : 'is waiting.'}`,

  'memory-moment': (p) =>
    p.title
      ? `A memory came up. ${p.title}.`
      : `A memory of ${p.name || 'your companion'} is here.`,

  'restore-reassurance': (p) =>
    `${p.name ? p.name + ' is' : 'Your companion is'} being brought back safely. Take your time.`,

  'bedtime': (p) =>
    `${p.name || 'They'} is settling in for the night. Sweet dreams.`,

  'onboarding-start': (_) =>
    `Tell us about them. Every detail brings them closer.`,

  'onboarding-photos': (_) =>
    `Share your favourite photos. The more you add, the more they come to life.`,

  'onboarding-sounds': (_) =>
    `Add their sounds. Their bark. Their breathing. The little noises only you remember.`,

  'onboarding-complete': (p) =>
    `${p.name || 'Your companion'} is ready. They're here now.`,

  'anniversary': (p) =>
    `${p.years ? p.years + ' year' + (p.years > 1 ? 's' : '') + ' ago' : 'Around this time'}, ${p.title || 'a beautiful day with ' + (p.name || 'them')}.`,

  'comfort': (_) =>
    `Take all the time you need. They're safe here, whenever you want to visit.`,
};

// ── Voice preferences ──────────────────────────────────────────────────────
// Prefer calmer, softer browser voices
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  // Prefer: female, British or US, "Samantha", "Karen", "Moira", "Google UK English Female"
  const preferred = ['Samantha', 'Karen', 'Moira', 'Google UK English Female', 'Microsoft Zira'];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  // Fallback: any English female
  const enFemale = voices.find(v => v.lang?.startsWith('en') && v.name.match(/female|woman/i));
  if (enFemale) return enFemale;
  // Any English
  return voices.find(v => v.lang?.startsWith('en')) || voices[0] || null;
}

export function useAmbientVoice({ enabled = true } = {}) {
  const speaking  = useRef(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Ensure voices are loaded
  useEffect(() => {
    if (!supported) return;
    // Chrome loads voices async
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }, [supported]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    speaking.current = false;
  }, [supported]);

  const speak = useCallback((scriptKey, params = {}) => {
    if (!enabled || !supported || speaking.current) return;

    const scriptFn = SCRIPTS[scriptKey];
    if (!scriptFn) {
      console.warn('[AmbientVoice] Unknown script:', scriptKey);
      return;
    }

    const text = scriptFn(params);
    if (!text) return;

    cancel(); // cancel any ongoing speech
    const utt         = new SpeechSynthesisUtterance(text);
    utt.voice         = pickVoice();
    utt.rate          = 0.88;   // slightly slower — calm
    utt.pitch         = 0.95;   // slightly lower — warm
    utt.volume        = 0.75;
    utt.onend         = () => { speaking.current = false; };
    utt.onerror       = () => { speaking.current = false; };
    speaking.current  = true;
    window.speechSynthesis.speak(utt);
  }, [enabled, supported, cancel]);

  // Cleanup on unmount
  useEffect(() => () => cancel(), [cancel]);

  return { speak, cancel, supported };
}
