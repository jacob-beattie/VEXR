import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { COLORS } from './lib/colors'
import { useAuth } from './hooks/useAuth'
import { WorkoutsProvider, useWorkouts } from './contexts/WorkoutsContext'
import { ProfileProvider, useProfile } from './contexts/ProfileContext'
import { StravaProvider, useStrava } from './contexts/StravaContext'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { LogWorkoutModal } from './components/LogWorkoutModal'
import { ProfileSettingsModal } from './components/ProfileSettingsModal'
import { Dashboard } from './pages/Dashboard'
import { Calendar } from './pages/Calendar'
import { Analytics } from './pages/Analytics'
import { Plans } from './pages/Plans'
import { Library } from './pages/Library'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { StravaCallback } from './pages/StravaCallback'
import type { User } from '@supabase/supabase-js'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }) },
  '/calendar': { title: 'Training Calendar', subtitle: 'Track and plan your sessions' },
  '/analytics': { title: 'Performance Analytics', subtitle: 'Trends, fitness, and load analysis' },
  '/plans': { title: 'Training Plans', subtitle: 'Manage your structured training' },
  '/library': { title: 'Workout Library', subtitle: 'Your saved workout templates' },
}

// Toast notification driven by StravaContext
function SyncToast() {
  const { toastMessage, clearToast } = useStrava()
  if (!toastMessage) return null
  return (
    <div
      onClick={clearToast}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 100,
        background: COLORS.card,
        border: `1px solid #FC4C02`,
        borderRadius: 10,
        padding: '12px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        maxWidth: 320,
      }}
    >
      <span style={{ fontSize: 16 }}>🟠</span>
      <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 600 }}>{toastMessage}</span>
      <span style={{ fontSize: 16, color: COLORS.muted, marginLeft: 4 }}>×</span>
    </div>
  )
}

// Inner shell — rendered inside all providers
function AppShell({ signOut, user }: { signOut: () => Promise<void>; user: User }) {
  const { addWorkout } = useWorkouts()
  const { profile, setProfile } = useProfile()
  const [showModal, setShowModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const pageInfo = pageTitles[location.pathname] || { title: 'Vexr', subtitle: '' }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', 'Helvetica Neue', sans-serif", display: 'flex' }}>
      <Sidebar
        onProfileClick={() => setShowProfileModal(true)}
        onSignOut={async () => { await signOut(); navigate('/login') }}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
        <TopBar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onLogWorkout={() => setShowModal(true)}
        />

        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/analytics" element={<Analytics onOpenProfile={() => setShowProfileModal(true)} />} />
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

      {showProfileModal && profile && (
        <ProfileSettingsModal
          profile={profile}
          user={user}
          onClose={() => setShowProfileModal(false)}
          onSave={updatedProfile => {
            setProfile(updatedProfile)
            setShowProfileModal(false)
          }}
        />
      )}

      <SyncToast />
    </div>
  )
}

// Outer guard — handles auth, then mounts providers + shell
function ProtectedLayout() {
  const { user, loading: authLoading, signOut } = useAuth()

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <ProfileProvider>
      <WorkoutsProvider>
        <StravaProvider>
          <AppShell signOut={signOut} user={user} />
        </StravaProvider>
      </WorkoutsProvider>
    </ProfileProvider>
  )
}

// The /strava/callback route also needs StravaProvider (to call refetchConnection)
// It lives inside ProtectedLayout so auth is already guaranteed
function StravaCallbackWrapper() {
  const { user, loading: authLoading } = useAuth()
  if (authLoading) return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 14 }}>
      Loading…
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return (
    <WorkoutsProvider>
      <StravaProvider>
        <StravaCallback />
      </StravaProvider>
    </WorkoutsProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/strava/callback" element={<StravaCallbackWrapper />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </BrowserRouter>
  )
}
