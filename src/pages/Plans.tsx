import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/colors'
import { RADIUS } from '../lib/designTokens'
import type { TrainingPlan } from '../types'
import type { Tables } from '../types/database.types'
import { PlansPage } from '../components/plans/PlansPage'

type TrainingPlanRow = Tables<'training_plans'> & { training_sessions?: { count: number }[] }

const VALID_STATUSES: readonly string[] = ['active', 'complete', 'upcoming', 'archived']

// training_plans.status has a narrower DB check constraint than the app's status union, and
// the row also carries a joined `training_sessions(count)` aggregate that isn't part of the
// plain generated row shape — map it explicitly instead of a blind `as TrainingPlan[]` cast so
// an unexpected status value (schema drift) falls back to a safe default instead of silently
// flowing an unrecognised string into UI logic that switches on status.
function mapTrainingPlanRow(row: TrainingPlanRow): TrainingPlan {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    name: row.name,
    sport: row.sport,
    total_weeks: row.total_weeks,
    current_week: row.current_week ?? 0,
    status: VALID_STATUSES.includes(row.status ?? '') ? (row.status as TrainingPlan['status']) : 'upcoming',
    race_name: row.race_name,
    race_date: row.race_date,
    start_date: row.start_date,
    source: row.source,
    total_sessions: row.training_sessions?.[0]?.count ?? 0,
  }
}

export function Plans() {
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchPlans = useCallback(async () => {
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('training_plans')
        .select('*, training_sessions(count)')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      if (data) {
        setPlans(data.map(mapTrainingPlanRow))
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load training plans.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: COLORS.muted, fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ color: COLORS.danger, fontSize: 13, padding: '12px 16px', background: COLORS.danger + '15', borderRadius: RADIUS.card }}>
          {error}
        </div>
      </div>
    )
  }

  return <PlansPage plans={plans} onRefresh={fetchPlans} />
}
