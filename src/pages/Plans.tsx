import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { TrainingPlan } from '../types'
import { PlansPage } from '../components/plans/PlansPage'

export function Plans() {
  const [plans, setPlans] = useState<TrainingPlan[]>([])

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from('training_plans')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setPlans(data as TrainingPlan[])
  }, [])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  return <PlansPage plans={plans} onRefresh={fetchPlans} />
}
