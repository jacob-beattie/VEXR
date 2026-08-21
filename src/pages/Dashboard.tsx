import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { useProfile } from '../contexts/ProfileContext'
import { COLORS } from '../lib/colors'
import { useIsMobile } from '../hooks/useIsMobile'
import { WorkoutDetailModal } from '../components/WorkoutDetailModal'
import { DayWorkoutsModal } from '../components/DayWorkoutsModal'
import { FitnessAreaChart } from '../components/dashboard/FitnessAreaChart'
import { WeeklyLoadCard } from '../components/dashboard/WeeklyLoadCard'
import { ComingUpCard } from '../components/dashboard/ComingUpCard'
import { AICoachTeaser } from '../components/dashboard/AICoachTeaser'
import { NutritionSummaryCard } from '../components/dashboard/NutritionSummaryCard'
import { SeasonGoalsPanel } from '../components/dashboard/SeasonGoalsPanel'
import { StatCard } from '../components/dashboard/StatCard'
import { getGreeting, daysUntil } from '../components/dashboard/utils'
import type { Workout } from '../types'

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    loading,
    error,
    refetchWorkouts,
    getWorkoutsForWeek,
    calculateFitnessMetrics,
    getUpcomingWorkouts,
    getFitnessHistory,
    deleteWorkout,
    updateWorkout,
  } = useWorkouts()
  const { profile, loading: profileLoading } = useProfile()
  const [showWelcome, setShowWelcome] = useState(() => sessionStorage.getItem('onboardingWelcome') === 'true')
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null)
  const [dayModal, setDayModal] = useState<{ date: Date; workouts: Workout[] } | null>(null)
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
  const ctlSub = ctlDelta !== 0 ? `${ctlDelta > 0 ? '↑' : '↓'} ${Math.abs(ctlDelta)} this week` : 'Stable this week'
  const atlSub = atl > 70 ? 'Heavy training load' : atl > 45 ? 'Moderate load' : atl > 20 ? 'Light load' : 'Very fresh'
  const tsbSub = tsb > 10 ? '🟢 Fresh — ready to race' : tsb < -20 ? '⚠️ High fatigue' : tsb < -10 ? 'Some fatigue' : 'Balanced form'

  // Race card
  const raceDays = profile?.race_date ? daysUntil(profile.race_date) : null
  const hasRace = raceDays !== null && raceDays > 0

  if (loading || profileLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted }}>
        Loading…
      </div>
    )
  }

  const firstName = profile?.name?.split(' ')[0] || ''

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
          color={COLORS.accent}
          dimSub={ctl < 10}
        />
        <StatCard
          label="Fatigue (ATL)"
          value={atl}
          sub={atl < 10 ? 'No recent load' : atlSub}
          color={COLORS.accent}
          dimSub={atl < 10}
        />
        <StatCard
          label="Form (TSB)"
          value={tsb > 0 ? `+${tsb}` : tsb}
          sub={tsbSub}
          color={COLORS.accent}
        />
        {hasRace ? (
          <StatCard
            label="Race Goal"
            value={raceDays!}
            unit="days"
            sub={profile!.race_goal!}
            color={COLORS.accent}
          />
        ) : (
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.muted, opacity: 0.3 }} />
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Race Goal</div>
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
          <WeeklyLoadCard weekWorkouts={weekWorkouts} onDayClick={(date, workouts) => setDayModal({ date, workouts })} />
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
      {dayModal && !detailWorkout && (
        <DayWorkoutsModal
          date={dayModal.date}
          workouts={dayModal.workouts}
          onSelectWorkout={(w) => { setDayModal(null); setDetailWorkout(w) }}
          onAddWorkout={() => setDayModal(null)}
          onClose={() => setDayModal(null)}
        />
      )}
    </>
  )
}
