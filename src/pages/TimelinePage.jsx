import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { Timeline, MemoryEntries } from '../core/storage.js';
import { TIMELINE_EVENT_TYPES } from '../core/constants.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import NavBar     from '../components/ui/NavBar.jsx';

const BLANK = { date: '', title: '', description: '', type: 'memory' };

export default function TimelinePage() {
  const { activeProfileId, profile } = useApp();
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(BLANK);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!activeProfileId) return;
    setLoading(true);
    const [timelineEvts, memories] = await Promise.all([
      Timeline.listByProfile(activeProfileId),
      MemoryEntries.listByProfile(activeProfileId),
    ]);
    const memoryEvents = memories.map(m => ({
      id:          `mem:${m.id}`,
      date:        m.date,
      title:       m.title,
      description: m.text?.slice(0, 120) + (m.text?.length > 120 ? '…' : ''),
      type:        'memory',
      source:      'memory',
      tags:        m.emotionalTags,
    }));
    const all = [
      ...timelineEvts.map(e => ({ ...e, source: 'timeline' })),
      ...memoryEvents,
    ].sort((a, b) => (a.date || 0) - (b.date || 0));
    setEvents(all);
    setLoading(false);
  }, [activeProfileId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    try {
      const dateTs = new Date(form.date).getTime();
      await Timeline.add(activeProfileId, {
        date:        dateTs,
        title:       form.title.trim(),
        description: form.description.trim(),
        type:        form.type,
      });
      setForm(BLANK);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (event) => {
    if (event.source === 'timeline') {
      await Timeline.delete(event.id);
      await load();
    }
  };

  // Group events by year
  const grouped = {};
  events.forEach(e => {
    const year = e.date ? new Date(e.date).getFullYear() : 'Unknown';
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(e);
  });
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">
      <PageHeader
        title="Life Timeline"
        subtitle={profile?.name ? `${profile.name}'s story` : undefined}
        actions={
          <button
            onClick={() => { setForm(BLANK); setShowForm(true); }}
            className="w-9 h-9 rounded-full glass-card flex items-center justify-center text-immortail-gold text-lg"
          >+</button>
        }
      />

      <div className="px-5 space-y-5">
        {/* Add form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass-card-warm p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-immortail-cream">Add Event</h3>
                <button
                  onClick={() => { setShowForm(false); setForm(BLANK); }}
                  className="text-immortail-soft hover:text-immortail-cream transition-colors"
                >✕</button>
              </div>

              <div>
                <label className="field-label">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="field-label">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. First day home"
                  className="input-field"
                  maxLength={80}
                />
              </div>

              <div>
                <label className="field-label">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Tell the story…"
                  className="input-field min-h-[80px] resize-none"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="field-label">Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {TIMELINE_EVENT_TYPES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setForm(p => ({ ...p, type: t.id }))}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all ${
                        form.type === t.id
                          ? 'border-immortail-gold/50 bg-immortail-gold/10 text-immortail-cream'
                          : 'border-white/10 text-immortail-soft hover:border-white/20'
                      }`}
                    >
                      <span>{t.emoji}</span>
                      <span className="truncate w-full text-center">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.date}
                className="btn-primary w-full py-3 text-sm disabled:opacity-50"
              >
                {saving ? '💛 Saving…' : '💛 Add to Timeline'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading && (
          <div className="text-center py-14">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="text-3xl inline-block"
            >🐾</motion.span>
          </div>
        )}

        {/* Empty state */}
        {!loading && events.length === 0 && (
          <div className="text-center py-14">
            <div className="text-5xl mb-3 opacity-40">📅</div>
            <p className="text-immortail-soft text-sm">No timeline events yet.</p>
            <p className="text-xs text-immortail-soft/50 mt-1">Add milestones, memories, and special moments.</p>
          </div>
        )}

        {/* Timeline grouped by year */}
        {!loading && years.map(year => (
          <div key={year}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-immortail-gold/20" />
              <span className="font-display text-immortail-gold text-sm">{year}</span>
              <div className="h-px flex-1 bg-immortail-gold/20" />
            </div>

            <div className="relative pl-5">
              {/* Vertical line */}
              <div className="absolute left-1.5 top-0 bottom-0 w-px bg-immortail-gold/20" />

              <div className="space-y-4">
                {grouped[year].map((event, i) => {
                  const typeInfo = TIMELINE_EVENT_TYPES.find(t => t.id === event.type);
                  const dateStr  = event.date
                    ? new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
                    : null;

                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="relative"
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-3 top-4 w-3 h-3 rounded-full bg-immortail-gold/60 border-2 border-immortail-deep" />

                      <div className="glass-card p-4 ml-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg shrink-0">{typeInfo?.emoji || '💭'}</span>
                            <div className="min-w-0">
                              <p className="font-medium text-immortail-cream text-sm truncate">{event.title}</p>
                              {dateStr && <p className="text-xs text-immortail-soft mt-0.5">{dateStr}</p>}
                            </div>
                          </div>
                          {event.source === 'timeline' && (
                            <button
                              onClick={() => handleDelete(event)}
                              className="text-immortail-soft/40 hover:text-red-400 transition-colors text-xs shrink-0 ml-1"
                              aria-label="Delete"
                            >✕</button>
                          )}
                        </div>

                        {event.description && (
                          <p className="text-xs text-immortail-soft mt-2 leading-relaxed">{event.description}</p>
                        )}

                        {event.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {event.tags.map(tag => (
                              <span key={tag} className="tag-pill text-[10px] px-2 py-0.5">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <NavBar />
    </div>
  );
}
