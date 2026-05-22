/**
 * Immortail™ — Written Memory Entry Component
 * Lets owners write memories, stories, and habits about their dog.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MemoryEntries } from '../../core/storage.js';

const EMOTIONAL_TAGS = [
  { id: 'happy',     emoji: '😊', label: 'Happy' },
  { id: 'funny',     emoji: '😂', label: 'Funny' },
  { id: 'calm',      emoji: '😌', label: 'Calm' },
  { id: 'adventure', emoji: '🌲', label: 'Adventure' },
  { id: 'playful',   emoji: '🎾', label: 'Playful' },
  { id: 'cuddle',    emoji: '🤗', label: 'Cuddle' },
  { id: 'milestone', emoji: '⭐', label: 'Milestone' },
  { id: 'bittersweet', emoji: '🌅', label: 'Bittersweet' },
];

const BLANK = { title: '', text: '', date: '', emotionalTags: [] };

export default function MemoryWriter({ profileId }) {
  const [memories, setMemories] = useState([]);
  const [form, setForm]         = useState(BLANK);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    const list = await MemoryEntries.listByProfile(profileId);
    setMemories(list.sort((a, b) => b.createdAt - a.createdAt));
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const toggleTag = (id) => {
    setForm(prev => ({
      ...prev,
      emotionalTags: prev.emotionalTags.includes(id)
        ? prev.emotionalTags.filter(t => t !== id)
        : [...prev.emotionalTags, id]
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.text.trim()) return;
    setSaving(true);
    try {
      const dateTs = form.date ? new Date(form.date).getTime() : Date.now();
      if (editId) {
        await MemoryEntries.update(editId, {
          title: form.title.trim(),
          text:  form.text.trim(),
          date:  dateTs,
          emotionalTags: form.emotionalTags,
        });
      } else {
        await MemoryEntries.add(profileId, {
          title: form.title.trim(),
          text:  form.text.trim(),
          date:  dateTs,
          emotionalTags: form.emotionalTags,
        });
      }
      setForm(BLANK);
      setShowForm(false);
      setEditId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (memory) => {
    setForm({
      title: memory.title,
      text:  memory.text,
      date:  memory.date ? new Date(memory.date).toISOString().split('T')[0] : '',
      emotionalTags: memory.emotionalTags || [],
    });
    setEditId(memory.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    await MemoryEntries.delete(id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="space-y-5">
      {/* Add button */}
      {!showForm && (
        <button
          onClick={() => { setForm(BLANK); setEditId(null); setShowForm(true); }}
          className="w-full glass-card border-dashed border-white/20 p-4 flex items-center justify-center gap-2
                     text-immortail-soft hover:text-immortail-cream hover:border-immortail-gold/30 transition-all rounded-2xl"
        >
          <span className="text-xl">✍️</span>
          <span className="text-sm">Write a memory</span>
        </button>
      )}

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card-warm p-5 space-y-4"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-lg text-immortail-cream">
                {editId ? 'Edit memory' : 'Write a memory'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditId(null); setForm(BLANK); }}
                className="text-immortail-soft hover:text-immortail-cream transition-colors"
              >✕</button>
            </div>

            <div>
              <label className="field-label">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. The day we went to the beach…"
                className="input-field"
                maxLength={80}
              />
            </div>

            <div>
              <label className="field-label">Memory</label>
              <textarea
                value={form.text}
                onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                placeholder="Tell the story… what happened, how they made you feel, what you want to remember forever."
                className="input-field min-h-[120px] resize-none"
                maxLength={2000}
              />
              <p className="text-right text-xs text-immortail-soft/50 mt-1">{form.text.length}/2000</p>
            </div>

            <div>
              <label className="field-label">Date (optional)</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="field-label">Emotional tags</label>
              <div className="flex flex-wrap gap-2">
                {EMOTIONAL_TAGS.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all border ${
                      form.emotionalTags.includes(tag.id)
                        ? 'bg-immortail-gold/20 border-immortail-gold/50 text-immortail-gold'
                        : 'border-white/10 text-immortail-soft hover:border-white/20'
                    }`}
                  >
                    {tag.emoji} {tag.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.text.trim()}
                className="btn-primary flex-1 py-3 text-sm disabled:opacity-50"
              >
                {saving ? '💛 Saving…' : editId ? '💛 Update' : '💛 Save Memory'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditId(null); setForm(BLANK); }}
                className="btn-ghost px-4 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory list */}
      <div className="space-y-3">
        {memories.length === 0 && !showForm && (
          <div className="text-center py-8 text-immortail-soft text-sm">
            <div className="text-4xl mb-3 opacity-40">💭</div>
            <p>No written memories yet.</p>
            <p className="text-xs mt-1 opacity-60">Every story you write helps reconstruct their personality.</p>
          </div>
        )}
        {memories.map(memory => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            expanded={expanded === memory.id}
            onExpand={() => setExpanded(prev => prev === memory.id ? null : memory.id)}
            onEdit={() => handleEdit(memory)}
            onDelete={() => handleDelete(memory.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Memory Card ──────────────────────────────────────────────────────────────
function MemoryCard({ memory, expanded, onExpand, onEdit, onDelete }) {
  const dateStr = memory.date
    ? new Date(memory.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <motion.div
      layout
      className="glass-card p-4 cursor-pointer"
      onClick={onExpand}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-immortail-cream truncate">{memory.title}</h4>
          {dateStr && <p className="text-xs text-immortail-soft mt-0.5">{dateStr}</p>}
        </div>
        <span className="text-immortail-soft text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Tags */}
      {memory.emotionalTags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {memory.emotionalTags.map(id => {
            const tag = EMOTIONAL_TAGS.find(t => t.id === id);
            return tag ? <span key={id} className="tag-pill text-[10px] px-2 py-0.5">{tag.emoji} {tag.label}</span> : null;
          })}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="divider mt-3 mb-3" />
            <p className="text-immortail-soft text-sm leading-relaxed whitespace-pre-wrap">{memory.text}</p>
            <div className="flex gap-2 mt-4" onClick={e => e.stopPropagation()}>
              <button onClick={onEdit} className="btn-ghost text-xs px-3 py-1.5">✏️ Edit</button>
              <button onClick={onDelete} className="btn-danger text-xs px-3 py-1.5">Delete</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
