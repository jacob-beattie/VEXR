import { useWorkouts } from '../contexts/WorkoutsContext'
import { StatCard } from '../components/dashboard/StatCard'
import { WeeklyLoadChart } from '../components/dashboard/WeeklyLoadChart'
import { FitnessChart } from '../components/dashboard/FitnessChart'
import { UpcomingWorkouts } from '../components/dashboard/UpcomingWorkouts'

export function Dashboard() {
  const {
    loading,
    calculateFitnessMetrics,
    getWeeklyTSS,
    getDailyWeekLoad,
    getFitnessHistory,
    getUpcomingWorkouts,
  } = useWorkouts()

  const { ctl, atl, tsb } = calculateFitnessMetrics()
  const weeklyTss = getWeeklyTSS()
  const dailyLoad = getDailyWeekLoad()
  const fitnessHistory = getFitnessHistory(8)
  const upcoming = getUpcomingWorkouts(14)

  const now = new Date()
  const month = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#5a6478' }}>
        Loading...
      </div>
    )
  }

  return (
    <>
      <div style={{ fontSize: 13, color: '#5a6478', marginBottom: 20 }}>{month}</div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Fitness (CTL)" value={ctl} delta={ctl > 0 ? `${ctl}` : undefined} positive={true} />
        <StatCard label="Fatigue (ATL)" value={atl} delta={atl > 0 ? `${atl}` : undefined} positive={false} />
        <StatCard label="Form (TSB)" value={tsb} delta={tsb >= 0 ? `+${tsb}` : `${tsb}`} positive={tsb >= 0} />
        <StatCard label="Weekly TSS" value={weeklyTss} unit="pts" positive={true} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <WeeklyLoadChart data={dailyLoad} />
        <FitnessChart data={fitnessHistory.length > 0 ? fitnessHistory : []} />
      </div>

      {/* Upcoming workouts */}
      <UpcomingWorkouts workouts={upcoming} />
    </>
  )
}
