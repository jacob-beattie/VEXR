import React from 'react'
import { COLORS } from '../../lib/colors'
import { workoutTypes } from '../ui/Badge'
import type { Workout, WorkoutType } from '../../types'
import { calculatePMC } from '../../lib/calculateMetrics'

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

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fitnessDate = new Date(weekEnd < today ? weekEnd : today)
  fitnessDate.setHours(0, 0, 0, 0)
  const { current: fitness } = calculatePMC(workouts, fitnessDate, fitnessDate)
  const hasFitness = fitness.ctl > 0 || fitness.atl > 0
  const tsbValueColor = fitness.tsb >= 0 ? COLORS.green : '#ef4444'

  // Fixed 3-row structure: label / value / subtitle — minHeight on subtitle reserves space even when empty
  const stat = (label: string, value: string, valueColor = COLORS.text, sub?: string) => (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 14 }}>
      <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: valueColor, fontFamily: 'DM Mono, monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.muted, whiteSpace: 'nowrap', marginTop: 1, minHeight: '1rem' }}>{sub}</div>
    </div>
  )

  const divider = <div style={{ width: 1, background: COLORS.border, alignSelf: 'stretch', flexShrink: 0 }} />

  const coreStats: React.ReactElement[] = [
    stat('Workouts', String(completed.length), COLORS.text, planned.length > 0 ? `+${planned.length} planned` : undefined),
    stat('Duration', formatDuration(totalMinutes)),
    stat('TSS', String(totalTSS), COLORS.accent, plannedTSS > 0 ? `+${plannedTSS} planned` : undefined),
  ]
  if (totalDistance > 0) coreStats.push(stat('Distance', `${(totalDistance / 1000).toFixed(1)} km`))
  if (totalElevation > 0) coreStats.push(stat('Elevation', `${totalElevation} m`))
  if (totalCalories > 0) coreStats.push(stat('Calories', totalCalories.toLocaleString()))

  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      overflowX: 'auto',
    }}>

      {/* LEFT — activity stats + sport rows; stretch fills full bar height, center aligns cells within it */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flex: 1, minWidth: 0, flexShrink: 0, alignSelf: 'stretch' }}>
        {coreStats.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && divider}
            {s}
          </React.Fragment>
        ))}

        {sportStats.length > 0 && (
          <>
            <div style={{ width: 1, background: COLORS.border, alignSelf: 'stretch', flexShrink: 0, margin: '0 4px' }} />
            {sportStats.map((s, i) => {
              const wt = workoutTypes[s.type]
              return (
                <React.Fragment key={s.type}>
                  {i > 0 && divider}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, paddingTop: 14 }}>
                    <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {wt.icon} {wt.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: wt.color, fontFamily: 'DM Mono, monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {formatDuration(s.minutes)}
                    </div>
                    <div style={{ fontSize: 10, color: COLORS.muted, whiteSpace: 'nowrap', marginTop: 1, minHeight: '1rem' }}>
                      {s.distanceM > 0 ? `${(s.distanceM / 1000).toFixed(1)} km` : undefined}
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
          </>
        )}
      </div>

      {/* VERTICAL DIVIDER between left and right */}
      {hasFitness && (
        <div style={{ width: 1, background: COLORS.border, flexShrink: 0, margin: '0 20px', alignSelf: 'stretch' }} />
      )}

      {/* RIGHT — fitness metrics */}
      {hasFitness && (
        <div style={{
          background: COLORS.card,
          borderRadius: 8,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexShrink: 0,
        }}>
          {[
            { label: 'CTL', value: String(fitness.ctl), color: COLORS.accent },
            { label: 'ATL', value: String(fitness.atl), color: COLORS.orange },
            { label: 'TSB', value: fitness.tsb > 0 ? `+${fitness.tsb}` : String(fitness.tsb), color: tsbValueColor },
          ].map((m, i) => (
            <React.Fragment key={m.label}>
              {i > 0 && <div style={{ width: 1, background: COLORS.border, alignSelf: 'stretch' }} />}
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, whiteSpace: 'nowrap' }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: m.color, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>{m.value}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
