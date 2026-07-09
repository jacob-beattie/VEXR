import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import type { Tables } from '../types/database.types'

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  setProfile: (p: Profile) => void
  refetchProfile: () => Promise<void>
}

// TypeScript's `as`/generated-type checks only hold at compile time — they can't catch a live
// schema drift (a column renamed in a migration but database.types.ts not regenerated, or a
// row written by a manual execute_sql that doesn't match the expected shape). Validate the
// couple of fields every consumer of useProfile() depends on being the right primitive type
// before mapping, so drift produces a clear error instead of a silent undefined-property bug
// downstream (e.g. `profile.ftp` being a string flowing silently into TSS math).
function isValidProfileRow(row: unknown): row is Tables<'profiles'> {
  if (!row || typeof row !== 'object') return false
  const r = row as Record<string, unknown>
  return typeof r.id === 'string'
    && (r.name === null || typeof r.name === 'string')
    && (r.sport === null || typeof r.sport === 'string')
    && (r.ftp === null || typeof r.ftp === 'number')
    && (r.run_pace === null || typeof r.run_pace === 'string')
    && (r.css === null || typeof r.css === 'string')
    && (r.max_hr === null || typeof r.max_hr === 'number')
}

// profiles.name/sport/ftp/run_pace/css are nullable in the DB (unset until onboarding
// completes) but the app type assumes they're always present post-onboarding — default the
// gap here rather than letting `undefined`/`null` leak into every consumer of useProfile().
function mapProfileRow(row: Tables<'profiles'>): Profile {
  return {
    id: row.id,
    name: row.name ?? '',
    sport: row.sport ?? '',
    ftp: row.ftp ?? 0,
    run_pace: row.run_pace ?? '',
    css: row.css ?? '',
    race_goal: row.race_goal ?? undefined,
    race_date: row.race_date ?? undefined,
    onboarding_completed: row.onboarding_completed ?? undefined,
    max_hr: row.max_hr,
    avatar_url: row.avatar_url,
  }
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const fetchProfile = useCallback(async () => {
    const reqId = ++fetchIdRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // A newer fetch already resolved (or started) — this response is stale, ignore it.
      if (reqId !== fetchIdRef.current) return
      setProfile(null)
      setLoading(false)
      return
    }
    const { data, error: fetchError } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (reqId !== fetchIdRef.current) return

    if (fetchError) {
      setError('Failed to load profile. Please refresh.')
      setLoading(false)
      return
    }

    if (data && !isValidProfileRow(data)) {
      setError('Received unexpected profile data. Please refresh or contact support.')
      setLoading(false)
      return
    }

    setError(null)
    if (data) setProfile(mapProfileRow(data))
    setLoading(false)
  }, [])

  useEffect(() => {
    // fetchProfile is a genuine "synchronize with an external system" effect
    // (fetch profile row from Supabase on mount / auth change) — exactly the
    // pattern react.dev recommends useEffect for. Calling setState once the
    // fetch resolves is the correct, unavoidable way to bring that external
    // data into React state; there's no render-time-only alternative here
    // (unlike App.tsx's sidebar-close effect, which was pure derived UI
    // state and got a real refactor instead). Rather than restructure this
    // shared auth-adjacent context around the new stricter compiler lint
    // rule, disable it here with this explanation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchProfile()
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const value = useMemo<ProfileContextValue>(() => ({
    profile, loading, error, setProfile, refetchProfile: fetchProfile,
  }), [profile, loading, error, fetchProfile])

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  )
}

// Splitting useProfile into its own file would touch every one of its
// importers across the app for a fast-refresh nicety only — not worth it on
// a solo project. Scoped disable instead of a file-structure change.
// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
