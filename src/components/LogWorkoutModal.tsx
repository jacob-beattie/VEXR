import { useState, useMemo } from 'react'
import { COLORS } from '../lib/colors'
import type { WorkoutType, WorkoutBlock, BlockType } from '../types'
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
    structure?: WorkoutBlock[] | null
  }) => Promise<void>
  initialDate?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function paceToSeconds(pace: string): number {
  const parts = pace.split(':')
  if (parts.length !== 2) return 0
  const mins = parseInt(parts[0]) || 0
  const secs = parseInt(parts[1]) || 0
  return mins * 60 + secs
}

function secsToPaceStr(secs: number): string {
  if (!secs || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Simple-mode TSS
function computeSimpleTSS(
  type: WorkoutType, durationMinutes: number,
  avgPace: string, avgPower: number, swimDistance: number, rpe: number,
  ftp: number, threshPace: string, css: string,
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
    if (!cssSec || !swimDistance || !durationMinutes) return 0
    const avgPacePer100m = (durationMinutes * 60) / (swimDistance / 100)
    const IF = cssSec / avgPacePer100m
    return Math.round(durationHrs * IF * IF * 100)
  }
  if (type === 'strength' || type === 'rest') {
    return Math.round(durationMinutes * rpe * 0.5)
  }
  return 0
}

// Intensity Factor for a single block
function blockIF(block: WorkoutBlock, type: WorkoutType, ftp: number, threshPace: string, css: string): number {
  if (type === 'ride') {
    const pct = parseFloat(block.intensity)
    return pct > 0 ? pct / 100 : 0
  }
  if (type === 'run') {
    const threshSec = paceToSeconds(threshPace)
    const avgSec = paceToSeconds(block.intensity)
    return threshSec > 0 && avgSec > 0 ? threshSec / avgSec : 0
  }
  if (type === 'swim') {
    const pct = parseFloat(block.intensity)
    return pct > 0 ? pct / 100 : 0
  }
  return 0
}

function computeStructuredTSS(blocks: WorkoutBlock[], type: WorkoutType, ftp: number, threshPace: string, css: string): number {
  return blocks.reduce((sum, block) => {
    const durationHrs = (block.durationMinutes * block.reps) / 60
    const IF = blockIF(block, type, ftp, threshPace, css)
    return sum + Math.round(durationHrs * IF * IF * 100)
  }, 0)
}

function computeStructuredDuration(blocks: WorkoutBlock[]): number {
  return blocks.reduce((sum, b) => sum + b.durationMinutes * b.reps, 0)
}

// ─── Block constants ─────────────────────────────────────────────────────────

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

const DEFAULT_INTENSITY: Record<WorkoutType, Record<BlockType, string>> = {
  ride:     { warmup: '55', interval: '80', rest: '40', cooldown: '50' },
  run:      { warmup: '5:30', interval: '4:45', rest: '6:00', cooldown: '5:30' },
  swim:     { warmup: '70', interval: '90', rest: '50', cooldown: '65' },
  strength: { warmup: '55', interval: '80', rest: '40', cooldown: '50' },
  rest:     { warmup: '55', interval: '80', rest: '40', cooldown: '50' },
}

const DEFAULT_DURATION: Record<BlockType, number> = {
  warmup: 10, interval: 10, rest: 3, cooldown: 10,
}

function newBlock(blockType: BlockType, workoutType: WorkoutType): WorkoutBlock {
  return {
    id: Math.random().toString(36).slice(2, 9),
    blockType,
    durationMinutes: DEFAULT_DURATION[blockType],
    reps: blockType === 'interval' || blockType === 'rest' ? 3 : 1,
    intensity: DEFAULT_INTENSITY[workoutType]?.[blockType] ?? '70',
    notes: '',
  }
}

// ─── BlockRow ────────────────────────────────────────────────────────────────

interface BlockRowProps {
  block: WorkoutBlock
  index: number
  workoutType: WorkoutType
  ftp: number
  threshPace: string
  css: string
  dragSrcIdx: number | null
  dragOverIdx: number | null
  onChange: (updated: WorkoutBlock) => void
  onDelete: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function BlockRow({ block, index, workoutType, ftp, threshPace, css, dragSrcIdx, dragOverIdx, onChange, onDelete, onDragStart, onDragOver, onDrop }: BlockRowProps) {
  const [showNotes, setShowNotes] = useState(!!block.notes)
  const color = BLOCK_COLORS[block.blockType]
  const isDragging = dragSrcIdx === index
  const isTarget = dragOverIdx === index && dragSrcIdx !== index

  const intensityLabel = workoutType === 'run' ? 'min/km' : workoutType === 'swim' ? '% CSS' : '% FTP'

  // Intensity hint
  let hint = ''
  if (workoutType === 'ride' && ftp) {
    const pct = parseFloat(block.intensity)
    if (pct > 0) hint = `≈ ${Math.round(pct / 100 * ftp)}w`
  } else if (workoutType === 'run' && threshPace) {
    const threshSec = paceToSeconds(threshPace)
    const pSec = paceToSeconds(block.intensity)
    if (threshSec > 0 && pSec > 0) hint = `≈ ${Math.round(threshSec / pSec * 100)}% thresh`
  } else if (workoutType === 'swim' && css) {
    const cssSec = paceToSeconds(css)
    const pct = parseFloat(block.intensity)
    if (cssSec > 0 && pct > 0) {
      const paceSec = cssSec / (pct / 100)
      hint = `≈ ${secsToPaceStr(paceSec)}/100m`
    }
  }

  const inputSm: React.CSSProperties = {
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '6px 8px',
    color: COLORS.text,
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); onDragOver(e) }}
      onDrop={onDrop}
      onDragEnd={() => { /* handled by parent drop */ }}
      style={{
        background: COLORS.surface,
        border: `1px solid ${isTarget ? color + '80' : COLORS.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: '10px 12px',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
        cursor: 'default',
        marginBottom: 6,
        boxShadow: isTarget ? `0 0 0 1px ${color}40` : 'none',
      }}
    >
      {/* Row 1: drag + type + duration + reps + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Drag handle */}
        <div
          style={{ color: COLORS.muted, fontSize: 14, cursor: 'grab', padding: '0 2px', userSelect: 'none', flexShrink: 0 }}
          title="Drag to reorder"
        >
          ⠿
        </div>

        {/* Block type */}
        <select
          value={block.blockType}
          onChange={e => onChange({ ...block, blockType: e.target.value as BlockType })}
          style={{
            background: COLORS.bg,
            border: `1px solid ${color}50`,
            borderRadius: 6,
            color: color,
            fontSize: 11,
            fontWeight: 700,
            padding: '5px 6px',
            cursor: 'pointer',
            outline: 'none',
            fontFamily: 'inherit',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map(bt => (
            <option key={bt} value={bt} style={{ color: COLORS.text, background: COLORS.surface }}>
              {BLOCK_LABELS[bt]}
            </option>
          ))}
        </select>

        {/* Duration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input
            type="number"
            className="no-spinner"
            value={block.durationMinutes}
            onChange={e => onChange({ ...block, durationMinutes: parseInt(e.target.value) || 0 })}
            min={0}
            style={{ ...inputSm, width: 56, textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: COLORS.muted, flexShrink: 0 }}>min</span>
        </div>

        {/* Reps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: COLORS.muted }}>×</span>
          <input
            type="number"
            className="no-spinner"
            value={block.reps}
            onChange={e => onChange({ ...block, reps: Math.max(1, parseInt(e.target.value) || 1) })}
            min={1}
            style={{ ...inputSm, width: 48, textAlign: 'center' }}
          />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Notes toggle */}
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          title="Add notes"
          style={{
            background: 'none', border: 'none',
            color: showNotes ? COLORS.accent : COLORS.muted,
            cursor: 'pointer', fontSize: 13, padding: '2px 4px', flexShrink: 0,
          }}
        >
          ✎
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'none', border: 'none',
            color: COLORS.muted, cursor: 'pointer',
            fontSize: 16, padding: '2px 4px', lineHeight: 1, flexShrink: 0,
          }}
          title="Remove block"
        >
          ×
        </button>
      </div>

      {/* Row 2: intensity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <input
          type={workoutType === 'run' ? 'text' : 'number'}
          className="no-spinner"
          value={block.intensity}
          onChange={e => onChange({ ...block, intensity: e.target.value })}
          placeholder={DEFAULT_INTENSITY[workoutType]?.[block.blockType] ?? '70'}
          min={workoutType !== 'run' ? 0 : undefined}
          max={workoutType !== 'run' ? 200 : undefined}
          style={{ ...inputSm, width: 76, textAlign: 'center' }}
        />
        <span style={{ fontSize: 11, color: COLORS.muted, flexShrink: 0 }}>{intensityLabel}</span>
        {hint && (
          <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>{hint}</span>
        )}
      </div>

      {/* Row 3: notes (optional) */}
      {showNotes && (
        <div style={{ marginTop: 8, paddingLeft: 24 }}>
          <input
            type="text"
            value={block.notes ?? ''}
            onChange={e => onChange({ ...block, notes: e.target.value })}
            placeholder="e.g. stay in aero position"
            style={{ ...inputSm, width: '100%' }}
          />
        </div>
      )}
    </div>
  )
}

// ─── StructuredBuilder ───────────────────────────────────────────────────────

interface StructuredBuilderProps {
  blocks: WorkoutBlock[]
  setBlocks: (blocks: WorkoutBlock[]) => void
  workoutType: WorkoutType
  ftp: number
  threshPace: string
  css: string
}

function StructuredBuilder({ blocks, setBlocks, workoutType, ftp, threshPace, css }: StructuredBuilderProps) {
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const reorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    const arr = [...blocks]
    const [item] = arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, item)
    setBlocks(arr)
  }

  const updateBlock = (i: number, updated: WorkoutBlock) => {
    const arr = [...blocks]
    arr[i] = updated
    setBlocks(arr)
  }

  const deleteBlock = (i: number) => {
    setBlocks(blocks.filter((_, idx) => idx !== i))
  }

  const addBlock = (blockType: BlockType) => {
    setBlocks([...blocks, newBlock(blockType, workoutType)])
  }

  const totalDuration = computeStructuredDuration(blocks)
  const totalTSS = computeStructuredTSS(blocks, workoutType, ftp, threshPace, css)

  return (
    <div>
      {/* Block list */}
      {blocks.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '24px 0', color: COLORS.muted,
          fontSize: 13, border: `1px dashed ${COLORS.border}`, borderRadius: 8,
        }}>
          No blocks yet — add one below
        </div>
      ) : (
        <div
          onDragEnd={() => { setDragSrcIdx(null); setDragOverIdx(null) }}
        >
          {blocks.map((block, i) => (
            <BlockRow
              key={block.id}
              block={block}
              index={i}
              workoutType={workoutType}
              ftp={ftp}
              threshPace={threshPace}
              css={css}
              dragSrcIdx={dragSrcIdx}
              dragOverIdx={dragOverIdx}
              onChange={updated => updateBlock(i, updated)}
              onDelete={() => deleteBlock(i)}
              onDragStart={() => setDragSrcIdx(i)}
              onDragOver={e => { e.preventDefault(); setDragOverIdx(i) }}
              onDrop={e => { e.preventDefault(); if (dragSrcIdx !== null) reorder(dragSrcIdx, i); setDragSrcIdx(null); setDragOverIdx(null) }}
            />
          ))}
        </div>
      )}

      {/* Add block buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {(Object.keys(BLOCK_LABELS) as BlockType[]).map(bt => (
          <button
            key={bt}
            type="button"
            onClick={() => addBlock(bt)}
            style={{
              background: 'none',
              border: `1px dashed ${BLOCK_COLORS[bt]}60`,
              borderRadius: 6,
              color: BLOCK_COLORS[bt],
              fontSize: 11, fontWeight: 600,
              padding: '5px 10px', cursor: 'pointer',
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = BLOCK_COLORS[bt])}
            onMouseLeave={e => (e.currentTarget.style.borderColor = BLOCK_COLORS[bt] + '60')}
          >
            + {BLOCK_LABELS[bt]}
          </button>
        ))}
      </div>

      {/* Totals summary */}
      {blocks.length > 0 && (
        <div style={{
          marginTop: 12,
          background: COLORS.bg,
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          gap: 24,
          border: `1px solid ${COLORS.border}`,
        }}>
          <div>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Total Duration</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, fontFamily: "'DM Mono', monospace" }}>
              {totalDuration} min
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Est. TSS</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.accent, fontFamily: "'DM Mono', monospace" }}>
              {totalTSS}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────────────────────

const SESSION_FOCUS = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Intervals', 'Race', 'Long']

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

  const [mode, setMode] = useState<'simple' | 'structured'>('simple')
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([])

  // Simple mode type-specific inputs
  const [avgPace, setAvgPace] = useState('')
  const [avgPower, setAvgPower] = useState(0)
  const [swimDistance, setSwimDistance] = useState(0)
  const [rpe, setRpe] = useState(5)

  // TSS override (simple mode only — structured uses block calculation)
  const [tssOverride, setTssOverride] = useState<number | null>(null)
  const [editingTss, setEditingTss] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const ftp = profile?.ftp || 0
  const threshPace = profile?.run_pace || ''
  const css = profile?.css || ''

  const supportsStructured = form.type === 'run' || form.type === 'ride' || form.type === 'swim'

  const simpleTss = useMemo(() => computeSimpleTSS(
    form.type, form.duration_minutes, avgPace, avgPower, swimDistance, rpe, ftp, threshPace, css,
  ), [form.type, form.duration_minutes, avgPace, avgPower, swimDistance, rpe, ftp, threshPace, css])

  const structuredTss = useMemo(() =>
    computeStructuredTSS(blocks, form.type, ftp, threshPace, css),
    [blocks, form.type, ftp, threshPace, css]
  )

  const structuredDuration = useMemo(() => computeStructuredDuration(blocks), [blocks])

  const effectiveTss = mode === 'structured'
    ? structuredTss
    : tssOverride !== null ? tssOverride : simpleTss

  const effectiveDuration = mode === 'structured' ? structuredDuration : form.duration_minutes

  const handleTypeChange = (t: WorkoutType) => {
    setForm(f => ({ ...f, type: t }))
    setTssOverride(null)
    setEditingTss(false)
    setBlocks([])
    if (t !== 'run' && t !== 'ride' && t !== 'swim') setMode('simple')
  }

  const handleModeSwitch = (newMode: 'simple' | 'structured') => {
    setMode(newMode)
    setTssOverride(null)
    setEditingTss(false)
    if (newMode === 'structured' && blocks.length === 0) {
      setBlocks([
        newBlock('warmup', form.type),
        newBlock('interval', form.type),
        newBlock('cooldown', form.type),
      ])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await onSubmit({
        ...form,
        duration_minutes: effectiveDuration,
        tss: effectiveTss,
        structure: mode === 'structured' ? blocks : null,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: COLORS.muted, fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    display: 'block', marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: COLORS.text,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  }

  const missingBenchmark = mode === 'simple'
    ? form.type === 'run' && !threshPace ? 'threshold pace (set in Profile)'
    : form.type === 'ride' && !ftp ? 'FTP (set in Profile)'
    : form.type === 'swim' && !css ? 'CSS (set in Profile)'
    : null
    : null

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
          maxWidth: 540,
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
                    onClick={() => handleTypeChange(t)}
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

          {/* Simple / Structured mode toggle — only for run/ride/swim */}
          {supportsStructured && (
            <div style={{ display: 'flex', gap: 0, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}`, padding: 3, alignSelf: 'flex-start' }}>
              {(['simple', 'structured'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeSwitch(m)}
                  style={{
                    background: mode === m ? COLORS.card : 'transparent',
                    border: mode === m ? `1px solid ${COLORS.border}` : '1px solid transparent',
                    borderRadius: 6, padding: '5px 14px',
                    color: mode === m ? COLORS.text : COLORS.muted,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.12s',
                    textTransform: 'capitalize',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

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
            {mode === 'simple' && (
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
            )}
          </div>

          {/* ── SIMPLE MODE: type-specific inputs + TSS ── */}
          {mode === 'simple' && (
            <>
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
                    type="range" min={1} max={10} value={rpe}
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

              {/* TSS (simple mode) */}
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
                      value={tssOverride ?? simpleTss}
                      onChange={e => setTssOverride(parseInt(e.target.value) || 0)}
                      min={0}
                      autoFocus
                    />
                  ) : (
                    <div style={{
                      ...inputStyle, flex: 1,
                      color: tssOverride !== null ? COLORS.text : COLORS.accent,
                      fontFamily: "'DM Mono', monospace", fontWeight: 700,
                    }}>
                      {effectiveTss}
                    </div>
                  )}
                  {editingTss ? (
                    <button
                      type="button"
                      onClick={() => { setTssOverride(null); setEditingTss(false) }}
                      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 10px', color: COLORS.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Auto
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setTssOverride(simpleTss); setEditingTss(true) }}
                      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 10px', color: COLORS.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
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

              {/* Session Focus (simple mode) */}
              <div>
                <label style={labelStyle}>Session Focus <span style={{ color: COLORS.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span></label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {SESSION_FOCUS.map(f => {
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
            </>
          )}

          {/* ── STRUCTURED MODE: block builder ── */}
          {mode === 'structured' && (
            <>
              <StructuredBuilder
                blocks={blocks}
                setBlocks={setBlocks}
                workoutType={form.type}
                ftp={ftp}
                threshPace={threshPace}
                css={css}
              />

              {/* Session Focus (structured mode) */}
              <div>
                <label style={labelStyle}>Session Focus <span style={{ color: COLORS.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span></label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {SESSION_FOCUS.map(f => {
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
            </>
          )}

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, height: 72, resize: 'vertical' } as React.CSSProperties}
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
