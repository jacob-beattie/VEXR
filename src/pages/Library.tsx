import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/colors'
import { RADIUS } from '../lib/designTokens'
import type { WorkoutLibraryItem, WorkoutType } from '../types'
import type { Tables } from '../types/database.types'
import { LibraryPage } from '../components/library/LibraryPage'

// workout_library.type has no DB check constraint, so the column is real `string` at the
// schema level — narrowing to WorkoutType is only as safe as the write path staying disciplined.
function mapWorkoutLibraryRow(row: Tables<'workout_library'>): WorkoutLibraryItem {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    name: row.name,
    type: row.type as WorkoutType,
    duration_minutes: row.duration_minutes ?? 0,
    tss: row.tss ?? 0,
    description: row.description ?? '',
  }
}

export function Library() {
  const [items, setItems] = useState<WorkoutLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchItems = useCallback(async () => {
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('workout_library')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError) throw fetchError
      if (data) setItems(data.map(mapWorkoutLibraryRow))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load library.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

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

  return <LibraryPage items={items} onRefresh={fetchItems} />
}
