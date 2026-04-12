import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import type { TrainingPlan } from '../../types'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'

interface PlansPageProps {
  plans: TrainingPlan[]
  onRefresh: () => void
}

const statusColors: Record<TrainingPlan['status'], string> = {
  active: COLORS.green,
  complete: COLORS.accent,
  upcoming: COLORS.muted,
}

const sportIcons: Record<string, string> = {
  triathlon: '🏊🚴🏃',
  cycling: '🚴',
  running: '🏃',
  swimming: '🏊',
  strength: '💪',
}

export function PlansPage({ plans, onRefresh }: PlansPageProps) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', sport: 'triathlon', total_weeks: 12 })
  const [saving, setSaving] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('training_plans').insert({
        ...form,
        user_id: user.id,
        status: 'upcoming',
        current_week: 0,
      })
      setShowForm(false)
      setForm({ name: '', sport: 'triathlon', total_weeks: 12 })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('training_plans').delete().eq('id', id)
    onRefresh()
  }

  const handleStatusChange = async (id: string, status: TrainingPlan['status']) => {
    await supabase.from('training_plans').update({ status }).eq('id', id)
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
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New Plan'}
        </Button>
      </div>

      {showForm && (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '24px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: COLORS.text }}>Create Training Plan</div>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Plan Name</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ironman 70.3 Build" required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Sport</label>
                <select style={inputStyle} value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}>
                  <option value="triathlon">Triathlon</option>
                  <option value="cycling">Cycling</option>
                  <option value="running">Running</option>
                  <option value="swimming">Swimming</option>
                  <option value="strength">Strength</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Total Weeks</label>
                <input type="number" style={inputStyle} value={form.total_weeks} onChange={e => setForm(f => ({ ...f, total_weeks: parseInt(e.target.value) || 12 }))} min={1} max={52} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Plan'}</Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {plans.length === 0 && !showForm ? (
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>No training plans yet</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>Create your first plan to get structured</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.map(plan => {
            const pct = plan.total_weeks > 0 ? Math.round((plan.current_week / plan.total_weeks) * 100) : 0
            const statusColor = statusColors[plan.status]
            return (
              <div key={plan.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: statusColor, opacity: 0.7 }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 20 }}>{sportIcons[plan.sport] || '🏋️'}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{plan.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
                      {plan.total_weeks} weeks · Week {plan.current_week} of {plan.total_weeks} ·{' '}
                      <span style={{ color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>{plan.status}</span>
                    </div>
                    <div style={{ background: COLORS.subtle, borderRadius: 4, height: 6, overflow: 'hidden', maxWidth: 300 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: statusColor, borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>{pct}% complete</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {plan.status === 'upcoming' && (
                      <button
                        onClick={() => handleStatusChange(plan.id, 'active')}
                        style={{ background: COLORS.green + '20', border: `1px solid ${COLORS.green}40`, color: COLORS.green, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Start
                      </button>
                    )}
                    {plan.status === 'active' && (
                      <button
                        onClick={() => handleStatusChange(plan.id, 'complete')}
                        style={{ background: COLORS.accent + '20', border: `1px solid ${COLORS.accent}40`, color: COLORS.accent, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Complete
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(plan.id)}
                      style={{ background: COLORS.orange + '20', border: `1px solid ${COLORS.orange}40`, color: COLORS.orange, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
