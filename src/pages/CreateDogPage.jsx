/**
 * Immortail™ — Create Dog Profile Wizard
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the most important flow in the app. It's the first act of remembrance.
 * Every screen should feel warm, safe, and worthy of the moment.
 *
 * Rewrite: emotionally warm copy, dedication step, soft animations,
 * skip-friendly design (nothing feels mandatory except the name).
 */
import { useState, useCallback, useRef } from 'react';
import { useNavigate }     from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp }          from '../core/AppContext.jsx';
import { ROUTES, PERSONALITY_TRAITS, DOG_BREEDS, DOG_COLOURS } from '../core/constants.js';
import { Onboarding }      from '../core/storage.js';

// ── Wizard steps ──────────────────────────────────────────────────────────────
const STEPS = [
  {
    id:      'name',
    emoji:   '💛',
    title:   "What was their name?",
    sub:     "This name will stay with you always.",
    skippable: false,
  },
  {
    id:      'breed',
    emoji:   '🐕',
    title:   "What breed were they?",
    sub:     "Every breed carries its own spirit.",
    skippable: true,
  },
  {
    id:      'colour',
    emoji:   '🎨',
    title:   "What colour was their coat?",
    sub:     "The colour you'll always picture them.",
    skippable: true,
  },
  {
    id:      'traits',
    emoji:   '✨',
    title:   "How would you describe them?",
    sub:     "Choose up to 5 — take your time.",
    skippable: false,
  },
  {
    id:      'extras',
    emoji:   '📝',
    title:   "A few more details…",
    sub:     "Optional, but every detail helps.",
    skippable: true,
  },
  {
    id:      'tribute',
    emoji:   '🌹',
    title:   "Write them a message.",
    sub:     "Say what you'd want them to know. This is just for you.",
    skippable: true,
  },
  {
    id:      'confirm',
    emoji:   '🐾',
    title:   "Ready to begin.",
    sub:     "Their legacy starts now.",
    skippable: false,
  },
];

const INITIAL_FORM = {
  name:             '',
  breed:            '',
  age:              '',
  colour:           '',
  traits:           [],
  favouriteToy:     '',
  favouriteCommand: '',
  ownerName:        '',
  tribute:          '',
};

export default function CreateDogPage() {
  const navigate          = useNavigate();
  const { createProfile } = useApp();
  const [step, setStep]   = useState(0);
  const [form, setForm]   = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [direction, setDir] = useState(1); // 1 = forward, -1 = back

  const currentStep = STEPS[step];
  const isLast      = step === STEPS.length - 1;
  const progress    = ((step + 1) / STEPS.length) * 100;
  const canSkip     = currentStep.skippable;

  const update = useCallback((key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setError('');
  }, []);

  const toggleTrait = useCallback((id) => {
    setForm(prev => ({
      ...prev,
      traits: prev.traits.includes(id)
        ? prev.traits.filter(t => t !== id)
        : prev.traits.length < 5 ? [...prev.traits, id] : prev.traits,
    }));
  }, []);

  const validate = useCallback(() => {
    if (step === 0 && !form.name.trim())          return "Please enter their name — it's the heart of this.";
    if (step === 3 && form.traits.length === 0)   return "Pick at least one trait — how would you describe them?";
    return '';
  }, [step, form]);

  const go = useCallback((dir) => {
    setDir(dir);
    setError('');
    setStep(s => Math.max(0, Math.min(STEPS.length - 1, s + dir)));
  }, []);

  const handleNext = () => {
    const err = validate();
    if (err) { setError(err); return; }
    go(1);
  };

  const handleSkip = () => go(1);
  const handleBack = () => step === 0 ? navigate(ROUTES.HOME) : go(-1);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createProfile({
        name:             form.name.trim(),
        breed:            form.breed || null,
        age:              form.age ? parseInt(form.age, 10) : null,
        colour:           form.colour || null,
        traits:           form.traits,
        favouriteToy:     form.favouriteToy.trim(),
        favouriteCommand: form.favouriteCommand.trim(),
        ownerName:        form.ownerName.trim(),
        tribute:          form.tribute.trim(),
      });
      Onboarding.markDone();
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const slideVariants = {
    enter:   (d) => ({ opacity: 0, x: d > 0 ? 40 : -40 }),
    center:  { opacity: 1, x: 0 },
    exit:    (d) => ({ opacity: 0, x: d > 0 ? -40 : 40 }),
  };

  return (
    <div className="min-h-screen bg-immortail-deep flex flex-col safe-top safe-bottom">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-5 pt-6 pb-3">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center
                     text-immortail-soft hover:text-immortail-cream transition-colors"
        >
          ←
        </button>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-immortail-soft/60 uppercase tracking-widest">
              Step {step + 1} of {STEPS.length}
            </p>
            {form.name && step > 0 && (
              <p className="text-xs text-immortail-gold/70 font-display">{form.name}</p>
            )}
          </div>
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #9A7A2E, #C9A84C, #E5C97A)' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        <span className="font-display text-immortail-gold text-xl">🐾</span>
      </header>

      {/* ── Step content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-5 pt-4 pb-4 no-scrollbar">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: 'easeInOut' }}
          >
            {/* Step icon + heading */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-5xl mb-4"
            >
              {currentStep.emoji}
            </motion.div>

            <h2 className="font-display text-2xl text-immortail-cream mb-1 leading-tight">
              {currentStep.title}
            </h2>
            <p className="text-immortail-soft/70 text-sm mb-6 leading-relaxed">
              {currentStep.sub}
            </p>

            {/* Step panels */}
            {step === 0 && <StepName   value={form.name}    onChange={v => update('name', v)} />}
            {step === 1 && <StepBreed  value={form.breed}   onChange={v => update('breed', v)} />}
            {step === 2 && <StepColour value={form.colour}  onChange={v => update('colour', v)} />}
            {step === 3 && <StepTraits selected={form.traits} onToggle={toggleTrait} />}
            {step === 4 && <StepExtras form={form} update={update} />}
            {step === 5 && <StepTribute value={form.tribute} ownerName={form.ownerName}
                                        dogName={form.name}
                                        onChangeTribute={v => update('tribute', v)}
                                        onChangeOwner={v => update('ownerName', v)} />}
            {step === 6 && <StepConfirm form={form} />}

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm mt-4"
              >
                {error}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer nav ────────────────────────────────────────────────────── */}
      <footer className="px-5 pb-6 pt-2 space-y-2">
        <div className="h-px bg-white/8 rounded-full mb-3" />

        {isLast ? (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2.5"
          >
            {saving ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >🐾</motion.span>
                Creating their space…
              </>
            ) : (
              <>🐾 Begin Their Legacy</>
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="btn-primary w-full py-4 text-base"
          >
            Continue →
          </button>
        )}

        {canSkip && !isLast && (
          <button
            onClick={handleSkip}
            className="w-full text-center text-immortail-soft/40 hover:text-immortail-soft
                       text-sm py-2 transition-colors"
          >
            Skip for now
          </button>
        )}
      </footer>
    </div>
  );
}

// ── Step: Name ─────────────────────────────────────────────────────────────────
function StepName({ value, onChange }) {
  return (
    <div className="space-y-3">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Their name…"
        className="input-field text-2xl font-display text-center py-4"
        maxLength={40}
      />
      {value && (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-immortail-gold/80 text-lg font-display"
        >
          {value} 🐾
        </motion.p>
      )}
    </div>
  );
}

// ── Step: Breed ────────────────────────────────────────────────────────────────
function StepBreed({ value, onChange }) {
  const [filter, setFilter] = useState('');
  const filtered = DOG_BREEDS.filter(b => b.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Search breed…"
        className="input-field"
        autoFocus
      />
      {value && (
        <div className="px-3 py-2 rounded-xl bg-immortail-gold/10 border border-immortail-gold/30
                        text-immortail-gold text-sm font-medium">
          ✓ {value}
        </div>
      )}
      <div className="max-h-60 overflow-y-auto no-scrollbar space-y-1.5">
        {filtered.map(breed => (
          <button
            key={breed}
            onClick={() => onChange(breed)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all text-sm ${
              value === breed
                ? 'bg-immortail-gold/15 border border-immortail-gold/40 text-immortail-cream'
                : 'glass-card hover:border-white/20 text-immortail-soft hover:text-immortail-cream'
            }`}
          >
            {value === breed && '✓ '}{breed}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step: Colour ───────────────────────────────────────────────────────────────
function StepColour({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {DOG_COLOURS.map(colour => (
        <motion.button
          key={colour.id}
          whileTap={{ scale: 0.94 }}
          onClick={() => onChange(colour.id)}
          className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-sm ${
            value === colour.id
              ? 'border-immortail-gold/60 bg-immortail-gold/10 text-immortail-cream'
              : 'border-white/10 bg-white/4 text-immortail-soft hover:border-white/20 hover:text-immortail-cream'
          }`}
        >
          <span
            className="w-5 h-5 rounded-full border border-white/20 shrink-0"
            style={{ background: colour.hex }}
          />
          <span className="truncate">{colour.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

// ── Step: Traits ───────────────────────────────────────────────────────────────
function StepTraits({ selected, onToggle }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {PERSONALITY_TRAITS.map(trait => {
          const isSelected = selected.includes(trait.id);
          return (
            <motion.button
              key={trait.id}
              whileTap={{ scale: 0.94 }}
              onClick={() => onToggle(trait.id)}
              className={`flex flex-col items-start p-4 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'border-immortail-gold/60 bg-immortail-gold/10 text-immortail-cream'
                  : 'border-white/10 bg-white/4 text-immortail-soft hover:border-white/20'
              }`}
            >
              <span className="text-2xl mb-1.5">{trait.emoji}</span>
              <p className="text-sm font-medium leading-none">{trait.label}</p>
              <p className="text-xs opacity-60 mt-1 leading-tight">{trait.description}</p>
            </motion.button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-immortail-soft/50 text-center">
          {selected.length} of 5 chosen
        </p>
      )}
    </div>
  );
}

// ── Step: Extras ───────────────────────────────────────────────────────────────
function StepExtras({ form, update }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="field-label">Their age (years)</label>
        <input
          type="number"
          value={form.age}
          onChange={e => update('age', e.target.value)}
          placeholder="e.g. 7"
          className="input-field"
          min={0} max={30}
        />
      </div>
      <div>
        <label className="field-label">Favourite toy or thing</label>
        <input
          type="text"
          value={form.favouriteToy}
          onChange={e => update('favouriteToy', e.target.value)}
          placeholder="e.g. tennis ball, their blanket…"
          className="input-field"
          maxLength={80}
        />
      </div>
      <div>
        <label className="field-label">Their favourite command</label>
        <input
          type="text"
          value={form.favouriteCommand}
          onChange={e => update('favouriteCommand', e.target.value)}
          placeholder="e.g. 'Come here', 'Good girl'…"
          className="input-field"
          maxLength={60}
        />
      </div>
    </div>
  );
}

// ── Step: Tribute / Dedication ─────────────────────────────────────────────────
function StepTribute({ value, ownerName, dogName, onChangeTribute, onChangeOwner }) {
  const charLimit = 500;
  return (
    <div className="space-y-5">
      {/* Owner name (used for personalised greetings) */}
      <div>
        <label className="field-label">Your name (optional)</label>
        <input
          type="text"
          value={ownerName}
          onChange={e => onChangeOwner(e.target.value)}
          placeholder="So we can greet you personally…"
          className="input-field"
          maxLength={50}
        />
      </div>

      {/* The tribute — the emotional heart of this step */}
      <div>
        <label className="field-label">
          A message to {dogName || 'them'}
          <span className="ml-2 text-immortail-soft/40 font-normal text-xs">
            {value.length}/{charLimit}
          </span>
        </label>
        <textarea
          value={value}
          onChange={e => onChangeTribute(e.target.value)}
          placeholder={`Write what you'd want ${dogName || 'them'} to know. Anything at all — this is just for you.`}
          className="input-field resize-none text-sm leading-relaxed"
          rows={6}
          maxLength={charLimit}
        />
        <p className="text-xs text-immortail-soft/40 mt-1.5 leading-relaxed">
          This will be saved privately on your device. It can appear in their memory space as a dedication.
        </p>
      </div>
    </div>
  );
}

// ── Step: Confirm ──────────────────────────────────────────────────────────────
function StepConfirm({ form }) {
  const colour = DOG_COLOURS.find(c => c.id === form.colour);
  const traits = PERSONALITY_TRAITS.filter(t => form.traits.includes(t.id));

  return (
    <div className="space-y-4">
      {/* Name hero */}
      <div className="text-center py-4">
        <motion.div
          animate={{ y: [-4, 4, -4] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl mb-3"
        >
          🐾
        </motion.div>
        <h3 className="font-display text-3xl text-immortail-gold">{form.name}</h3>
        {colour && (
          <p className="text-immortail-soft text-sm mt-1">
            {form.breed && `${form.breed} · `}{colour.label}
          </p>
        )}
      </div>

      {/* Traits */}
      {traits.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-xs text-immortail-soft/50 uppercase tracking-widest mb-2.5">Personality</p>
          <div className="flex flex-wrap gap-2">
            {traits.map(t => (
              <span key={t.id}
                    className="text-sm px-3 py-1.5 rounded-full bg-immortail-gold/10
                               border border-immortail-gold/25 text-immortail-gold">
                {t.emoji} {t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tribute preview */}
      {form.tribute && (
        <div className="glass-card p-4 border-l-2 border-immortail-gold/40">
          <p className="text-xs text-immortail-gold/60 uppercase tracking-widest mb-2">Your tribute</p>
          <p className="text-immortail-soft text-sm italic leading-relaxed line-clamp-3">
            "{form.tribute}"
          </p>
        </div>
      )}

      <p className="text-immortail-soft/50 text-xs text-center leading-relaxed px-2">
        Everything stays on your device. Private, forever.
        You can add photos, sounds, and memories after setup.
      </p>
    </div>
  );
}
