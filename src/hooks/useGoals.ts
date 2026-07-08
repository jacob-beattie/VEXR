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

  useEffect(() => {
    supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setGoals(data.map(mapGoalRow)); setLoading(false) })
  }, [])

  const addGoal = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim()
    if (!trimmed || saving) return false
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return false }
    const { data, error } = await supabase.from('goals').insert({ text: trimmed, user_id: user.id }).select().single()
    setSaving(false)
    if (error || !data) return false
    setGoals(prev => [...prev, mapGoalRow(data)])
    return true
  }, [saving])

  const toggleGoal = useCallback(async (goal: Goal) => {
    const { error } = await supabase.from('goals').update({ completed: !goal.completed }).eq('id', goal.id)
    if (!error) setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, completed: !g.completed } : g))
  }, [])

  const deleteGoal = useCallback(async (id: string) => {
    const { error } = await supabase.from('goals').delete().eq('id', id)
    if (!error) setGoals(prev => prev.filter(g => g.id !== id))
  }, [])

  return { goals, loading, saving, addGoal, toggleGoal, deleteGoal }
}
