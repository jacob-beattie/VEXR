import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { useProfile } from '../contexts/ProfileContext'
import { COLORS } from '../lib/colors'
import type { Tables } from '../types/database.types'

export interface BriefingRecord {
  id: string
  briefing: string
  generated_at: string
}

function mapBriefingRow(row: Pick<Tables<'ai_briefings'>, 'id' | 'briefing' | 'generated_at'>): BriefingRecord {
  return {
    id: row.id,
    briefing: row.briefing,
    generated_at: row.generated_at ?? '',
  }
}

interface TrainingPhase {
  label: string
  color: string
  description: string
}

function getTrainingPhase(daysUntilRace: number | null): TrainingPhase {
  if (daysUntilRace === null || daysUntilRace < 0) {
    return { label: 'Base', color: COLORS.text, description: 'Building aerobic foundation' }
  }
  if (daysUntilRace < 28) return { label: 'Taper', color: COLORS.green, description: 'Reducing load before race' }
  if (daysUntilRace < 56) return { label: 'Peak', color: COLORS.purple, description: 'Sharpening fitness' }
  if (daysUntilRace < 84) return { label: 'Build', color: COLORS.orange, description: 'Building intensity' }
  return { label: 'Base', color: COLORS.text, description: 'Building aerobic foundation' }
}

/**
 * Owns all data-fetching and derived-metric business logic for the AI Coach page:
 * fitness snapshot (via WorkoutsContext, the canonical PMC engine), training phase,
 * weekly compliance/TSS comparison, and the ai_briefings fetch/generate flow.
 * AICoach.tsx consumes this hook and stays presentation-only.
 */
export function useAICoachData() {
  const {
    getWorkoutsForWeek, getWeeklyLoadHistory, calculateFitnessMetrics, getFitnessHistory,
    loading: workoutsLoading, error: workoutsError, refetchWorkouts,
  } = useWorkouts()
  const { profile } = useProfile()

  const [briefings, setBriefings] = useState<BriefingRecord[]>([])
  const [loadingBriefings, setLoadingBriefings] = useState(true)
  const [briefingsError, setBriefingsError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // ── Derived fitness metrics ──────────────────────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const fitness = calculateFitnessMetrics()
  const weekHistory = getFitnessHistory(1)
  const ctlChange = weekHistory.length >= 2
    ? Math.round(weekHistory[weekHistory.length - 1].fitness - weekHistory[0].fitness)
    : 0

  // Race countdown
  const raceDate = profile?.race_date ? new Date(profile.race_date + 'T00:00:00') : null
  const daysUntilRace = raceDate
    ? Math.ceil((raceDate.getTime() - today.getTime()) / 86400000)
    : null
  const phase = getTrainingPhase(daysUntilRace)

  // Weekly compliance (completed / total scheduled sessions this week)
  const weekWorkouts = getWorkoutsForWeek()
  const completedThisWeekCount = weekWorkouts.filter(w => !w.planned).length
  const totalWeekSessions = weekWorkouts.length
  const compliance = totalWeekSessions > 0
    ? Math.round((completedThisWeekCount / totalWeekSessions) * 100)
    : null

  // TSS comparison: this week vs last week
  const weeklyHistory = getWeeklyLoadHistory(2)
  const thisWeekTSS = weeklyHistory[1]?.tss ?? 0
  const lastWeekTSS = weeklyHistory[0]?.tss ?? 0

  // ── Data fetching ────────────────────────────────────────────────────────────
  const fetchBriefings = useCallback(async () => {
    setLoadingBriefings(true)
    setBriefingsError(null)
    const { data, error } = await supabase
      .from('ai_briefings')
      .select('id, briefing, generated_at')
      .order('generated_at', { ascending: false })
      .limit(9)
    if (error) {
      setBriefingsError('Failed to load briefing history. Please try again.')
      setLoadingBriefings(false)
      return
    }
    setBriefings((data ?? []).map(mapBriefingRow))
    setLoadingBriefings(false)
  }, [])

  useEffect(() => { fetchBriefings() }, [fetchBriefings])

  // ── Generate / refresh ────────────────────────────────────────────────────
  const generate = useCallback(async (force = false) => {
    setGenerating(true)
    setGenError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

      // The fetch itself (DNS/offline/CORS) is a distinct failure mode from the AI
      // coach responding with an error — a network outage shouldn't be reported to the
      // user with the same message as "Claude is rate-limited/slow", since one means
      // "check your connection" and the other means "wait and retry".
      let res: Response
      try {
        res = await fetch(`${supabaseUrl}/functions/v1/ai-briefing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({ force }),
        })
      } catch {
        throw new Error('Something went wrong. Check your connection and try again.')
      }

      const json = await res.json()
      // Non-2xx responses carry a specific reason from the edge function (rate limited,
      // AI service timeout, etc.) — surface that message as-is rather than a generic one.
      if (!res.ok) throw new Error(json.error || 'Failed to generate briefing')
      await fetchBriefings()
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }, [fetchBriefings])

  // Current = most recent briefing (within 24h or oldest record)
  const current = briefings[0] ?? null
  const isCurrentFresh = current
    ? (Date.now() - new Date(current.generated_at).getTime()) < 24 * 60 * 60 * 1000
    : false
  const history = briefings.slice(1)

  return {
    profile,
    workoutsLoading, workoutsError, refetchWorkouts,
    fitness, ctlChange,
    daysUntilRace, phase,
    compliance, completedThisWeekCount, totalWeekSessions,
    thisWeekTSS, lastWeekTSS,
    briefings, loadingBriefings, briefingsError, refetchBriefings: fetchBriefings,
    generating, genError, generate,
    current, isCurrentFresh, history,
  }
}
