import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import type { WorkoutLibraryItem, WorkoutType } from '../../types'
import { supabase } from '../../lib/supabase'
import { Badge, workoutTypes } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useIsMobile } from '../../hooks/useIsMobile'

interface LibraryPageProps {
  items: WorkoutLibraryItem[]
  onRefresh: () => void
  onAddToCalendar?: (item: WorkoutLibraryItem) => void
}

const emptyForm = {
  name: '',
  type: 'run' as WorkoutType,
  duration_minutes: 60,
  tss: 0,
  description: '',
}

export function LibraryPage({ items, onRefresh, onAddToCalendar }: LibraryPageProps) {
  const isMobile = useIsMobile()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<WorkoutType | 'all'>('all')

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('workout_library').insert({ ...form, user_id: user.id })
      setShowForm(false)
      setForm(emptyForm)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('workout_library').delete().eq('id', id)
    onRefresh()
  }

  const inputStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: COLORS.text,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filter strip — scrollable on mobile */}
      <div style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as unknown as undefined,
        paddingBottom: 2,
      }}>
        <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
          {(['all', 'run', 'ride', 'swim', 'strength', 'rest'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                background: filter === t ? COLORS.accentDim : COLORS.surface,
                border: `1px solid ${filter === t ? COLORS.accent : COLORS.border}`,
                color: filter === t ? COLORS.accent : COLORS.muted,
                borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {t === 'all' ? 'All' : workoutTypes[t].icon + ' ' + workoutTypes[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: inline Add button */}
      {!isMobile && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -12 }}>
          <Button onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ Add Workout'}
          </Button>
        </div>
      )}

      {showForm && (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: isMobile ? '18px 16px' : 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>Add to Library</div>
            {isMobile && (
              <button
                onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Name</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sweet Spot Intervals" required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Type</label>
                <select style={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as WorkoutType }))}>
                  <option value="run">Run</option>
                  <option value="ride">Ride</option>
                  <option value="swim">Swim</option>
                  <option value="strength">Strength</option>
                  <option value="rest">Rest</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Duration (min)</label>
                <input type="number" style={inputStyle} value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))} min={0} />
              </div>
              <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>TSS</label>
                <input type="number" style={inputStyle} value={form.tss} onChange={e => setForm(f => ({ ...f, tss: parseInt(e.target.value) || 0 }))} min={0} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Description</label>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical', fontFamily: 'inherit' }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the workout structure..."
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add to Library'}</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>No workouts in library</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>Add your go-to workouts to quickly log them</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(item => {
            const wt = workoutTypes[item.type]
            const h = Math.floor(item.duration_minutes / 60)
            const m = item.duration_minutes % 60
            const duration = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
            return (
              <div key={item.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: wt.color, opacity: 0.7 }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{wt.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{item.name}</span>
                  </div>
                  <Badge type={item.type} />
                </div>
                {item.description && (
                  <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12, lineHeight: 1.5 }}>{item.description}</div>
                )}
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: wt.color, fontFamily: 'monospace' }}>{duration}</div>
                    <div style={{ fontSize: 10, color: COLORS.muted }}>duration</div>
                  </div>
                  {item.tss > 0 && (
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, fontFamily: 'monospace' }}>{item.tss}</div>
                      <div style={{ fontSize: 10, color: COLORS.muted }}>TSS</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {onAddToCalendar && (
                    <button
                      onClick={() => onAddToCalendar(item)}
                      style={{ background: wt.color + '20', border: `1px solid ${wt.color}40`, color: wt.color, borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: 1, fontFamily: 'inherit' }}
                    >
                      + Schedule
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{ background: COLORS.orange + '20', border: `1px solid ${COLORS.orange}40`, color: COLORS.orange, borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flex: onAddToCalendar ? undefined : 1, fontFamily: 'inherit' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mobile FAB */}
      {isMobile && (
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 90,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: showForm ? COLORS.surface : COLORS.accent,
            border: showForm ? `1px solid ${COLORS.border}` : 'none',
            color: showForm ? COLORS.muted : '#fff',
            fontSize: 26,
            fontWeight: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1,
          }}
        >
          {showForm ? '×' : '+'}
        </button>
      )}
    </div>
  )
}
