import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { COLORS } from './lib/colors'
import { useAuth } from './hooks/useAuth'
import { useIsMobile } from './hooks/useIsMobile'
import { WorkoutsProvider, useWorkouts } from './contexts/WorkoutsContext'
import { ProfileProvider, useProfile } from './contexts/ProfileContext'
import { StravaProvider, useStrava } from './contexts/StravaContext'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { LogWorkoutModal } from './components/LogWorkoutModal'
import { ProfileSettingsModal } from './components/ProfileSettingsModal'
import type { User } from '@supabase/supabase-js'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Calendar = lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })))
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })))
const AICoach = lazy(() => import('./pages/AICoach').then(m => ({ default: m.AICoach })))
const Plans = lazy(() => import('./pages/Plans').then(m => ({ default: m.Plans })))
const Library = lazy(() => import('./pages/Library').then(m => ({ default: m.Library })))
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const Signup = lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })))
const StravaCallback = lazy(() => import('./pages/StravaCallback').then(m => ({ default: m.StravaCallback })))
const Onboarding = lazy(() => import('./pages/Onboarding').then(m => ({ default: m.Onboarding })))

function PageLoader() {
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
      Loading…
    </div>
  )
}

const pageTitles: Record<string, { title: string; subtitle: string; titleIcon?: string; titleIconColor?: string }> = {
  '/calendar': { title: 'Training Calendar', subtitle: 'Track and plan your sessions' },
  '/analytics': { title: 'Performance Analytics', subtitle: 'Trends, fitness, and load analysis' },
  '/ai-coach': { title: 'AI Coach', subtitle: 'Powered by Claude · Personalised weekly recommendations', titleIcon: '✦', titleIconColor: '#00e5ff' },
  '/plans': { title: 'Training Plans', subtitle: 'Manage your structured training' },
  '/library': { title: 'Workout Library', subtitle: 'Your saved workout templates' },
}


const bottomNavItems = [
  { path: '/dashboard', icon: '◈', label: 'Home' },
  { path: '/calendar', icon: '⊞', label: 'Calendar' },
  { path: '/analytics', icon: '∿', label: 'Stats' },
  { path: '/ai-coach', icon: '✦', label: 'Coach' },
  { path: '/plans', icon: '≡', label: 'Plans' },
]

function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`,
      display: 'flex', height: 60, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {bottomNavItems.map(item => {
        const active = location.pathname === item.path
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? COLORS.accent : COLORS.muted,
              borderTop: `2px solid ${active ? COLORS.accent : 'transparent'}`,
              transition: 'color 0.15s',
              padding: '0 4px',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em' }}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Toast notification driven by StravaContext
function SyncToast({ isMobile }: { isMobile: boolean }) {
  const { toastMessage, clearToast } = useStrava()
  if (!toastMessage) return null
  return (
    <div
      onClick={clearToast}
      style={{
        position: 'fixed', bottom: isMobile ? 76 : 24, right: 24, zIndex: 100,
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
  const [logWorkoutDate, setLogWorkoutDate] = useState<string | undefined>()
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()

  // Custom events from Dashboard (and other pages) to open modals
  useEffect(() => {
    const handleOpenLog = (e: Event) => {
      const date = (e as CustomEvent<{ date?: string }>).detail?.date
      setLogWorkoutDate(date)
      setShowModal(true)
    }
    const handleOpenProfile = () => setShowProfileModal(true)
    const handleOpenMenu = () => setSidebarOpen(true)
    window.addEventListener('vexr:openLogWorkout', handleOpenLog)
    window.addEventListener('vexr:openProfileSettings', handleOpenProfile)
    window.addEventListener('vexr:openMenu', handleOpenMenu)
    return () => {
      window.removeEventListener('vexr:openLogWorkout', handleOpenLog)
      window.removeEventListener('vexr:openProfileSettings', handleOpenProfile)
      window.removeEventListener('vexr:openMenu', handleOpenMenu)
    }
  }, [])

  const isDashboard = location.pathname === '/dashboard'
  const pageInfo = pageTitles[location.pathname] || { title: 'Vexr', subtitle: '' }

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (profile && profile.onboarding_completed === false) {
      navigate('/onboarding', { replace: true })
    }
  }, [profile, navigate])

  // Close sidebar whenever route changes on mobile
  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [location.pathname, isMobile])

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobile, sidebarOpen])

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', 'Helvetica Neue', sans-serif", display: 'flex' }}>
      {/* Mobile overlay behind sidebar */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 190,
            background: 'rgba(0,0,0,0.55)',
          }}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      {!isMobile && (
        <Sidebar
          onProfileClick={() => setShowProfileModal(true)}
          onSignOut={async () => { await signOut(); navigate('/login') }}
          onLogWorkout={() => { setLogWorkoutDate(undefined); setShowModal(true) }}
        />
      )}
      {isMobile && (
        <Sidebar
          onProfileClick={() => { setShowProfileModal(true); setSidebarOpen(false) }}
          onSignOut={async () => { await signOut(); navigate('/login') }}
          onLogWorkout={() => { setLogWorkoutDate(undefined); setShowModal(true); setSidebarOpen(false) }}
          isMobile
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: isMobile ? '20px 16px' : '28px 32px',
        paddingBottom: isMobile ? 76 : 28,
        minWidth: 0,
      }}>
        {!isDashboard && (
          <TopBar
            title={pageInfo.title}
            subtitle={pageInfo.subtitle}
            titleIcon={pageInfo.titleIcon}
            titleIconColor={pageInfo.titleIconColor}
            onMenuClick={() => setSidebarOpen(true)}
            isMobile={isMobile}
          />
        )}

        <Suspense fallback={null}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/analytics" element={<Analytics onOpenProfile={() => setShowProfileModal(true)} />} />
            <Route path="/ai-coach" element={<AICoach />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/library" element={<Library />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </div>

      {/* Bottom nav — mobile only */}
      {isMobile && <BottomNav />}

      {/* Mobile FAB — hidden on /library which has its own FAB */}
      {isMobile && location.pathname !== '/library' && (
        <button
          onClick={() => { setLogWorkoutDate(undefined); setShowModal(true) }}
          aria-label="Log workout"
          style={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            zIndex: 95,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#00e5ff',
            border: 'none',
            color: '#000',
            fontSize: 24,
            fontWeight: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 20px #00e5ff40',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          +
        </button>
      )}

      {showModal && (
        <LogWorkoutModal
          onClose={() => { setShowModal(false); setLogWorkoutDate(undefined) }}
          onSubmit={addWorkout}
          initialDate={logWorkoutDate}
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

      <SyncToast isMobile={isMobile} />
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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/strava/callback" element={<StravaCallbackWrapper />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
