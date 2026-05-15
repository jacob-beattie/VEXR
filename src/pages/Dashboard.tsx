import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { useProfile } from '../contexts/ProfileContext'
import { COLORS } from '../lib/colors'
import { workoutTypes } from '../components/ui/Badge'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
import { WorkoutDetailModal } from '../components/WorkoutDetailModal'
import type { Workout } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDuration(minutes: number): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}


function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

function formatUpcomingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ─── Fitness Area Chart ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: COLORS.muted, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

function FitnessAreaChart({ data }: { data: Array<{ week: string; fitness: number; fatigue: number; form: number }> }) {
  const hasData = data.some(d => d.fitness > 0 || d.fatigue > 0)
  const tickInterval = data.length > 28 ? Math.floor(data.length / 8) : data.length > 14 ? 6 : 0

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Fitness · Fatigue · Form
        </div>
        <div style={{ display: 'flex', gap: 14, marginLeft: 'auto' }}>
          {[
            { label: 'CTL', color: COLORS.purple },
            { label: 'ATL', color: COLORS.orange },
            { label: 'TSB', color: COLORS.green },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLORS.muted }}>
              <div style={{ width: 20, height: 2, borderRadius: 1, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.25} />
                <stop offset="100%" stopColor={COLORS.purple} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="atlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.2} />
                <stop offset="100%" stopColor={COLORS.orange} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval={tickInterval} />
            <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="fitness" stroke={COLORS.purple} strokeWidth={2} fill="url(#ctlFill)" dot={false} name="CTL" />
            <Area type="monotone" dataKey="fatigue" stroke={COLORS.orange} strokeWidth={2} fill="url(#atlFill)" dot={false} name="ATL" />
            <Area type="monotone" dataKey="form" stroke={COLORS.green} strokeWidth={1.5} fill="none" dot={false} name="TSB" strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, color: COLORS.muted }}>No workout data yet</div>
          <div style={{ fontSize: 11, color: COLORS.muted, opacity: 0.6 }}>Log workouts with TSS to see your fitness trend</div>
        </div>
      )}
    </div>
  )
}

// ─── Weekly Load ──────────────────────────────────────────────────────────────

function WeeklyLoadCard({ weekWorkouts }: { weekWorkouts: Workout[] }) {
  const actual = weekWorkouts.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0)
  const planned = weekWorkouts.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0)
  const target = actual + planned
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0

  const now = new Date()
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
  const monday = new Date(now); monday.setDate(now.getDate() + diff); monday.setHours(0, 0, 0, 0)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); d.setHours(0, 0, 0, 0)
    const key = localDateKey(d)
    const dw = weekWorkouts.filter(w => w.date.split('T')[0] === key)
    const done = dw.filter(w => !w.planned)
    const pending = dw.filter(w => w.planned)
    return { label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i], done, pending, isToday: localDateKey(new Date()) === key }
  })

  const sportColor = (type: string) => workoutTypes[type as keyof typeof workoutTypes]?.color ?? COLORS.muted

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
        Weekly Load
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: COLORS.muted }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: COLORS.text, fontSize: 16 }}>{actual}</span>
          {target > 0 && <span style={{ fontSize: 12 }}> / {target} TSS</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? COLORS.green : pct >= 50 ? COLORS.accent : COLORS.muted }}>
          {target > 0 ? `${pct}%` : 'No load planned'}
        </div>
      </div>
      <div style={{ height: 6, background: COLORS.subtle, borderRadius: 4, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, transition: 'width 0.4s ease',
          width: `${pct}%`,
          background: pct >= 80 ? COLORS.green : COLORS.accent,
        }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {days.map((day, i) => {
          const primary = day.done[0] ?? day.pending[0]
          const color = primary ? sportColor(primary.type) : COLORS.border
          const isDone = day.done.length > 0
          const hasPending = day.pending.length > 0 && !isDone
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: '100%', aspectRatio: '1', borderRadius: 6,
                background: isDone ? color + '28' : 'transparent',
                border: `1px ${hasPending ? 'dashed' : 'solid'} ${isDone ? color : hasPending ? color + '70' : COLORS.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}>
                {isDone && <span style={{ color }}>✓</span>}
                {hasPending && <span style={{ color: color + '90', fontSize: 9 }}>○</span>}
              </div>
              <div style={{ fontSize: 9, color: day.isToday ? COLORS.accent : COLORS.muted, fontWeight: day.isToday ? 700 : 400 }}>
                {day.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Coming Up ────────────────────────────────────────────────────────────────

function ComingUpCard({ workouts, onSelect }: { workouts: Workout[], onSelect: (w: Workout) => void }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
        Coming Up
      </div>
      {workouts.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          No planned workouts ahead
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workouts.map(w => {
            const wt = workoutTypes[w.type]
            return (
              <div
                key={w.id}
                onClick={() => onSelect(w)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px',
                  background: COLORS.surface, borderRadius: 9,
                  borderTop: `1px solid ${COLORS.border}`,
                  borderRight: `1px solid ${COLORS.border}`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  borderLeft: `3px solid ${wt.color}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = `0 4px 12px ${wt.shadowColor}, 0 1px 4px rgba(0,0,0,0.06)`
                  e.currentTarget.style.borderTopColor = wt.darkBorder
                  e.currentTarget.style.borderRightColor = wt.darkBorder
                  e.currentTarget.style.borderBottomColor = wt.darkBorder
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'
                  e.currentTarget.style.borderTopColor = COLORS.border
                  e.currentTarget.style.borderRightColor = COLORS.border
                  e.currentTarget.style.borderBottomColor = COLORS.border
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                  background: wt.bg,
                  border: `1.5px solid ${wt.darkBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15,
                }}>
                  {wt.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: wt.color, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
                    {wt.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.title}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    {formatUpcomingDay(w.date)}{w.duration_minutes > 0 ? ` · ${formatDuration(w.duration_minutes)}` : ''}
                  </div>
                </div>
                {w.tss > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: wt.color, fontFamily: "'DM Mono', monospace" }}>{w.tss}</div>
                    <div style={{ fontSize: 9, color: COLORS.muted }}>TSS</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── AI Coach Teaser ──────────────────────────────────────────────────────────

function AICoachTeaser({ onClick }: { onClick: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    supabase
      .from('ai_briefings')
      .select('briefing')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.briefing) {
          const idx = data.briefing.search(/[.!?](\s|$)/)
          const sentence = idx > 0 ? data.briefing.slice(0, idx + 1) : data.briefing
          setPreview(sentence.length > 150 ? sentence.slice(0, 150) + '…' : sentence)
        }
        setChecked(true)
      })
  }, [])

  return (
    <div style={{
      background: COLORS.card,
      borderTop: `1px solid ${COLORS.border}`,
      borderRight: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      borderLeft: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${COLORS.accent}90, transparent)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, color: COLORS.accent }}>✦</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          AI Coach
        </span>
      </div>
      {checked && !preview && (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
          Get a personalised weekly briefing based on your current fitness and training load.
        </p>
      )}
      {preview && (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: COLORS.text, lineHeight: 1.65, fontStyle: 'italic', opacity: 0.88 }}>
          "{preview}"
        </p>
      )}
      <button
        onClick={onClick}
        style={{
          background: 'none', border: 'none', padding: 0,
          color: COLORS.accent, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'gap 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.gap = '8px')}
        onMouseLeave={e => (e.currentTarget.style.gap = '5px')}
      >
        Read Full Briefing <span style={{ fontSize: 15 }}>→</span>
      </button>
    </div>
  )
}

// ─── Season Goals ─────────────────────────────────────────────────────────────

interface Goal { id: string; text: string; completed: boolean; created_at: string }

function SeasonGoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [inputText, setInputText] = useState('')
  const [loadingGoals, setLoadingGoals] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGoals(data); setLoadingGoals(false) })
  }, [])

  const addGoal = async () => {
    const text = inputText.trim()
    if (!text || saving) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data, error } = await supabase.from('goals').insert({ text, user_id: user.id }).select().single()
    if (!error && data) { setGoals(prev => [...prev, data]); setInputText('') }
    setSaving(false)
  }

  const toggleGoal = async (goal: Goal) => {
    const { error } = await supabase.from('goals').update({ completed: !goal.completed }).eq('id', goal.id)
    if (!error) setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completed: !g.completed } : g))
  }

  const deleteGoal = async (id: string) => {
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (!error) setGoals(prev => prev.filter(g => g.id !== id))
  }

  const incomplete = goals.filter(g => !g.completed)
  const completed = goals.filter(g => g.completed)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Season Goals
        </div>
        {goals.length > 0 && (
          <span style={{ fontSize: 11, color: COLORS.green, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
            {completed.length}/{goals.length}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addGoal()}
          placeholder="Add a goal…"
          style={{
            flex: 1, padding: '8px 11px', borderRadius: 8,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg, color: COLORS.text,
            fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = COLORS.accent + '70')}
          onBlur={e => (e.currentTarget.style.borderColor = COLORS.border)}
        />
        <button
          onClick={addGoal}
          disabled={saving || !inputText.trim()}
          style={{
            padding: '8px 13px', borderRadius: 8,
            border: `1px solid ${COLORS.accent}`,
            background: COLORS.accent + '15', color: COLORS.accent,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            opacity: saving || !inputText.trim() ? 0.45 : 1, transition: 'opacity 0.15s',
          }}
        >+</button>
      </div>

      {loadingGoals ? (
        <div style={{ color: COLORS.muted, fontSize: 12, padding: '4px 0' }}>Loading…</div>
      ) : goals.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>No goals yet — set your first!</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[...incomplete, ...completed].map(goal => (
            <div key={goal.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 9,
              padding: '8px 10px', borderRadius: 8,
              background: COLORS.bg,
              border: `1px solid ${goal.completed ? COLORS.green + '25' : COLORS.border}`,
              opacity: goal.completed ? 0.6 : 1, transition: 'opacity 0.2s',
            }}>
              <button
                onClick={() => toggleGoal(goal)}
                style={{
                  flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: 4,
                  border: `1px solid ${goal.completed ? COLORS.green : COLORS.muted}`,
                  background: goal.completed ? COLORS.green + '20' : 'transparent',
                  cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: COLORS.green, fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >{goal.completed ? '✓' : ''}</button>
              <span style={{
                flex: 1, fontSize: 12,
                color: goal.completed ? COLORS.muted : COLORS.text,
                textDecoration: goal.completed ? 'line-through' : 'none',
                lineHeight: 1.4,
              }}>{goal.text}</span>
              <button
                onClick={() => deleteGoal(goal.id)}
                style={{
                  flexShrink: 0, background: 'none', border: 'none',
                  color: COLORS.muted, fontSize: 15, cursor: 'pointer',
                  padding: '0 2px', lineHeight: 1, opacity: 0.5,
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Nutrition Summary ────────────────────────────────────────────────────────

const DEFAULT_TARGETS = { calorie_target: 2800, protein_target: 175, carbs_target: 320, fat_target: 85 }

function NutritionSummaryCard({ onNavigate }: { onNavigate: () => void }) {
  const [totals, setTotals] = useState({ cal: 0, protein: 0, carbs: 0, fat: 0 })
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [hasData, setHasData] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const today = localDateKey(new Date())
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoaded(true); return }
      const [logsRes, targetsRes] = await Promise.all([
        supabase.from('nutrition_logs').select('calories,protein,carbs,fat').eq('user_id', user.id).eq('date', today),
        supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
      ])
      const rows = logsRes.data ?? []
      if (rows.length > 0) {
        setTotals(rows.reduce((s, r) => ({ cal: s.cal + r.calories, protein: s.protein + r.protein, carbs: s.carbs + r.carbs, fat: s.fat + r.fat }), { cal: 0, protein: 0, carbs: 0, fat: 0 }))
        setHasData(true)
      }
      if (targetsRes.data) setTargets(targetsRes.data)
      setLoaded(true)
    }
    fetch()
  }, [])

  const r = 52
  const circ = 2 * Math.PI * r
  const calPct = hasData ? Math.min(totals.cal / targets.calorie_target, 1) : 0
  const dash = circ * calPct
  const over = totals.cal > targets.calorie_target
  const ringColor = over ? COLORS.orange : calPct >= 0.85 ? COLORS.green : COLORS.accent
  const proteinPct = totals.cal > 0 ? Math.round(totals.protein * 4 / totals.cal * 100) : 0
  const carbsPct   = totals.cal > 0 ? Math.round(totals.carbs   * 4 / totals.cal * 100) : 0
  const fatPct     = totals.cal > 0 ? Math.round(totals.fat     * 9 / totals.cal * 100) : 0

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginTop: 14, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.orange}, ${COLORS.purple})` }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Nutrition Today</div>
        <button
          onClick={onNavigate}
          style={{ background: 'none', border: 'none', color: COLORS.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4, transition: 'gap 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.gap = '7px')}
          onMouseLeave={e => (e.currentTarget.style.gap = '4px')}
        >View <span style={{ fontSize: 13 }}>→</span></button>
      </div>

      {!loaded ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 12 }}>Loading…</div>
      ) : !hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0 4px' }}>
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r={r} fill="none" stroke={COLORS.subtle} strokeWidth={9} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>No data</span>
            </div>
          </div>
          <button
            onClick={onNavigate}
            style={{ background: COLORS.accent + '15', border: `1px solid ${COLORS.accent}55`, borderRadius: 8, padding: '8px 16px', color: COLORS.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = COLORS.accent + '25')}
            onMouseLeave={e => (e.currentTarget.style.background = COLORS.accent + '15')}
          >+ Log Nutrition</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Calorie ring */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 120, height: 120 }}>
                <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r={r} fill="none" stroke={COLORS.subtle} strokeWidth={9} />
                  <circle cx="60" cy="60" r={r} fill="none" stroke={ringColor} strokeWidth={9}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.55s ease, stroke 0.3s' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                    {totals.cal.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: '0.04em' }}>kcal eaten</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ringColor, marginTop: 1 }}>
                    {over ? `+${(totals.cal - targets.calorie_target).toLocaleString()} over` : `${(targets.calorie_target - totals.cal).toLocaleString()} left`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 5, fontSize: 10, color: COLORS.muted }}>
                <span><span style={{ color: COLORS.text, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{targets.calorie_target.toLocaleString()}</span> target</span>
                <span style={{ fontWeight: 700 }}>{Math.round(calPct * 100)}%</span>
              </div>
            </div>

            {/* Macro bars */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 4 }}>
              {[
                { label: 'Protein', consumed: totals.protein, target: targets.protein_target, color: COLORS.green },
                { label: 'Carbs',   consumed: totals.carbs,   target: targets.carbs_target,   color: COLORS.orange },
                { label: 'Fat',     consumed: totals.fat,     target: targets.fat_target,     color: COLORS.purple },
              ].map(({ label, consumed, target, color }) => {
                const barPct = Math.min(consumed / target, 1)
                const isOver = consumed > target
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                        <span style={{ color: isOver ? COLORS.orange : COLORS.text, fontWeight: 700 }}>{consumed}g</span>
                        <span style={{ color: COLORS.muted }}> / {target}g</span>
                      </span>
                    </div>
                    <div style={{ height: 4, background: COLORS.subtle, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${barPct * 100}%`, background: isOver ? COLORS.orange : color, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Macro split */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 7 }}>Macro Split</div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
              <div style={{ width: `${proteinPct}%`, background: COLORS.green,  transition: 'width 0.5s ease' }} />
              <div style={{ width: `${carbsPct}%`,   background: COLORS.orange, transition: 'width 0.5s ease' }} />
              <div style={{ width: `${fatPct}%`,     background: COLORS.purple, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {[
                { l: 'Protein', p: proteinPct, c: COLORS.green  },
                { l: 'Carbs',   p: carbsPct,   c: COLORS.orange },
                { l: 'Fat',     p: fatPct,     c: COLORS.purple },
              ].map(({ l, p, c }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: COLORS.muted }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: c, flexShrink: 0 }} />
                  {l} <span style={{ color: COLORS.text, fontWeight: 700 }}>{p}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, unit, sub, color, dimSub }: {
  label: string
  value: string | number
  unit?: string
  sub: string
  color: string
  dimSub?: boolean
}) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.85 }} />
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 12, color: dimSub ? COLORS.muted : color, fontWeight: 600 }}>
        {sub}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    loading,
    getWorkoutsForWeek,
    calculateFitnessMetrics,
    getUpcomingWorkouts,
    getFitnessHistory,
    deleteWorkout,
    updateWorkout,
  } = useWorkouts()
  const { profile } = useProfile()
  const [showWelcome, setShowWelcome] = useState(() => sessionStorage.getItem('onboardingWelcome') === 'true')
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  useEffect(() => {
    if (showWelcome) sessionStorage.removeItem('onboardingWelcome')
  }, [showWelcome])

  const weekWorkouts = getWorkoutsForWeek()
  const { ctl, atl, tsb } = calculateFitnessMetrics()
  const fitnessHistory = getFitnessHistory(8)

  // CTL delta vs 7 days ago
  const weekHistory = getFitnessHistory(1)
  const ctlDelta = weekHistory.length >= 2
    ? Math.round(weekHistory[weekHistory.length - 1].fitness - weekHistory[0].fitness)
    : 0

  // Upcoming: next 4 planned workouts from today onward
  const comingUp = getUpcomingWorkouts(14).slice(0, 4)

  // Dynamic subtitle
  const subtitle = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  // Stat card helpers
  const tsbColor = COLORS.green
  const ctlSub = ctlDelta !== 0 ? `${ctlDelta > 0 ? '↑' : '↓'} ${Math.abs(ctlDelta)} this week` : 'Stable this week'
  const atlSub = atl > 70 ? 'Heavy training load' : atl > 45 ? 'Moderate load' : atl > 20 ? 'Light load' : 'Very fresh'
  const tsbSub = tsb > 10 ? '🟢 Fresh — ready to race' : tsb < -20 ? '⚠️ High fatigue' : tsb < -10 ? 'Some fatigue' : 'Balanced form'

  // Race card
  const raceDays = profile?.race_date ? daysUntil(profile.race_date) : null
  const hasRace = raceDays !== null && raceDays > 0

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted }}>
        Loading…
      </div>
    )
  }

  const firstName = profile?.name?.split(' ')[0] || ''

  return (
    <>
      {showWelcome && (
        <div style={{
          background: COLORS.card,
          borderTop: `1px solid ${COLORS.border}`,
          borderRight: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${COLORS.accent}`,
          borderRadius: 12,
          padding: '13px 18px',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: COLORS.text }}>
            <span style={{ color: COLORS.accent, fontWeight: 700 }}>Welcome to Vexr!</span>{' '}
            Log your first workout to get started.
          </span>
          <button
            onClick={() => setShowWelcome(false)}
            style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 16, cursor: 'pointer', padding: '0 4px', flexShrink: 0, fontFamily: 'inherit' }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Greeting row ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isMobile && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('vexr:openMenu'))}
              style={{ background: 'none', border: 'none', color: COLORS.text, fontSize: 20, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
            >
              ☰
            </button>
          )}
          <div>
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: COLORS.text, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {getGreeting()}{firstName ? `, ${firstName}` : ''}
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 5, fontWeight: 500 }}>
              {subtitle}
            </div>
          </div>
        </div>

        {tsb < -20 && !isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px',
            borderRadius: 8,
            background: COLORS.orange + '12',
            borderTop: `1px solid ${COLORS.orange}30`,
            borderRight: `1px solid ${COLORS.orange}30`,
            borderBottom: `1px solid ${COLORS.orange}30`,
            borderLeft: `3px solid ${COLORS.orange}`,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: 12, color: COLORS.orange, fontWeight: 600 }}>High Fatigue — consider an easy day</span>
          </div>
        )}
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 10 : 14,
        marginBottom: 20,
      }}>
        <StatCard
          label="Fitness (CTL)"
          value={ctl}
          sub={ctl < 10 ? 'Log workouts to build' : ctlSub}
          color={COLORS.purple}
          dimSub={ctl < 10}
        />
        <StatCard
          label="Fatigue (ATL)"
          value={atl}
          sub={atl < 10 ? 'No recent load' : atlSub}
          color={COLORS.orange}
          dimSub={atl < 10}
        />
        <StatCard
          label="Form (TSB)"
          value={tsb > 0 ? `+${tsb}` : tsb}
          sub={tsbSub}
          color={tsbColor}
        />
        {hasRace ? (
          <StatCard
            label="Race Goal"
            value={raceDays!}
            unit="days"
            sub={profile!.race_goal!}
            color={COLORS.purple}
          />
        ) : (
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.muted, opacity: 0.3 }} />
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Race Goal</div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 20 }}>Set in profile settings</div>
          </div>
        )}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '60% 1fr',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* Left: chart + weekly load */}
        <div>
          <FitnessAreaChart data={fitnessHistory} />
          <WeeklyLoadCard weekWorkouts={weekWorkouts} />
        </div>

        {/* Right: coming up + AI coach + goals */}
        <div>
          <ComingUpCard workouts={comingUp} onSelect={setDetailWorkout} />
          <AICoachTeaser onClick={() => navigate('/ai-coach')} />
          <NutritionSummaryCard onNavigate={() => navigate('/nutrition')} />
          <SeasonGoalsPanel />
        </div>
      </div>

      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          onClose={() => setDetailWorkout(null)}
          onDelete={async (id) => { await deleteWorkout(id); setDetailWorkout(null) }}
          onUpdate={async (id, updates) => { await updateWorkout(id, updates); setDetailWorkout(null) }}
        />
      )}
    </>
  )
}
