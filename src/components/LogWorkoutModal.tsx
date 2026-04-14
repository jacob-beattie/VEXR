import { useState, useMemo } from 'react'
import { COLORS } from '../lib/colors'
import type { WorkoutType } from '../types'
import { Button } from './ui/Button'
import { workoutTypes } from './ui/Badge'
import { useProfile } from '../contexts/ProfileContext'

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

// "4:30" → 270 seconds
function paceToSeconds(pace: string): number {
  const parts = pace.split(':')
  if (parts.length !== 2) return 0
  const mins = parseInt(parts[0]) || 0
  const secs = parseInt(parts[1]) || 0
  return mins * 60 + secs
}

function computeTSS(
  type: WorkoutType,
  durationMinutes: number,
  avgPace: string,       // run: min/km
  avgPower: number,      // ride: watts
  distance: number,      // swim: metres
  rpe: number,           // strength/rest: 1–10
  ftp: number,
  threshPace: string,    // run threshold pace (min/km)
  css: string,           // swim CSS (min/100m)
): number {
  const durationHrs = durationMinutes / 60

  if (type === 'run') {
    const threshSec = paceToSeconds(threshPace)
    const avgSec = paceToSeconds(avgPace)
    if (!threshSec || !avgSec) return 0
    const IF = threshSec / avgSec
    return Math.round(durationHrs * IF * IF * 100)
  }

  if (type === 'ride') {
    if (!ftp || !avgPower) return 0
    const IF = avgPower / ftp
    return Math.round(durationHrs * IF * IF * 100)
  }

  if (type === 'swim') {
    const cssSec = paceToSeconds(css)
    if (!cssSec || !distance || !durationMinutes) return 0
    // avg pace per 100m in seconds
    const avgPacePer100m = (durationMinutes * 60) / (distance / 100)
    const IF = cssSec / avgPacePer100m
    return Math.round(durationHrs * IF * IF * 100)
  }

  if (type === 'strength' || type === 'rest') {
    return Math.round(durationMinutes * rpe * 0.5)
  }

  return 0
}

const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

export function LogWorkoutModal({ onClose, onSubmit, initialDate }: LogWorkoutModalProps) {
  const { profile } = useProfile()

  const [form, setForm] = useState({
    title: '',
    type: 'run' as WorkoutType,
    date: initialDate || today,
    duration_minutes: 60,
    zone: '',
    notes: '',
    planned: false,
  })

  // Type-specific inputs
  const [avgPace, setAvgPace] = useState('') // run: min/km
  const [avgPower, setAvgPower] = useState(0) // ride: watts
  const [swimDistance, setSwimDistance] = useState(0) // swim: metres
  const [rpe, setRpe] = useState(5) // strength/rest: 1–10

  // TSS override
  const [tssOverride, setTssOverride] = useState<number | null>(null)
  const [editingTss, setEditingTss] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const ftp = profile?.ftp || 0
  const threshPace = profile?.run_pace || ''
  const css = profile?.css || ''

  const calculatedTss = useMemo(() => computeTSS(
    form.type,
    form.duration_minutes,
    avgPace,
    avgPower,
    swimDistance,
    rpe,
    ftp,
    threshPace,
    css,
  ), [form.type, form.duration_minutes, avgPace, avgPower, swimDistance, rpe, ftp, threshPace, css])

  const effectiveTss = tssOverride !== null ? tssOverride : calculatedTss

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({ ...form, tss: effectiveTss })
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

  // Which profile benchmark is missing for this type
  const missingBenchmark =
    form.type === 'run' && !threshPace ? 'threshold pace (set in Profile)' :
    form.type === 'ride' && !ftp ? 'FTP (set in Profile)' :
    form.type === 'swim' && !css ? 'CSS (set in Profile)' :
    null

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
                    onClick={() => {
                      setForm(f => ({ ...f, type: t }))
                      setTssOverride(null)
                      setEditingTss(false)
                    }}
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

          {/* Type-specific TSS inputs */}
          {form.type === 'run' && (
            <div>
              <label style={labelStyle}>Avg Pace (min/km)</label>
              <input
                style={inputStyle}
                value={avgPace}
                onChange={e => setAvgPace(e.target.value)}
                placeholder={threshPace ? `e.g. 5:00  (threshold: ${threshPace}/km)` : 'e.g. 5:00'}
              />
            </div>
          )}

          {form.type === 'ride' && (
            <div>
              <label style={labelStyle}>Avg Power (watts)</label>
              <input
                type="number"
                style={inputStyle}
                value={avgPower || ''}
                onChange={e => setAvgPower(parseInt(e.target.value) || 0)}
                placeholder={ftp ? `e.g. 200  (FTP: ${ftp}w)` : 'e.g. 200'}
                min={0}
              />
            </div>
          )}

          {form.type === 'swim' && (
            <div>
              <label style={labelStyle}>Distance (metres)</label>
              <input
                type="number"
                style={inputStyle}
                value={swimDistance || ''}
                onChange={e => setSwimDistance(parseInt(e.target.value) || 0)}
                placeholder={css ? `e.g. 2000  (CSS: ${css}/100m)` : 'e.g. 2000'}
                min={0}
              />
            </div>
          )}

          {(form.type === 'strength' || form.type === 'rest') && (
            <div>
              <label style={labelStyle}>RPE (1–10) — {rpe}</label>
              <input
                type="range"
                min={1} max={10}
                value={rpe}
                onChange={e => setRpe(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: COLORS.accent, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.muted, marginTop: 4 }}>
                <span>1 — Very easy</span>
                <span>5 — Moderate</span>
                <span>10 — Max effort</span>
              </div>
            </div>
          )}

          {/* TSS row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>
                TSS
                {tssOverride === null && (
                  <span style={{ marginLeft: 6, color: COLORS.accent, fontWeight: 700, fontSize: 9, letterSpacing: '0.08em' }}>AUTO</span>
                )}
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {editingTss ? (
                  <input
                    type="number"
                    style={{ ...inputStyle, flex: 1 }}
                    value={tssOverride ?? calculatedTss}
                    onChange={e => setTssOverride(parseInt(e.target.value) || 0)}
                    min={0}
                    autoFocus
                  />
                ) : (
                  <div style={{
                    ...inputStyle,
                    flex: 1,
                    color: tssOverride !== null ? COLORS.text : COLORS.accent,
                    fontFamily: "'DM Mono', monospace",
                    fontWeight: 700,
                  }}>
                    {effectiveTss}
                  </div>
                )}
                {editingTss ? (
                  <button
                    type="button"
                    onClick={() => { setTssOverride(null); setEditingTss(false) }}
                    style={{
                      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, padding: '8px 10px', color: COLORS.accent,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Auto
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setTssOverride(calculatedTss); setEditingTss(true) }}
                    style={{
                      background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                      borderRadius: 8, padding: '8px 10px', color: COLORS.muted,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
              {missingBenchmark && (
                <div style={{ marginTop: 5, fontSize: 10, color: COLORS.orange }}>
                  Set your {missingBenchmark} for auto TSS
                </div>
              )}
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
