import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { COLORS } from './lib/colors'
import { supabase } from './lib/supabase'
import { useAuth } from './hooks/useAuth'
import { WorkoutsProvider, useWorkouts } from './contexts/WorkoutsContext'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { LogWorkoutModal } from './components/LogWorkoutModal'
import { Dashboard } from './pages/Dashboard'
import { Calendar } from './pages/Calendar'
import { Analytics } from './pages/Analytics'
import { Plans } from './pages/Plans'
import { Library } from './pages/Library'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import type { Profile } from './types'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }) },
  '/calendar': { title: 'Training Calendar', subtitle: 'Track and plan your sessions' },
  '/analytics': { title: 'Performance Analytics', subtitle: 'Trends, fitness, and load analysis' },
  '/plans': { title: 'Training Plans', subtitle: 'Manage your structured training' },
  '/library': { title: 'Workout Library', subtitle: 'Your saved workout templates' },
}

// Inner shell — rendered inside WorkoutsProvider, safe to call useWorkouts()
function AppShell({ signOut, profile }: { signOut: () => Promise<void>; profile: Profile | null }) {
  const { addWorkout } = useWorkouts()
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const pageInfo = pageTitles[location.pathname] || { title: 'Vexr', subtitle: '' }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', 'Helvetica Neue', sans-serif", display: 'flex' }}>
      <Sidebar profile={profile} />

      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        <TopBar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onLogWorkout={() => setShowModal(true)}
        />

        <div style={{ position: 'fixed', bottom: 20, right: 24 }}>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>

        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/library" element={<Library />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>

      {showModal && (
        <LogWorkoutModal
          onClose={() => setShowModal(false)}
          onSubmit={addWorkout}
        />
      )}
    </div>
  )
}

// Outer guard — handles auth, then mounts the provider + shell
function ProtectedLayout() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data as Profile) })
  }, [user])

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <WorkoutsProvider>
      <AppShell signOut={signOut} profile={profile} />
    </WorkoutsProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  )
}
