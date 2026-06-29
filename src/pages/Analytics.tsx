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
  const { workouts, getFitnessHistory, getWeeklyLoadHistory, loading } = useWorkouts()
  const { profile } = useProfile()

  const effectiveWeeks = (() => {
    if (weeks !== null) return weeks
    const actual = workouts.filter(w => !w.planned)
    if (actual.length === 0) return 52
    const earliest = actual.slice().sort((a, b) => a.date.localeCompare(b.date))[0]
    return Math.ceil((Date.now() - new Date(earliest.date + 'T00:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
  })()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted }}>
        Loading…
      </div>
    )
  }

  return (
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
  )
}
