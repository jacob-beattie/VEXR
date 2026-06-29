import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/colors'
import type { TrainingPlan } from '../types'
import { PlansPage } from '../components/plans/PlansPage'

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
        setPlans(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data as any[]).map(p => ({
            ...p,
            total_sessions: (p.training_sessions?.[0]?.count as number) ?? 0,
            training_sessions: undefined,
          })) as TrainingPlan[]
        )
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
        <div style={{ color: COLORS.orange, fontSize: 13, padding: '12px 16px', background: COLORS.orange + '15', borderRadius: 8 }}>
          {error}
        </div>
      </div>
    )
  }

  return <PlansPage plans={plans} onRefresh={fetchPlans} />
}
