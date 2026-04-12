import { useState } from 'react'
import { COLORS } from '../lib/colors'
import type { WorkoutType } from '../types'
import { Button } from './ui/Button'
import { workoutTypes } from './ui/Badge'

interface LogWorkoutModalProps {
  onClose: () => void
  onSubmit: (workout: {
    title: string
    type: WorkoutType
    date: string
    duration_minutes: number
    tss: number
    zone: string
    notes: string
    planned: boolean
  }) => Promise<void>
  initialDate?: string
}

const today = new Date().toISOString().split('T')[0]

export function LogWorkoutModal({ onClose, onSubmit, initialDate }: LogWorkoutModalProps) {
  const [form, setForm] = useState({
    title: '',
    type: 'run' as WorkoutType,
    date: initialDate || today,
    duration_minutes: 60,
    tss: 0,
    zone: '',
    notes: '',
    planned: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit(form)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = {
    fontSize: 11, color: COLORS.muted, fontWeight: 600 as const,
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    display: 'block', marginBottom: 6,
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
    fontFamily: 'inherit',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: 28,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>Log Workout</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              style={inputStyle}
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Morning Run"
              required
            />
          </div>

          {/* Type selector */}
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(workoutTypes) as WorkoutType[]).map(t => {
                const wt = workoutTypes[t]
                const active = form.type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    style={{
                      background: active ? wt.color + '25' : COLORS.surface,
                      border: `1px solid ${active ? wt.color : COLORS.border}`,
                      color: active ? wt.color : COLORS.muted,
                      borderRadius: 8, padding: '7px 14px',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.12s',
                    }}
                  >
                    {wt.icon} {wt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date & Duration row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                style={{ ...inputStyle, colorScheme: 'dark' }}
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Duration (minutes)</label>
              <input
                type="number"
                style={inputStyle}
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))}
                min={0}
              />
            </div>
          </div>

          {/* TSS & Zone row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>TSS</label>
              <input
                type="number"
                style={inputStyle}
                value={form.tss}
                onChange={e => setForm(f => ({ ...f, tss: parseInt(e.target.value) || 0 }))}
                min={0}
              />
            </div>
            <div>
              <label style={labelStyle}>Zone</label>
              <input
                style={inputStyle}
                value={form.zone}
                onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                placeholder="e.g. Zone 2"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, height: 80, resize: 'vertical' }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="How did it go?"
            />
          </div>

          {/* Planned toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, planned: !f.planned }))}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: form.planned ? COLORS.accent : COLORS.subtle,
                border: 'none', cursor: 'pointer',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3,
                left: form.planned ? 21 : 3,
                width: 16, height: 16, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </button>
            <span style={{ fontSize: 13, color: COLORS.muted }}>Mark as planned (not yet completed)</span>
          </div>

          {error && (
            <div style={{ color: COLORS.orange, fontSize: 13, padding: '8px 12px', background: COLORS.orange + '15', borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button type="submit" disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Saving...' : 'Log Workout'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
