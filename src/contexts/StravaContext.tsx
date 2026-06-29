import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkouts } from './WorkoutsContext'
import type { StravaConnection } from '../types'

interface StravaContextValue {
  connection: StravaConnection | null
  loadingConnection: boolean
  syncing: boolean
  toastMessage: string | null
  clearToast: () => void
  triggerSync: () => Promise<void>
  disconnect: () => Promise<void>
  refetchConnection: () => Promise<void>
}

const StravaContext = createContext<StravaContextValue | null>(null)

export function StravaProvider({ children }: { children: ReactNode }) {
  const { refetchWorkouts } = useWorkouts()
  const [connection, setConnection] = useState<StravaConnection | null>(null)
  const [loadingConnection, setLoadingConnection] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const hasAutoSynced = useRef(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetchConnection = useCallback(async () => {
    const { data } = await supabase
      .from('strava_connections')
      .select('athlete_id, athlete_name')
      .maybeSingle()
    setConnection(data ?? null)
    setLoadingConnection(false)
  }, [])

  useEffect(() => {
    refetchConnection()
  }, [refetchConnection])

  // Auto-sync once per session when connection is found
  useEffect(() => {
    if (!loadingConnection && connection && !hasAutoSynced.current) {
      hasAutoSynced.current = true
      triggerSync()
    }
  // triggerSync is stable — defined below but captures correct state via closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingConnection, connection])

  const showToast = (message: string) => {
    setToastMessage(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMessage(null), 5000)
  }

  const clearToast = () => {
    setToastMessage(null)
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }

  const triggerSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not logged in')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

      const res = await fetch(`${supabaseUrl}/functions/v1/strava-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)

      const count = data?.count ?? 0
      if (count > 0) {
        await refetchWorkouts()
        showToast(`${count} new workout${count === 1 ? '' : 's'} imported from Strava`)
      }
    } catch {
    } finally {
      setSyncing(false)
    }
  }

  const disconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('strava_connections').delete().eq('user_id', user.id)
    setConnection(null)
    hasAutoSynced.current = false
  }

  return (
    <StravaContext.Provider value={{
      connection, loadingConnection,
      syncing, toastMessage, clearToast,
      triggerSync, disconnect, refetchConnection,
    }}>
      {children}
    </StravaContext.Provider>
  )
}

export function useStrava() {
  const ctx = useContext(StravaContext)
  if (!ctx) throw new Error('useStrava must be used within StravaProvider')
  return ctx
}
