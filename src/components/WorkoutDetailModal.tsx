import { useState } from 'react'
import { COLORS } from '../lib/colors'
import { workoutTypes } from './ui/Badge'
import { Button } from './ui/Button'
import type { Workout, WorkoutType, WorkoutBlock, BlockType } from '../types'
import { useProfile } from '../contexts/ProfileContext'

const BLOCK_COLORS: Record<BlockType, string> = {
  warmup: COLORS.orange,
  interval: COLORS.accent,
  rest: COLORS.muted,
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
      if (threshSec > 0 && pSec > 0) intensityHint = `${Math.round(threshSec / pSec * 100)}% threshold`
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
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Colour bar */}
        <div style={{ height: 3, background: wt.color, opacity: 0.8 }} />

        <div style={{ padding: 28, overflowY: 'auto', maxHeight: 'calc(90vh - 3px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: wt.color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {wt.icon}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.text }}>
                  {mode === 'edit' ? 'Edit Workout' : workout.title}
                </div>
                {mode === 'view' && (
                  <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                    {formatDate(workout.date)}
                    {workout.planned && (
                      <span style={{ marginLeft: 8, color: COLORS.accent, fontWeight: 600, fontSize: 11 }}>● PLANNED</span>
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
              {/* Stat row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Duration', value: formatDuration(workout.duration_minutes) },
                  { label: 'TSS', value: workout.tss > 0 ? String(workout.tss) : '—' },
                  { label: 'Zone', value: workout.zone || '—' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: COLORS.surface, borderRadius: 8, padding: '12px 14px', border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, fontFamily: 'monospace' }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Type */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: wt.color,
                  background: wt.color + '18', border: `1px solid ${wt.color}30`,
                  borderRadius: 6, padding: '4px 10px',
                }}>
                  {wt.icon} {wt.label}
                </span>
              </div>

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
                  <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                  <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, background: COLORS.surface, borderRadius: 8, padding: '12px 14px', border: `1px solid ${COLORS.border}` }}>
                    {workout.notes}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
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
