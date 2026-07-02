import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import type { Tables } from '../types/database.types'

interface ProfileContextValue {
  profile: Profile | null
  setProfile: (p: Profile) => void
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

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(mapProfileRow(data))
    }

    fetchProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) fetchProfile()
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
