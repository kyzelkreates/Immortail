import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { ROUTES, PERSONALITY_TRAITS, DOG_BREEDS, DOG_COLOURS } from '../core/constants.js';
import { Onboarding } from '../core/storage.js';

// ─── Wizard steps ──────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'name',        title: "What was their name?",         emoji: '💛' },
  { id: 'breed',       title: "What breed were they?",        emoji: '🐕' },
  { id: 'colour',      title: "What colour was their coat?",  emoji: '🎨' },
  { id: 'traits',      title: "How would you describe them?", emoji: '✨' },
  { id: 'extras',      title: "A few more details…",          emoji: '📝' },
  { id: 'confirm',     title: "Ready to begin.",              emoji: '🐾' },
];

const INITIAL_FORM = {
  name:        '',
  breed:       '',
  age:         '',
  colour:      '',
  traits:      [],
  favouriteToy: '',
  favouriteCommand: '',
  ownerName:   '',
  tribute:     '',
};

export default function CreateDogPage() {
  const navigate            = useNavigate();
  const { createProfile }   = useApp();
  const [step, setStep]     = useState(0);
  const [form, setForm]     = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const currentStep = STEPS[step];
  const isLast      = step === STEPS.length - 1;
  const progress    = ((step + 1) / STEPS.length) * 100;

  const update = useCallback((key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setError('');
  }, []);

  const toggleTrait = useCallback((id) => {
    setForm(prev => ({
      ...prev,
      traits: prev.traits.includes(id)
        ? prev.traits.filter(t => t !== id)
        : prev.traits.length < 5 ? [...prev.traits, id] : prev.traits
    }));
  }, []);

  const validate = useCallback(() => {
    if (step === 0 && !form.name.trim()) return 'Please enter their name.';
    if (step === 1 && !form.breed)        return 'Please select a breed.';
    if (step === 2 && !form.colour)       return 'Please select a coat colour.';
    if (step === 3 && form.traits.length === 0) return 'Please select at least one trait.';
    return '';
  }, [step, form]);

  const handleNext = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError('');
    setStep(s => Math.max(s - 1, 0));
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const profile = await createProfile({
        name:            form.name.trim(),
        breed:           form.breed,
        age:             form.age ? parseInt(form.age, 10) : null,
        colour:          form.colour,
        traits:          form.traits,
        favouriteToy:    form.favouriteToy.trim(),
        favouriteCommand:form.favouriteCommand.trim(),
        ownerName:       form.ownerName.trim(),
        tribute:         form.tribute.trim(),
      });
      Onboarding.markDone();
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (e) {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-immortail-deep flex flex-col safe-top safe-bottom">
      {/* Header */}
      <header className="flex items-center gap-4 px-5 pt-6 pb-2">
        <button
          onClick={() => step === 0 ? navigate(ROUTES.HOME) : handleBack()}
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center text-immortail-soft hover:text-immortail-cream transition-colors"
        >
          ←
        </button>
        <div className="flex-1">
          <p className="text-xs text-immortail-soft uppercase tracking-widest mb-1">
            Step {step + 1} of {STEPS.length}
          </p>
          {/* Progress bar */}
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-immortail-gold to-immortail-gold-light rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
        <span className="font-display text-immortail-gold text-lg">🐾</span>
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto px-5 pt-6 pb-4 no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-4xl mb-4">{currentStep.emoji}</div>
            <h2 className="font-display text-2xl text-immortail-cream mb-6">{currentStep.title}</h2>

            {/* Step panels */}
            {step === 0 && <StepName value={form.name} onChange={v => update('name', v)} />}
            {step === 1 && <StepBreed value={form.breed} onChange={v => update('breed', v)} />}
            {step === 2 && <StepColour value={form.colour} onChange={v => update('colour', v)} />}
            {step === 3 && <StepTraits selected={form.traits} onToggle={toggleTrait} />}
            {step === 4 && <StepExtras form={form} update={update} />}
            {step === 5 && <StepConfirm form={form} />}

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-400 text-sm mt-4"
              >
                {error}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer nav */}
      <footer className="px-5 pb-6 pt-2">
        <div className="divider-gold" />
        {isLast ? (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>🐾</motion.span>
                Creating…
              </>
            ) : (
              <>🐾 Begin Their Legacy</>
            )}
          </button>
        ) : (
          <button onClick={handleNext} className="btn-primary w-full py-4 text-base">
            Continue →
          </button>
        )}
      </footer>
    </div>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepName({ value, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="field-label">Their name</label>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. Buddy, Luna, Max…"
          className="input-field text-xl font-display"
          maxLength={40}
        />
      </div>
      <p className="text-immortail-soft text-sm">This name will always be with you.</p>
    </div>
  );
}

function StepBreed({ value, onChange }) {
  const [filter, setFilter] = useState('');
  const filtered = DOG_BREEDS.filter(b => b.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="Search breed…"
        className="input-field"
      />
      <div className="max-h-64 overflow-y-auto no-scrollbar space-y-2">
        {filtered.map(breed => (
          <button
            key={breed}
            onClick={() => onChange(breed)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all text-sm
              ${value === breed
                ? 'bg-immortail-gold/20 border border-immortail-gold/50 text-immortail-cream'
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

function StepColour({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {DOG_COLOURS.map(colour => (
        <button
          key={colour.id}
          onClick={() => onChange(colour.id)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-sm
            ${value === colour.id
              ? 'border-immortail-gold/60 bg-immortail-gold/10 text-immortail-cream'
              : 'border-white/10 bg-white/5 text-immortail-soft hover:border-white/20 hover:text-immortail-cream'
            }`}
        >
          <span
            className="w-5 h-5 rounded-full border border-white/20 shrink-0"
            style={{ background: colour.hex }}
          />
          <span className="truncate">{colour.label}</span>
        </button>
      ))}
    </div>
  );
}

function StepTraits({ selected, onToggle }) {
  return (
    <div className="space-y-3">
      <p className="text-immortail-soft text-sm mb-4">Choose up to 5 traits that described them best.</p>
      <div className="grid grid-cols-2 gap-3">
        {PERSONALITY_TRAITS.map(trait => {
          const isSelected = selected.includes(trait.id);
          return (
            <button
              key={trait.id}
              onClick={() => onToggle(trait.id)}
              className={`flex flex-col items-start p-4 rounded-xl border transition-all
                ${isSelected
                  ? 'border-immortail-gold/60 bg-immortail-gold/10 text-immortail-cream'
                  : 'border-white/10 bg-white/5 text-immortail-soft hover:border-white/20'
                }`}
            >
              <span className="text-xl mb-1">{trait.emoji}</span>
              <span className="font-medium text-sm">{trait.label}</span>
              <span className="text-xs opacity-60 mt-0.5">{trait.description}</span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-immortail-gold text-xs text-center mt-2">
          {selected.length}/5 traits selected
        </p>
      )}
    </div>
  );
}

function StepExtras({ form, update }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="field-label">Age (years)</label>
        <input
          type="number"
          value={form.age}
          onChange={e => update('age', e.target.value)}
          placeholder="e.g. 8"
          className="input-field"
          min="0" max="30"
        />
      </div>
      <div>
        <label className="field-label">Favourite toy or object</label>
        <input
          type="text"
          value={form.favouriteToy}
          onChange={e => update('favouriteToy', e.target.value)}
          placeholder="e.g. tennis ball, rope toy…"
          className="input-field"
          maxLength={60}
        />
      </div>
      <div>
        <label className="field-label">Favourite command or phrase</label>
        <input
          type="text"
          value={form.favouriteCommand}
          onChange={e => update('favouriteCommand', e.target.value)}
          placeholder='e.g. "walkies", "good boy"…'
          className="input-field"
          maxLength={60}
        />
      </div>
      <div>
        <label className="field-label">Your name (optional)</label>
        <input
          type="text"
          value={form.ownerName}
          onChange={e => update('ownerName', e.target.value)}
          placeholder="Your name"
          className="input-field"
          maxLength={50}
        />
      </div>
    </div>
  );
}

function StepConfirm({ form }) {
  const colourLabel = DOG_COLOURS.find(c => c.id === form.colour)?.label || form.colour;
  const traits      = PERSONALITY_TRAITS.filter(t => form.traits.includes(t.id));

  return (
    <div className="space-y-5">
      <div className="glass-card-warm p-5 space-y-4">
        <div className="text-center">
          <div className="text-5xl mb-3">🐾</div>
          <h3 className="font-display text-2xl text-immortail-gold">{form.name}</h3>
          <p className="text-immortail-soft text-sm mt-1">
            {form.breed}{form.age ? ` · ${form.age} years` : ''}
          </p>
        </div>

        <div className="divider-gold" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-immortail-soft/70 block mb-0.5">Coat</span>
            <span className="text-immortail-cream">{colourLabel}</span>
          </div>
          {form.favouriteToy && (
            <div>
              <span className="text-immortail-soft/70 block mb-0.5">Favourite toy</span>
              <span className="text-immortail-cream">{form.favouriteToy}</span>
            </div>
          )}
          {form.ownerName && (
            <div>
              <span className="text-immortail-soft/70 block mb-0.5">Owner</span>
              <span className="text-immortail-cream">{form.ownerName}</span>
            </div>
          )}
        </div>

        {traits.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {traits.map(t => (
              <span key={t.id} className="tag-pill">{t.emoji} {t.label}</span>
            ))}
          </div>
        )}
      </div>

      <p className="text-immortail-soft text-sm text-center leading-relaxed">
        Next, you'll add photos, sounds, and memories.<br />
        The more you share, the more alive they become.
      </p>
    </div>
  );
}
