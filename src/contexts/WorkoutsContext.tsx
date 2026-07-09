import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode, MutableRefObject } from 'react'
import { supabase } from '../lib/supabase'
import type { Workout, WorkoutType, WorkoutBlock } from '../types'
import type { Tables, Json } from '../types/database.types'
import { calculatePMC } from '../lib/calculateMetrics'
import { localDateKey } from '../components/dashboard/utils'

type WorkoutRow = Tables<'workouts'>

// TypeScript's generated-type checks only hold at compile time — they can't catch a live
// schema drift (a column renamed in a migration but database.types.ts not regenerated, or a
// row written by a manual execute_sql/edge function that doesn't match the expected shape).
// calculateFitnessMetrics/getFitnessHistory (the canonical PMC engine) run on every workout in
// state on every render, so a malformed `duration_minutes`/`tss` here would silently produce
// NaN throughout the dashboard/analytics/calendar rather than a clear error — validate the
// couple of fields those derived getters depend on before mapping.
function isValidWorkoutRow(row: unknown): row is WorkoutRow {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return typeof r.id === 'string'
    && typeof r.title === 'string'
    && typeof r.type === 'string'
    && typeof r.date === 'string'
    && (r.duration_minutes === null || typeof r.duration_minutes === 'number')
    && (r.tss === null || typeof r.tss === 'number')
    && (r.planned === null || typeof r.planned === 'boolean')
}

// workouts.type has no DB check constraint, so the column is real `string` at the schema
// level — narrowing to WorkoutType here is only as safe as every write path (this context's
// addWorkout/updateWorkout, plus strava-sync) staying disciplined about only writing valid values.
function mapWorkoutRow(row: WorkoutRow): Workout {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    title: row.title,
    type: row.type as WorkoutType,
    date: row.date,
    duration_minutes: row.duration_minutes ?? 0,
    tss: row.tss ?? 0,
    zone: row.zone ?? undefined,
    notes: row.notes ?? undefined,
    planned: row.planned ?? false,
    structure: row.structure as unknown as WorkoutBlock[] | null,
    strava_activity_id: row.strava_activity_id,
    heart_rate_avg: row.heart_rate_avg,
    heart_rate_max: row.heart_rate_max,
    distance_meters: row.distance_meters,
    calories: row.calories,
    elevation_gain: row.elevation_gain,
    avg_power: row.avg_power,
    avg_pace: row.avg_pace,
    created_at: row.created_at ?? '',
  }
}

// WorkoutBlock[] has no index signature so it isn't structurally assignable to Json — the
// shape is JSON-serializable at runtime, this just bridges the two type representations.
function serializeStructure(structure: WorkoutBlock[] | null | undefined): Json | null | undefined {
  if (structure === undefined) return undefined
  return structure as unknown as Json
}

interface FitnessMetrics {
  ctl: number
  atl: number
  tsb: number
}

type WeeklyLoadEntry = { week: string; tss: number; planned: number }
type DailyLoadEntry = { day: string; tss: number; planned: number }
type FitnessHistoryEntry = { week: string; fitness: number; fatigue: number; form: number }

interface WorkoutsContextValue {
  workouts: Workout[]
  loading: boolean
  error: string | null
  refetchWorkouts: () => Promise<void>
  addWorkout: (workout: Omit<Workout, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  updateWorkout: (id: string, updates: Partial<Workout>) => Promise<void>
  deleteWorkout: (id: string) => Promise<void>
  getWorkoutsForMonth: (year: number, month: number) => Workout[]
  getWorkoutsForWeek: () => Workout[]
  getTodaysWorkouts: () => Workout[]
  calculateFitnessMetrics: () => FitnessMetrics
  getWeeklyLoadHistory: (weeks?: number) => WeeklyLoadEntry[]
  getDailyWeekLoad: () => DailyLoadEntry[]
  getFitnessHistory: (weeks?: number) => FitnessHistoryEntry[]
  getUpcomingWorkouts: (days?: number) => Workout[]
}

const WorkoutsContext = createContext<WorkoutsContextValue | null>(null)

function formatDateLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Per-`workouts`-identity memoization cache for the derived getters below. Each getter
// computes fresh `today`/`now` values at call time (so results stay correct if the tab is
// left open across midnight), but caches by (day, args) so repeated calls in the same render
// — or across renders where neither workouts nor the day have changed — skip recomputation.
interface DerivedCache {
  workouts: Workout[]
  fitnessMetrics: Map<string, FitnessMetrics>
  fitnessHistory: Map<string, FitnessHistoryEntry[]>
  weeklyLoadHistory: Map<string, WeeklyLoadEntry[]>
  dailyWeekLoad: Map<string, DailyLoadEntry[]>
  workoutsForWeek: Map<string, Workout[]>
  todaysWorkouts: Map<string, Workout[]>
  upcomingWorkouts: Map<string, Workout[]>
  workoutsForMonth: Map<string, Workout[]>
}

function makeEmptyCache(workouts: Workout[]): DerivedCache {
  return {
    workouts,
    fitnessMetrics: new Map(),
    fitnessHistory: new Map(),
    weeklyLoadHistory: new Map(),
    dailyWeekLoad: new Map(),
    workoutsForWeek: new Map(),
    todaysWorkouts: new Map(),
    upcomingWorkouts: new Map(),
    workoutsForMonth: new Map(),
  }
}

// Module-scope (not a per-render closure) so it never needs to appear in a useCallback
// dependency array — only the ref and the `workouts` array it's keyed on do.
function getDerivedCache(cacheRef: MutableRefObject<DerivedCache>, workouts: Workout[]): DerivedCache {
  if (cacheRef.current.workouts !== workouts) {
    cacheRef.current = makeEmptyCache(workouts)
  }
  return cacheRef.current
}

export function WorkoutsProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)
  const cacheRef = useRef<DerivedCache>(makeEmptyCache([]))

  const fetchWorkouts = useCallback(async () => {
    const reqId = ++fetchIdRef.current
    const { data, error: fetchError } = await supabase
      .from('workouts')
      .select('*')
      .order('date', { ascending: false })

    // A newer fetch already resolved (or started) — this response is stale, ignore it.
    if (reqId !== fetchIdRef.current) return

    if (fetchError) {
      setError('Failed to load workouts. Please try again.')
      setLoading(false)
      return
    }

    const rows = data ?? []
    if (rows.some(r => !isValidWorkoutRow(r))) {
      setError('Received unexpected workout data. Please refresh or contact support.')
      setLoading(false)
      return
    }

    setError(null)
    setWorkouts(rows.map(mapWorkoutRow))
    setLoading(false)
  }, [])

  useEffect(() => {
    // Fetch immediately (session should already be set by ProtectedLayout).
    // Same category as ProfileContext's fetch-on-mount effect: this
    // synchronizes with an external system (Supabase), so the setState call
    // once the fetch resolves is the correct, idiomatic pattern per
    // react.dev's own "Fetching data" example — there's no render-time-only
    // alternative. Disabled with explanation rather than restructured
    // around the newer, stricter compiler lint rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkouts()

    // Also re-fetch on any auth state change — handles the case where the
    // Supabase client session wasn't ready on the very first render
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchWorkouts()
    })

    // Real-time subscription so any insert/update/delete reflects immediately
    const channel = supabase
      .channel('workouts-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, () => {
        fetchWorkouts()
      })
      .subscribe()

    return () => {
      authSub.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [fetchWorkouts])

  const addWorkout = useCallback(async (workout: Omit<Workout, 'id' | 'user_id' | 'created_at'>) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { error: insertError } = await supabase.from('workouts').insert({
      ...workout,
      structure: serializeStructure(workout.structure),
      user_id: user.id,
    })
    if (insertError) throw insertError
    // Don't wait for realtime — refetch immediately so UI updates right away
    await fetchWorkouts()
  }, [fetchWorkouts])

  const updateWorkout = useCallback(async (id: string, updates: Partial<Workout>) => {
    const { error: updateError } = await supabase.from('workouts').update({
      ...updates,
      structure: serializeStructure(updates.structure),
    }).eq('id', id)
    if (updateError) throw updateError
    await fetchWorkouts()
  }, [fetchWorkouts])

  const deleteWorkout = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('workouts').delete().eq('id', id)
    if (deleteError) throw deleteError
    await fetchWorkouts()
  }, [fetchWorkouts])

  // ─── Derived data helpers ────────────────────────────────────────────────
  // `workouts` only changes reference when a fetch actually replaces the array, so keying
  // the cache on that reference (rather than on the WorkoutsProvider's own render count)
  // means these getters stay cheap across re-renders triggered by unrelated state elsewhere
  // in the tree (modal open/close, mobile breakpoint, etc.) without ever returning stale data.

  const getWorkoutsForMonth = useCallback((year: number, month: number): Workout[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const key = `${year}-${month}`
    const cached = cache.workoutsForMonth.get(key)
    if (cached) return cached
    const result = workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d.getFullYear() === year && d.getMonth() === month
    })
    cache.workoutsForMonth.set(key, result)
    return result
  }, [workouts])

  const getTodaysWorkouts = useCallback((): Workout[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cached = cache.todaysWorkouts.get(todayKey)
    if (cached) return cached
    const result = workouts.filter(w => w.date.split('T')[0] === todayKey)
    cache.todaysWorkouts.set(todayKey, result)
    return result
  }, [workouts])

  const getWorkoutsForWeek = useCallback((): Workout[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cached = cache.workoutsForWeek.get(todayKey)
    if (cached) return cached
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(now)
    start.setDate(now.getDate() + diff)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    const result = workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d >= start && d <= end
    })
    cache.workoutsForWeek.set(todayKey, result)
    return result
  }, [workouts])

  const calculateFitnessMetrics = useCallback((): FitnessMetrics => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cached = cache.fitnessMetrics.get(todayKey)
    if (cached) return cached
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // windowStart = today (we only need `current`, not history)
    const { current } = calculatePMC(workouts, today, today)
    cache.fitnessMetrics.set(todayKey, current)
    return current
  }, [workouts])

  const getDailyWeekLoad = useCallback((): DailyLoadEntry[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cached = cache.dailyWeekLoad.get(todayKey)
    if (cached) return cached
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    const result = days.map((d, i) => {
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
    cache.dailyWeekLoad.set(todayKey, result)
    return result
  }, [workouts])

  const getWeeklyLoadHistory = useCallback((weeks = 8): WeeklyLoadEntry[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cacheKey = `${todayKey}:${weeks}`
    const cached = cache.weeklyLoadHistory.get(cacheKey)
    if (cached) return cached
    const now = new Date()
    const result = Array.from({ length: weeks }, (_, i) => {
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
    cache.weeklyLoadHistory.set(cacheKey, result)
    return result
  }, [workouts])

  const getFitnessHistory = useCallback((weeks = 8): FitnessHistoryEntry[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cacheKey = `${todayKey}:${weeks}`
    const cached = cache.fitnessHistory.get(cacheKey)
    if (cached) return cached
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const windowStart = new Date(today.getTime() - weeks * 7 * 86400000)
    const { history } = calculatePMC(workouts, windowStart, today)
    const result = history.map(d => ({
      week: d.label,
      fitness: d.ctl,
      fatigue: d.atl,
      form: d.tsb,
    }))
    cache.fitnessHistory.set(cacheKey, result)
    return result
  }, [workouts])

  // Returns planned workouts with date >= today (today's planned workouts are included).
  const getUpcomingWorkouts = useCallback((days = 14): Workout[] => {
    const cache = getDerivedCache(cacheRef, workouts)
    const todayKey = localDateKey(new Date())
    const cacheKey = `${todayKey}:${days}`
    const cached = cache.upcomingWorkouts.get(cacheKey)
    if (cached) return cached
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(today)
    end.setDate(today.getDate() + days)
    const result = workouts
      .filter(w => {
        const d = new Date(w.date + 'T00:00:00')
        return w.planned === true && d >= today && d <= end
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    cache.upcomingWorkouts.set(cacheKey, result)
    return result
  }, [workouts])

  const value = useMemo<WorkoutsContextValue>(() => ({
    workouts, loading, error,
    refetchWorkouts: fetchWorkouts,
    addWorkout, updateWorkout, deleteWorkout,
    getWorkoutsForMonth, getWorkoutsForWeek, getTodaysWorkouts,
    calculateFitnessMetrics,
    getWeeklyLoadHistory, getDailyWeekLoad,
    getFitnessHistory, getUpcomingWorkouts,
  }), [
    workouts, loading, error, fetchWorkouts,
    addWorkout, updateWorkout, deleteWorkout,
    getWorkoutsForMonth, getWorkoutsForWeek, getTodaysWorkouts,
    calculateFitnessMetrics,
    getWeeklyLoadHistory, getDailyWeekLoad,
    getFitnessHistory, getUpcomingWorkouts,
  ])

  return (
    <WorkoutsContext.Provider value={value}>
      {children}
    </WorkoutsContext.Provider>
  )
}

// Splitting useWorkouts into its own file would touch every one of its
// importers across the app for a fast-refresh nicety only — not worth it on
// a solo project. Scoped disable instead of a file-structure change.
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkouts() {
  const ctx = useContext(WorkoutsContext)
  if (!ctx) throw new Error('useWorkouts must be used within WorkoutsProvider')
  return ctx
}
