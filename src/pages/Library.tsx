import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/colors'
import type { WorkoutLibraryItem } from '../types'
import { LibraryPage } from '../components/library/LibraryPage'

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
      if (data) setItems(data as WorkoutLibraryItem[])
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
        <div style={{ color: COLORS.orange, fontSize: 13, padding: '12px 16px', background: COLORS.orange + '15', borderRadius: 8 }}>
          {error}
        </div>
      </div>
    )
  }

  return <LibraryPage items={items} onRefresh={fetchItems} />
}
