import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import type { Workout, WorkoutType } from '../../types'
import { calculatePMC } from '../../lib/calculateMetrics'
import { useIsMobile } from '../../hooks/useIsMobile'

interface WeeklySummaryProps {
  workouts: Workout[]
  weekStart: Date
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

export function WeeklySummary({ workouts, weekStart }: WeeklySummaryProps) {
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

  if (completed.length === 0 && planned.length === 0) return null

  const totalMinutes = completed.reduce((s, w) => s + (w.duration_minutes || 0), 0)
  const totalTSS = completed.reduce((s, w) => s + (w.tss || 0), 0)
  const plannedTSS = planned.reduce((s, w) => s + (w.tss || 0), 0)
  const totalDistance = completed.reduce((s, w) => s + (w.distance_meters || 0), 0)
  const totalElevation = completed.reduce((s, w) => s + (w.elevation_gain || 0), 0)

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

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fitnessDate = new Date(weekEnd < today ? weekEnd : today)
  fitnessDate.setHours(0, 0, 0, 0)
  const { current: fitness } = calculatePMC(workouts, fitnessDate, fitnessDate)
  const hasFitness = fitness.ctl > 0 || fitness.atl > 0
  const fitnessMetrics = [
    { label: 'CTL', value: String(fitness.ctl) },
    { label: 'ATL', value: String(fitness.atl) },
    { label: 'TSB', value: fitness.tsb > 0 ? `+${fitness.tsb}` : String(fitness.tsb) },
  ]

  const sportPills = sportStats.length > 0 && (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {sportStats.map(s => {
        const wt = workoutTypes[s.type]
        return (
          <div key={s.type} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: COLORS.subtle,
            borderTop: `1px solid ${COLORS.border}`,
            borderRight: `1px solid ${COLORS.border}`,
            borderBottom: `1px solid ${COLORS.border}`,
            borderLeft: `1px solid ${COLORS.border}`,
            borderRadius: 20,
            padding: '4px 10px',
          }}>
            <span style={{ fontSize: 13 }}>{wt.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: wt.color }}>{wt.label}</span>
            <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: COLORS.muted }}>{formatDuration(s.minutes)}</span>
            {s.distanceM > 0 && (
              <span style={{ fontSize: 11, color: COLORS.muted }}>· {(s.distanceM / 1000).toFixed(1)} km</span>
            )}
          </div>
        )
      })}
    </div>
  )

  if (isMobile) {
    return (
      <div style={{
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        borderRight: `1px solid ${COLORS.border}`,
        borderBottom: `1px solid ${COLORS.border}`,
        borderLeft: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          This Week
        </div>

        {/* 3 key stats only — no distance/elevation on mobile */}
        <div style={{ display: 'flex', gap: 0, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {completed.length}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
              Workouts{planned.length > 0 ? <span style={{ color: COLORS.accent }}> +{planned.length}</span> : null}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {formatDuration(totalMinutes)}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Duration</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.accent, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {totalTSS}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
              TSS{plannedTSS > 0 ? <span style={{ color: COLORS.muted }}> +{plannedTSS}p</span> : null}
            </div>
          </div>
        </div>

        {sportPills}

        {/* Fitness as a compact inline footer — not a second wall of numbers */}
        {hasFitness && (
          <>
            <div style={{ height: 1, background: COLORS.border }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                Fitness
              </span>
              {fitnessMetrics.map(m => (
                <span key={m.label} style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: COLORS.muted }}>
                  <span style={{ fontWeight: 700, color: COLORS.text }}>{m.value}</span>
                  {' '}
                  <span style={{ fontSize: 11 }}>{m.label}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>

      {/* Left: This Week activity summary */}
      <div style={{
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
        borderRight: `1px solid ${COLORS.border}`,
        borderBottom: `1px solid ${COLORS.border}`,
        borderLeft: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: '16px 20px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 0,
      }}>
        <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          This Week
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {completed.length}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>
              Workouts{planned.length > 0 ? <span style={{ color: COLORS.accent }}> +{planned.length}</span> : null}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {formatDuration(totalMinutes)}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>Duration</div>
          </div>

          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.accent, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {totalTSS}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>
              TSS{plannedTSS > 0 ? <span style={{ color: COLORS.muted }}> +{plannedTSS}p</span> : null}
            </div>
          </div>

          {totalDistance > 0 && (
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
                {(totalDistance / 1000).toFixed(1)}
                <span style={{ fontSize: 13, fontWeight: 600 }}> km</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>Distance</div>
            </div>
          )}

          {totalElevation > 0 && (
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
                {totalElevation}
                <span style={{ fontSize: 13, fontWeight: 600 }}> m</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>Elevation</div>
            </div>
          )}
        </div>

        {sportPills}
      </div>

      {/* Right: Fitness card */}
      {hasFitness && (
        <div style={{
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`,
          borderRight: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
          borderLeft: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 14,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Fitness
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            {fitnessMetrics.map(m => (
              <div key={m.label}>
                <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
                  {m.value}
                </div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 5 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
