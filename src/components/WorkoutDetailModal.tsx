import { useState } from 'react'
import { COLORS } from '../lib/colors'
import { workoutTypes } from './ui/Badge'
import { Button } from './ui/Button'
import type { Workout, WorkoutType, WorkoutBlock, BlockType } from '../types'
import { useProfile } from '../contexts/ProfileContext'
import { useIsMobile } from '../hooks/useIsMobile'

const BLOCK_COLORS: Record<BlockType, string> = {
  warmup: COLORS.orange,
  interval: COLORS.accent,
  rest: '#7b8fa6',
  cooldown: COLORS.green,
}

const BLOCK_LABELS: Record<BlockType, string> = {
  warmup: 'Warmup',
  interval: 'Interval',
  rest: 'Rest',
  cooldown: 'Cooldown',
}

function paceToSeconds(pace: string): number {
  const parts = pace.split(':')
  if (parts.length !== 2) return 0
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
}

function secsToPaceStr(secs: number): string {
  if (!secs || secs <= 0) return ''
  return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`
}

interface BlockDisplayProps {
  block: WorkoutBlock
  workoutType: WorkoutType
  ftp?: number
  css?: string
  threshPace?: string
}

function BlockDisplay({ block, workoutType, ftp, css, threshPace }: BlockDisplayProps) {
  const color = BLOCK_COLORS[block.blockType]

  let intensityStr = ''
  let intensityHint = ''

  if (workoutType === 'ride') {
    const pct = parseFloat(block.intensity)
    intensityStr = `${pct}% FTP`
    if (ftp && pct > 0) intensityHint = `${Math.round(pct / 100 * ftp)}w`
  } else if (workoutType === 'run') {
    intensityStr = `${block.intensity}/km`
    if (threshPace) {
      const threshSec = paceToSeconds(threshPace)
      const pSec = paceToSeconds(block.intensity)
      if (threshSec > 0 && pSec > 0) intensityHint = `${Math.round(threshSec / pSec * 100)}% of threshold`
    }
  } else if (workoutType === 'swim') {
    const pct = parseFloat(block.intensity)
    intensityStr = `${pct}% CSS`
    if (css) {
      const cssSec = paceToSeconds(css)
      if (cssSec > 0 && pct > 0) intensityHint = `${secsToPaceStr(cssSec / (pct / 100))}/100m`
    }
  }

  const repsLabel = block.reps > 1 ? `${block.reps}×` : ''

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 12px',
      borderLeft: `3px solid ${color}`,
      background: color + '08',
      borderRadius: '0 6px 6px 0',
      marginBottom: 4,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {repsLabel && <span style={{ marginRight: 4 }}>{repsLabel}</span>}
            {BLOCK_LABELS[block.blockType]}
          </span>
          <span style={{ fontSize: 12, color: COLORS.muted }}>
            {block.durationMinutes} min
            {intensityStr && <> @ <span style={{ color: COLORS.text }}>{intensityStr}</span></>}
            {intensityHint && <span style={{ color: COLORS.muted }}> ({intensityHint})</span>}
          </span>
        </div>
        {block.notes && (
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2, fontStyle: 'italic' }}>{block.notes}</div>
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  color?: string
  unit?: string
}

function StatCard({ label, value, color, unit }: StatCardProps) {
  return (
    <div style={{
      background: COLORS.surface, borderRadius: 8,
      padding: '12px 14px', border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: color ?? COLORS.text, fontFamily: 'DM Mono, monospace' }}>
          {value}
        </div>
        {unit && <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600 }}>{unit}</div>}
      </div>
    </div>
  )
}

interface WorkoutDetailModalProps {
  workout: Workout
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onUpdate: (id: string, updates: Partial<Workout>) => Promise<void>
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function WorkoutDetailModal({ workout, onClose, onDelete, onUpdate }: WorkoutDetailModalProps) {
  const { profile } = useProfile()
  const isMobile = useIsMobile()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: workout.title,
    type: workout.type,
    date: workout.date.split('T')[0],
    duration_minutes: workout.duration_minutes,
    tss: workout.tss,
    zone: workout.zone ?? '',
    notes: workout.notes ?? '',
    planned: workout.planned,
  })

  const wt = workoutTypes[mode === 'edit' ? form.type : workout.type]

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(workout.id)
      onClose()
    } catch {
      setDeleting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onUpdate(workout.id, form)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
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

  const labelStyle = {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: 600 as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    display: 'block',
    marginBottom: 6,
  }

  // Build stat cards — only include ones with real data
  const statCards: StatCardProps[] = []

  if (workout.duration_minutes) {
    statCards.push({ label: 'Duration', value: formatDuration(workout.duration_minutes) })
  }
  if (workout.tss > 0) {
    statCards.push({ label: 'TSS', value: String(workout.tss), color: COLORS.accent })
  }
  if (workout.distance_meters && workout.distance_meters > 0) {
    statCards.push({ label: 'Distance', value: (workout.distance_meters / 1000).toFixed(1), unit: 'km' })
  }
  if (workout.avg_pace) {
    statCards.push({ label: 'Avg Pace', value: workout.avg_pace, unit: workout.type === 'swim' ? '/100m' : '/km', color: COLORS.green })
  }
  if (workout.avg_power && workout.avg_power > 0) {
    statCards.push({ label: 'Avg Power', value: String(workout.avg_power), unit: 'w', color: COLORS.accent })
  }
  if (workout.heart_rate_avg && workout.heart_rate_avg > 0) {
    statCards.push({ label: 'Avg HR', value: String(workout.heart_rate_avg), unit: 'bpm', color: '#f87171' })
  }
  if (workout.heart_rate_max && workout.heart_rate_max > 0) {
    statCards.push({ label: 'Max HR', value: String(workout.heart_rate_max), unit: 'bpm', color: COLORS.orange })
  }
  if (workout.calories && workout.calories > 0) {
    statCards.push({ label: 'Calories', value: String(workout.calories), unit: 'kcal' })
  }
  if (workout.elevation_gain && workout.elevation_gain > 0) {
    statCards.push({ label: 'Elevation', value: String(workout.elevation_gain), unit: 'm', color: COLORS.purple })
  }

  return (
    <div
      onClick={isMobile ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: isMobile ? COLORS.card : 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: isMobile ? 'none' : `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 16,
          width: '100%',
          maxWidth: isMobile ? '100%' : 520,
          maxHeight: isMobile ? '100dvh' : '90vh',
          height: isMobile ? '100dvh' : undefined,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Colour bar */}
        <div style={{ height: 3, background: wt.color, opacity: 0.8, borderRadius: '16px 16px 0 0' }} />

        <div style={{ padding: 28 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: wt.color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                {wt.icon}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.text, lineHeight: 1.2 }}>
                  {mode === 'edit' ? 'Edit Workout' : workout.title}
                </div>
                {mode === 'view' && (
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{formatDate(workout.date)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: wt.color,
                      background: wt.color + '18', border: `1px solid ${wt.color}30`,
                      borderRadius: 4, padding: '2px 7px',
                    }}>
                      {wt.label}
                    </span>
                    {workout.planned && (
                      <span style={{ color: COLORS.accent, fontWeight: 600, fontSize: 11 }}>● PLANNED</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <>
              {/* Stats grid — only populated cards */}
              {statCards.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                  {statCards.map(s => <StatCard key={s.label} {...s} />)}
                </div>
              )}

              {/* Session Focus badge */}
              {workout.zone && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Session Focus</div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: COLORS.accent,
                    background: COLORS.accent + '18', border: `1px solid ${COLORS.accent}30`,
                    borderRadius: 6, padding: '5px 12px',
                  }}>
                    {workout.zone}
                  </span>
                </div>
              )}

              {/* Structured blocks */}
              {workout.structure && workout.structure.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Workout Structure</div>
                  {workout.structure.map(block => (
                    <BlockDisplay
                      key={block.id}
                      block={block}
                      workoutType={workout.type}
                      ftp={profile?.ftp}
                      css={profile?.css}
                      threshPace={profile?.run_pace}
                    />
                  ))}
                </div>
              )}

              {/* Notes */}
              {workout.notes && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Notes</div>
                  <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, background: COLORS.surface, borderRadius: 8, padding: '12px 14px', border: `1px solid ${COLORS.border}` }}>
                    {workout.notes}
                  </div>
                </div>
              )}

              {/* Strava link */}
              {workout.strava_activity_id && (
                <div style={{ marginBottom: 20 }}>
                  <a
                    href={`https://www.strava.com/activities/${workout.strava_activity_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 600, color: '#FC4C02',
                      background: '#FC4C0210', border: '1px solid #FC4C0230',
                      borderRadius: 6, padding: '6px 12px',
                      textDecoration: 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FC4C0220')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#FC4C0210')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FC4C02">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                    </svg>
                    View on Strava
                  </a>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <Button onClick={() => setMode('edit')} style={{ flex: 1 }}>Edit</Button>
                <Button
                  variant="secondary"
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ color: COLORS.orange, borderColor: COLORS.orange + '50' }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  style={inputStyle}
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>

              {/* Type selector */}
              <div>
                <label style={labelStyle}>Type</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(Object.keys(workoutTypes) as WorkoutType[]).map(t => {
                    const wtt = workoutTypes[t]
                    const active = form.type === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, type: t }))}
                        style={{
                          background: active ? wtt.color + '25' : COLORS.surface,
                          border: `1px solid ${active ? wtt.color : COLORS.border}`,
                          color: active ? wtt.color : COLORS.muted,
                          borderRadius: 8, padding: '6px 12px',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {wtt.icon} {wtt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

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
                  <label style={labelStyle}>Duration (min)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))}
                    min={0}
                  />
                </div>
              </div>

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
                <label style={labelStyle}>Session Focus <span style={{ color: COLORS.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span></label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Intervals', 'Race', 'Long'].map(f => {
                    const active = form.zone === f
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setForm(fm => ({ ...fm, zone: active ? '' : f }))}
                        style={{
                          background: active ? COLORS.accent + '20' : COLORS.surface,
                          border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                          color: active ? COLORS.accent : COLORS.muted,
                          borderRadius: 6, padding: '5px 12px',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          transition: 'all 0.12s',
                        }}
                      >
                        {f}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
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
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3,
                    left: form.planned ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
                <span style={{ fontSize: 13, color: COLORS.muted }}>Planned (not yet completed)</span>
              </div>

              {error && (
                <div style={{ color: COLORS.orange, fontSize: 13, padding: '8px 12px', background: COLORS.orange + '15', borderRadius: 8 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Button type="submit" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="secondary" onClick={() => setMode('view')}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
