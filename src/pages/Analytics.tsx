import { useState } from 'react'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { useProfile } from '../contexts/ProfileContext'
import { AnalyticsPage } from '../components/analytics/AnalyticsPage'
import { COLORS } from '../lib/colors'

interface AnalyticsProps {
  onOpenProfile?: () => void
}

export function Analytics({ onOpenProfile }: AnalyticsProps) {
  const [weeks, setWeeks] = useState<number | null>(12)
  const { workouts, getFitnessHistory, getWeeklyLoadHistory, loading, error, refetchWorkouts } = useWorkouts()
  const { profile } = useProfile()

  // Date.now() is impure and can't be called directly during render (it would
  // return a different value on every render, including React's double-render
  // purity check). A useState lazy initializer is guaranteed by React to run
  // exactly once per mount, so it's the correct way to capture "now" here —
  // "weeks since earliest workout" only needs to be pinned once when the page
  // is opened, not live-recomputed on every render.
  const [mountTime] = useState(() => Date.now())

  const effectiveWeeks = (() => {
    if (weeks !== null) return weeks
    const actual = workouts.filter(w => !w.planned)
    if (actual.length === 0) return 52
    const earliest = actual.slice().sort((a, b) => a.date.localeCompare(b.date))[0]
    return Math.ceil((mountTime - new Date(earliest.date + 'T00:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  })()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted }}>
        Loading…
      </div>
    )
  }

  return (
    <>
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: COLORS.orange + '15', border: `1px solid ${COLORS.orange}40`, borderRadius: 10,
          padding: '10px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, color: COLORS.orange }}>{error}</span>
          <button
            onClick={() => refetchWorkouts()}
            style={{
              background: 'none', border: `1px solid ${COLORS.orange}60`, borderRadius: 6,
              color: COLORS.orange, fontSize: 12, fontWeight: 700, padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}
      <AnalyticsPage
        workouts={workouts}
        fitnessHistory={getFitnessHistory(effectiveWeeks)}
        weeklyHistory={getWeeklyLoadHistory(effectiveWeeks)}
        weeks={weeks}
        effectiveWeeks={effectiveWeeks}
        onWeeksChange={setWeeks}
        onOpenProfile={onOpenProfile}
        profile={profile}
      />
    </>
  )
}
