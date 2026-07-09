import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Tables } from '../types/database.types'

export interface Goal {
  id: string
  text: string
  completed: boolean
  created_at: string
}

function mapGoalRow(row: Tables<'goals'>): Goal {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed ?? false,
    created_at: row.created_at ?? '',
  }
}

/** Owns the `goals` table CRUD for the dashboard's Season Goals panel. */
export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    const fetchGoals = async () => {
      setLoading(true)
      setError(false)
      const { data, error: fetchError } = await supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: true })
      if (fetchError) setError(true)
      else if (data) setGoals(data.map(mapGoalRow))
      setLoading(false)
    }
    fetchGoals()
  }, [reloadKey])

  const [mutationError, setMutationError] = useState<string | null>(null)

  const addGoal = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim()
    if (!trimmed || saving) return false
    setSaving(true)
    setMutationError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return false }
    const { data, error } = await supabase.from('goals').insert({ text: trimmed, user_id: user.id }).select().single()
    setSaving(false)
    if (error || !data) {
      setMutationError('Failed to add goal. Please try again.')
      return false
    }
    setGoals(prev => [...prev, mapGoalRow(data)])
    return true
  }, [saving])

  const toggleGoal = useCallback(async (goal: Goal) => {
    setMutationError(null)
    const { error } = await supabase.from('goals').update({ completed: !goal.completed }).eq('id', goal.id)
    if (error) { setMutationError('Failed to update goal. Please try again.'); return }
    setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completed: !g.completed } : g))
  }, [])

  const deleteGoal = useCallback(async (id: string) => {
    setMutationError(null)
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (error) { setMutationError('Failed to delete goal. Please try again.'); return }
    setGoals(prev => prev.filter(g => g.id !== id))
  }, [])

  return { goals, loading, error, saving, mutationError, addGoal, toggleGoal, deleteGoal, refetch }
}
