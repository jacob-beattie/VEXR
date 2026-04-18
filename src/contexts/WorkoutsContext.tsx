import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Workout } from '../types'
import { calculatePMC } from '../lib/calculateMetrics'

interface FitnessMetrics {
  ctl: number
  atl: number
  tsb: number
}

interface WorkoutsContextValue {
  workouts: Workout[]
  loading: boolean
  refetchWorkouts: () => Promise<void>
  addWorkout: (workout: Omit<Workout, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  updateWorkout: (id: string, updates: Partial<Workout>) => Promise<void>
  deleteWorkout: (id: string) => Promise<void>
  getWorkoutsForMonth: (year: number, month: number) => Workout[]
  getWorkoutsForWeek: () => Workout[]
  getTodaysWorkouts: () => Workout[]
  calculateFitnessMetrics: () => FitnessMetrics
  getWeeklyTSS: () => number
  getWeeklyLoadHistory: (weeks?: number) => Array<{ week: string; tss: number; planned: number }>
  getDailyWeekLoad: () => Array<{ day: string; tss: number; planned: number }>
  getFitnessHistory: (weeks?: number) => Array<{ week: string; fitness: number; fatigue: number; form: number }>
  getUpcomingWorkouts: (days?: number) => Workout[]
}

const WorkoutsContext = createContext<WorkoutsContextValue | null>(null)

export function WorkoutsProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkouts = useCallback(async () => {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      console.error('[WorkoutsContext] fetch error:', error.message, error)
      setLoading(false)
      return
    }

    console.log('[WorkoutsContext] fetched', data?.length ?? 0, 'workouts', data)
    setWorkouts((data ?? []) as Workout[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // Fetch immediately (session should already be set by ProtectedLayout)
    fetchWorkouts()

    // Also re-fetch on any auth state change — handles the case where the
    // Supabase client session wasn't ready on the very first render
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[WorkoutsContext] auth event:', event, 'session:', !!session)
      if (session) fetchWorkouts()
    })

    // Real-time subscription so any insert/update/delete reflects immediately
    const channel = supabase
      .channel('workouts-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, (payload) => {
        console.log('[WorkoutsContext] realtime change:', payload.eventType)
        fetchWorkouts()
      })
      .subscribe((status) => {
        console.log('[WorkoutsContext] realtime status:', status)
      })

    return () => {
      authSub.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [fetchWorkouts])

  const addWorkout = async (workout: Omit<Workout, 'id' | 'user_id' | 'created_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { error } = await supabase.from('workouts').insert({ ...workout, user_id: user.id })
    if (error) throw error
    // Don't wait for realtime — refetch immediately so UI updates right away
    await fetchWorkouts()
  }

  const updateWorkout = async (id: string, updates: Partial<Workout>) => {
    const { error } = await supabase.from('workouts').update(updates).eq('id', id)
    if (error) throw error
    await fetchWorkouts()
  }

  const deleteWorkout = async (id: string) => {
    const { error } = await supabase.from('workouts').delete().eq('id', id)
    if (error) throw error
    await fetchWorkouts()
  }

  // ─── Derived data helpers ────────────────────────────────────────────────

  // toISOString() converts to UTC which breaks date matching for timezones
  // ahead of UTC (e.g. AEST). Always build keys from local date parts instead.
  const localDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const formatDateLabel = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const getWorkoutsForMonth = (year: number, month: number): Workout[] =>
    workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d.getFullYear() === year && d.getMonth() === month
    })

  const getTodaysWorkouts = (): Workout[] => {
    const todayKey = localDateKey(new Date())
    return workouts.filter(w => w.date.split('T')[0] === todayKey)
  }

  const getWorkoutsForWeek = (): Workout[] => {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(now)
    start.setDate(now.getDate() + diff)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d >= start && d <= end
    })
  }

  const calculateFitnessMetrics = (): FitnessMetrics => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // windowStart = today (we only need `current`, not history)
    const { current } = calculatePMC(workouts, today, today)
    return current
  }

  const getWeeklyTSS = (): number =>
    getWorkoutsForWeek().reduce((sum, w) => sum + (w.tss || 0), 0)

  const getDailyWeekLoad = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    return days.map((d, i) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      date.setHours(0, 0, 0, 0)
      const dateEnd = new Date(date)
      dateEnd.setHours(23, 59, 59, 999)
      const dayWorkouts = workouts.filter(w => {
        const wd = new Date(w.date + 'T00:00:00')
        return wd >= date && wd <= dateEnd
      })
      return {
        day: d,
        tss: dayWorkouts.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0),
        planned: dayWorkouts.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0),
      }
    })
  }

  const getWeeklyLoadHistory = (weeks = 8) => {
    const now = new Date()
    return Array.from({ length: weeks }, (_, i) => {
      const weekStart = new Date(now)
      const day = weekStart.getDay()
      const diff = day === 0 ? -6 : 1 - day
      weekStart.setDate(now.getDate() + diff - (weeks - 1 - i) * 7)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      const ww = workouts.filter(w => {
        const d = new Date(w.date + 'T00:00:00')
        return d >= weekStart && d <= weekEnd
      })
      return {
        week: formatDateLabel(weekStart),
        tss: ww.filter(w => !w.planned).reduce((s, w) => s + (w.tss || 0), 0),
        planned: ww.filter(w => w.planned).reduce((s, w) => s + (w.tss || 0), 0),
      }
    })
  }

  const getFitnessHistory = (weeks = 8) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const windowStart = new Date(today.getTime() - weeks * 7 * 86400000)
    const { history } = calculatePMC(workouts, windowStart, today)
    return history.map(d => ({
      week: d.label,
      fitness: d.ctl,
      fatigue: d.atl,
      form: d.tsb,
    }))
  }

  // Returns planned workouts with date >= today (today's planned workouts are included).
  const getUpcomingWorkouts = (days = 14): Workout[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(today)
    end.setDate(today.getDate() + days)
    return workouts
      .filter(w => {
        const d = new Date(w.date + 'T00:00:00')
        return w.planned === true && d >= today && d <= end
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  return (
    <WorkoutsContext.Provider value={{
      workouts, loading,
      refetchWorkouts: fetchWorkouts,
      addWorkout, updateWorkout, deleteWorkout,
      getWorkoutsForMonth, getWorkoutsForWeek, getTodaysWorkouts,
      calculateFitnessMetrics, getWeeklyTSS,
      getWeeklyLoadHistory, getDailyWeekLoad,
      getFitnessHistory, getUpcomingWorkouts,
    }}>
      {children}
    </WorkoutsContext.Provider>
  )
}

export function useWorkouts() {
  const ctx = useContext(WorkoutsContext)
  if (!ctx) throw new Error('useWorkouts must be used within WorkoutsProvider')
  return ctx
}
