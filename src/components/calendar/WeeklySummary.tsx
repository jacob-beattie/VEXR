import type { CSSProperties } from 'react'
import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { Workout, WorkoutType } from '../../types'

interface WeeklySummaryProps {
  workouts: Workout[]
  weekStart: Date
  horizontal?: boolean   // true = full-width strip below the week grid
}

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDuration(minutes: number): string {
  if (!minutes) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function computeFitnessAtDate(allWorkouts: Workout[], targetDate: Date) {
  const ctlK = 1 - Math.exp(-1 / 42)
  const atlK = 1 - Math.exp(-1 / 7)
  const tssByDay: Record<string, number> = {}
  allWorkouts.filter(w => !w.planned).forEach(w => {
    const key = w.date.split('T')[0]
    tssByDay[key] = (tssByDay[key] || 0) + (w.tss || 0)
  })
  const allDates = Object.keys(tssByDay).sort()
  if (!allDates.length) return { ctl: 0, atl: 0, tsb: 0 }
  const startDate = new Date(allDates[0] + 'T00:00:00')
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  const totalDays = Math.floor((target.getTime() - startDate.getTime()) / 86400000)
  let ctl = 0, atl = 0
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    const tss = tssByDay[localDateKey(d)] || 0
    ctl = ctl + ctlK * (tss - ctl)
    atl = atl + atlK * (tss - atl)
  }
  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) }
}

export function WeeklySummary({ workouts, weekStart, horizontal = false }: WeeklySummaryProps) {
  const isMobile = useIsMobile()
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const weekKeys = new Set(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return localDateKey(d)
    })
  )

  const weekWorkouts = workouts.filter(w => weekKeys.has(w.date.split('T')[0]))
  const completed = weekWorkouts.filter(w => !w.planned)
  const planned = weekWorkouts.filter(w => w.planned)

  const totalMinutes = completed.reduce((s, w) => s + (w.duration_minutes || 0), 0)
  const totalTSS = completed.reduce((s, w) => s + (w.tss || 0), 0)
  const plannedTSS = planned.reduce((s, w) => s + (w.tss || 0), 0)
  const totalDistance = completed.reduce((s, w) => s + (w.distance_meters || 0), 0)
  const totalElevation = completed.reduce((s, w) => s + (w.elevation_gain || 0), 0)
  const totalCalories = completed.reduce((s, w) => s + (w.calories || 0), 0)

  const sports: WorkoutType[] = ['run', 'ride', 'swim', 'strength']
  const sportStats = sports.map(type => {
    const sw = completed.filter(w => w.type === type)
    return {
      type,
      minutes: sw.reduce((s, w) => s + (w.duration_minutes || 0), 0),
      distanceM: sw.reduce((s, w) => s + (w.distance_meters || 0), 0),
      count: sw.length,
    }
  }).filter(s => s.count > 0)

  const maxMinutes = Math.max(...sportStats.map(s => s.minutes), 1)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fitnessDate = weekEnd < today ? weekEnd : today
  const fitness = computeFitnessAtDate(workouts, fitnessDate)
  const hasFitness = fitness.ctl > 0 || fitness.atl > 0
  const tsbColor = fitness.tsb > 5 ? COLORS.green : fitness.tsb < -20 ? COLORS.orange : COLORS.accent

  const sectionLabel: CSSProperties = {
    fontSize: 10, fontWeight: 700, color: COLORS.muted,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    marginBottom: 8, marginTop: 16, display: 'block',
  }

  const statRow = (label: string, value: string, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: COLORS.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? COLORS.text, fontFamily: 'DM Mono, monospace' }}>{value}</span>
    </div>
  )

  // ── HORIZONTAL (week summary strip) ──────────────────────────────────────────
  if (horizontal) {
    if (completed.length === 0 && planned.length === 0) return null

    const tsbPositive = fitness.tsb >= 0

    // Shared small card style
    const smallCard = (label: string, value: string, valueColor: string, sub?: string) => (
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 72, flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: valueColor, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 9, color: COLORS.muted, fontFamily: 'DM Mono, monospace', marginTop: 3 }}>{sub}</div>}
      </div>
    )

    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Row 1 — Activity stats */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          overflowX: isMobile ? 'auto' : 'visible',
          paddingBottom: isMobile ? 4 : 0,
        }}>
          {smallCard('Workouts', String(completed.length), COLORS.text)}
          {smallCard('Duration', formatDuration(totalMinutes), COLORS.text)}
          {smallCard('TSS', String(totalTSS), COLORS.accent, plannedTSS > 0 ? `/ ${plannedTSS} planned` : undefined)}
          {totalDistance > 0 && smallCard('Distance', `${(totalDistance / 1000).toFixed(1)}km`, COLORS.text)}
          {totalElevation > 0 && smallCard('Elevation', `${totalElevation}m`, COLORS.text)}
          {totalCalories > 0 && smallCard('Calories', totalCalories.toLocaleString(), COLORS.text)}

          {/* Sport breakdown — same card style, sport colour on label only */}
          {sportStats.length > 0 && (
            <div style={{ width: 1, background: COLORS.border, alignSelf: 'stretch', margin: '0 2px' }} />
          )}
          {sportStats.map(s => {
            const wt = workoutTypes[s.type]
            return smallCard(
              `${wt.icon} ${wt.label}`,
              formatDuration(s.minutes),
              wt.color,
              s.distanceM > 0 ? `${(s.distanceM / 1000).toFixed(1)}km` : undefined
            )
          })}
        </div>

        {/* Row 2 — Fitness metrics */}
        {hasFitness && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'stretch',
            overflowX: isMobile ? 'auto' : 'visible',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            paddingBottom: isMobile ? 4 : 0,
          }}>
            {[
              { label: 'CTL', value: fitness.ctl, color: COLORS.accent, desc: 'Fitness' },
              { label: 'ATL', value: fitness.atl, color: COLORS.orange, desc: 'Fatigue' },
              { label: 'TSB', value: fitness.tsb > 0 ? `+${fitness.tsb}` : String(fitness.tsb), color: tsbPositive ? COLORS.green : '#ef4444', desc: 'Form' },
            ].map(m => (
              <div key={m.label} style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                borderTop: `2px solid ${m.color}`,
                borderRadius: 8, padding: '10px 20px', textAlign: 'center', minWidth: 90, flexShrink: 0,
              }}>
                <div style={{ fontSize: 9, color: m.color, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: m.color, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{m.value}</div>
                <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 4, letterSpacing: '0.06em' }}>{m.desc}</div>
              </div>
            ))}
            <div style={{ fontSize: 10, color: COLORS.muted, fontStyle: 'italic', alignSelf: 'flex-end', paddingBottom: 4, paddingLeft: 4 }}>
              as of {weekEnd < today ? 'end of week' : 'today'}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── VERTICAL (month view sidebar) ────────────────────────────────────────────
  if (completed.length === 0 && planned.length === 0) {
    return (
      <div style={{ width: 260, flexShrink: 0, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Week Summary
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted, textAlign: 'center', padding: '40px 0' }}>
          No workouts this week
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: 260, flexShrink: 0, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 18px', overflowY: 'auto', maxHeight: '80vh' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        Week Summary
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
        <div style={{ background: COLORS.surface, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 9, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>Duration</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text, fontFamily: 'DM Mono, monospace' }}>{formatDuration(totalMinutes)}</div>
        </div>
        <div style={{ background: COLORS.surface, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 9, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>TSS</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.accent, fontFamily: 'DM Mono, monospace' }}>{totalTSS}</div>
        </div>
      </div>

      {plannedTSS > 0 && (
        <div style={{ marginBottom: 4 }}>
          {statRow('Planned TSS', String(plannedTSS), COLORS.muted)}
          <div style={{ background: COLORS.subtle, borderRadius: 4, height: 5, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: `${Math.min(100, totalTSS / plannedTSS * 100)}%`, height: '100%', background: COLORS.accent, borderRadius: 4, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {statRow('Workouts', String(completed.length))}
      {totalDistance > 0 && statRow('Distance', `${(totalDistance / 1000).toFixed(1)} km`)}
      {totalElevation > 0 && statRow('Elevation', `${totalElevation} m`, COLORS.purple)}
      {totalCalories > 0 && statRow('Calories', `${totalCalories.toLocaleString()} kcal`)}

      {sportStats.length > 0 && (
        <>
          <span style={sectionLabel}>By Sport</span>
          {sportStats.map(s => {
            const wt = workoutTypes[s.type]
            const pct = Math.round((s.minutes / maxMinutes) * 100)
            return (
              <div key={s.type} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: wt.color, fontWeight: 600 }}>{wt.icon} {wt.label}</span>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: COLORS.muted }}>
                    <span style={{ fontFamily: 'DM Mono, monospace' }}>{formatDuration(s.minutes)}</span>
                    {s.distanceM > 0 && <span style={{ fontFamily: 'DM Mono, monospace', color: COLORS.text }}>{(s.distanceM / 1000).toFixed(1)}km</span>}
                  </div>
                </div>
                <div style={{ background: COLORS.subtle, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: wt.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )
          })}
        </>
      )}

      {hasFitness && (
        <>
          <span style={sectionLabel}>Fitness</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { label: 'CTL', value: fitness.ctl, color: COLORS.accent },
              { label: 'ATL', value: fitness.atl, color: COLORS.orange },
              { label: 'TSB', value: fitness.tsb, color: tsbColor },
            ].map(m => (
              <div key={m.label} style={{ background: COLORS.surface, borderRadius: 6, padding: '8px 6px', border: `1px solid ${COLORS.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: m.color, fontFamily: 'DM Mono, monospace' }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 6, textAlign: 'center', fontStyle: 'italic' }}>
            Values as of {weekEnd < today ? 'end of week' : 'today'}
          </div>
        </>
      )}
    </div>
  )
}
