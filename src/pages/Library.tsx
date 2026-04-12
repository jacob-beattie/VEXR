import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { WorkoutLibraryItem } from '../types'
import { LibraryPage } from '../components/library/LibraryPage'

export function Library() {
  const [items, setItems] = useState<WorkoutLibraryItem[]>([])

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('workout_library')
      .select('*')
      .order('name', { ascending: true })
    if (data) setItems(data as WorkoutLibraryItem[])
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  return <LibraryPage items={items} onRefresh={fetchItems} />
}
