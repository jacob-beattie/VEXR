import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { TrainingPlan } from '../types'
import { PlansPage } from '../components/plans/PlansPage'

export function Plans() {
  const [plans, setPlans] = useState<TrainingPlan[]>([])

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from('training_plans')
      .select('*, training_sessions(count)')
      .order('created_at', { ascending: false })

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
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  return <PlansPage plans={plans} onRefresh={fetchPlans} />
}
