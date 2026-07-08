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

    setError(null)
    if (data) setProfile(mapProfileRow(data))
    setLoading(false)
  }, [])

  useEffect(() => {
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

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
