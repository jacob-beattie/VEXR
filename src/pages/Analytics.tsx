import { useWorkouts } from '../contexts/WorkoutsContext'
import { AnalyticsPage } from '../components/analytics/AnalyticsPage'

export function Analytics() {
  const { workouts, getFitnessHistory, getWeeklyLoadHistory, loading } = useWorkouts()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#5a6478' }}>
        Loading...
      </div>
    )
  }

  return (
    <AnalyticsPage
      workouts={workouts}
      fitnessHistory={getFitnessHistory(8)}
      weeklyHistory={getWeeklyLoadHistory(8)}
    />
  )
}
