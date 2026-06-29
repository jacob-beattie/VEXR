import React from 'react'
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

  const tsbColor = fitness.tsb > 0 ? COLORS.green : fitness.tsb > -10 ? COLORS.orange : COLORS.danger
  const tsbDisplay = fitness.tsb > 0 ? `+${fitness.tsb}` : String(fitness.tsb)

  const sportPills = sportStats.length > 0 && (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            padding: '3px 10px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: wt.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>{wt.label}</span>
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

        {hasFitness && (
          <>
            <div style={{ height: 1, background: COLORS.border }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                Fitness
              </span>
              {[
                { label: 'CTL', value: String(fitness.ctl), color: COLORS.text },
                { label: 'ATL', value: String(fitness.atl), color: COLORS.text },
                { label: 'TSB', value: tsbDisplay, color: tsbColor },
              ].map(m => (
                <span key={m.label} style={{ fontSize: 13, fontFamily: 'DM Mono, monospace', color: COLORS.muted }}>
                  <span style={{ fontWeight: 700, color: m.color }}>{m.value}</span>
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

  const statCell = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'DM Mono, monospace', lineHeight: 1, color: COLORS.text }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4, minHeight: '1rem' }}>{sub}</div>}
    </div>
  )

  const divider = <div style={{ width: 1, background: COLORS.border, alignSelf: 'stretch', margin: '0 20px' }} />

  return (
    <div style={{
      background: COLORS.surface,
      borderTop: `1px solid ${COLORS.border}`,
      borderRight: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      borderLeft: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 0,
    }}>
      {/* Left: activity stats */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {/* Top row: THIS WEEK + sport pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
            This Week
          </span>
          {sportPills}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {statCell(
            'Workouts',
            <>
              {completed.length}
              {planned.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent }}> +{planned.length}</span>}
            </>
          )}
          {divider}
          {statCell('Duration', formatDuration(totalMinutes))}
          {divider}
          {statCell(
            'TSS',
            <span style={{ color: COLORS.accent }}>
              {totalTSS}
              {plannedTSS > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.muted }}> +{plannedTSS}p</span>}
            </span>
          )}
          {totalDistance > 0 && (
            <>
              {divider}
              {statCell('Distance', <>{(totalDistance / 1000).toFixed(1)}<span style={{ fontSize: 13, fontWeight: 600 }}> km</span></>)}
            </>
          )}
          {totalElevation > 0 && (
            <>
              {divider}
              {statCell('Elevation', <>{totalElevation}<span style={{ fontSize: 13, fontWeight: 600 }}> m</span></>)}
            </>
          )}
        </div>
      </div>

      {/* Vertical divider before fitness */}
      {hasFitness && (
        <div style={{ width: 1, background: COLORS.border, alignSelf: 'stretch', margin: '0 24px' }} />
      )}

      {/* Right: Fitness */}
      {hasFitness && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Fitness
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>CTL</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{fitness.ctl}</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Fitness</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>ATL</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.text, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{fitness.atl}</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Fatigue</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>TSB</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: tsbColor, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{tsbDisplay}</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Form</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
