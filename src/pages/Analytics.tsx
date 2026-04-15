import { useState } from 'react'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { AnalyticsPage } from '../components/analytics/AnalyticsPage'
import { COLORS } from '../lib/colors'

interface AnalyticsProps {
  onOpenProfile?: () => void
}

export function Analytics({ onOpenProfile }: AnalyticsProps) {
  const [weeks, setWeeks] = useState(8)
  const { workouts, getFitnessHistory, getWeeklyLoadHistory, loading } = useWorkouts()

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
      fitnessHistory={getFitnessHistory(weeks)}
      weeklyHistory={getWeeklyLoadHistory(weeks)}
      weeks={weeks}
      onWeeksChange={setWeeks}
      onOpenProfile={onOpenProfile}
    />
  )
}
