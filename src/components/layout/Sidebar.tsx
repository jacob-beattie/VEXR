import { useNavigate, useLocation } from 'react-router-dom'
import { COLORS } from '../../lib/colors'
import { useProfile } from '../../contexts/ProfileContext'
import { useStrava } from '../../contexts/StravaContext'

interface SidebarProps {
  onProfileClick: () => void
  onSignOut: () => void
  onLogWorkout: () => void
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const navItems = [
  { path: '/dashboard', icon: '◈', label: 'Dashboard' },
  { path: '/calendar', icon: '⊞', label: 'Calendar' },
  { path: '/analytics', icon: '∿', label: 'Analytics' },
  { path: '/ai-coach', icon: '✦', label: 'AI Coach' },
  { path: '/plans', icon: '≡', label: 'Training Plans' },
  { path: '/library', icon: '⊙', label: 'Workout Library' },
]

export function Sidebar({ onProfileClick, onSignOut, onLogWorkout, isMobile = false, isOpen = false, onClose }: SidebarProps) {
  const { profile } = useProfile()
  const { syncing, connection } = useStrava()
  const navigate = useNavigate()
  const location = useLocation()

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleNav = (path: string) => {
    navigate(path)
    if (isMobile && onClose) onClose()
  }

  const sidebarStyle: React.CSSProperties = isMobile
    ? {
        width: 260,
        flexShrink: 0,
        background: COLORS.surface,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 200,
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        overflowY: 'auto',
      }
    : {
        width: 220,
        flexShrink: 0,
        background: COLORS.surface,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }

  return (
    <div style={sidebarStyle}>
      {/* Logo + close button row */}
      <div style={{ padding: '0 20px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.08em', color: COLORS.text }}>
            <span style={{ color: COLORS.accent }}>VEX</span><span style={{ color: COLORS.text }}>R</span>
          </div>
          <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.12em', marginTop: 2 }}>TRAIN. TRACK. PERFORM.</div>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: COLORS.muted,
              fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* User card — clickable */}
      <div
        onClick={onProfileClick}
        style={{
          margin: '0 12px 24px', background: COLORS.card, borderRadius: 10,
          padding: '12px 14px', border: `1px solid ${COLORS.border}`,
          cursor: 'pointer', transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = COLORS.accent + '60')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = COLORS.border)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.purple})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#000',
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{profile?.name || 'Athlete'}</div>
            <div style={{ fontSize: 10, color: COLORS.muted, textTransform: 'capitalize' }}>
              {profile?.sport || 'triathlon'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '8px 10px', background: COLORS.bg, borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.accent, fontFamily: 'monospace' }}>{profile?.ftp || '—'}</div>
            <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: '0.08em' }}>FTP</div>
          </div>
          <div style={{ width: 1, background: COLORS.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.green, fontFamily: 'monospace' }}>{profile?.run_pace || '—'}</div>
            <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: '0.08em' }}>PACE</div>
          </div>
          <div style={{ width: 1, background: COLORS.border }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.purple, fontFamily: 'monospace' }}>{profile?.css || '—'}</div>
            <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: '0.08em' }}>CSS</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      {navItems.map(item => {
        const active = location.pathname === item.path
        return (
          <button
            key={item.path}
            onClick={() => handleNav(item.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 20px',
              background: active ? COLORS.accentDim : 'transparent',
              borderTop: 'none', borderRight: 'none', borderBottom: 'none',
              borderLeft: `3px solid ${active ? COLORS.accent : 'transparent'}`,
              color: active ? COLORS.accent : COLORS.muted,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>{item.label}
          </button>
        )
      })}

      {/* Sign out + Strava indicator */}
      <div style={{ marginTop: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onLogWorkout}
          style={{
            width: '100%',
            padding: '12px',
            background: '#00e5ff',
            border: 'none',
            borderRadius: 10,
            color: '#000000',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#00c8e0')}
          onMouseLeave={e => (e.currentTarget.style.background = '#00e5ff')}
        >
          + Log Workout
        </button>
        {(syncing || connection) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 2px',
            fontSize: 11, color: syncing ? '#FC4C02' : COLORS.muted,
            fontWeight: syncing ? 600 : 400,
          }}>
            <span className={syncing ? 'spinning' : ''} style={{ fontSize: 11, display: 'inline-block', lineHeight: 1 }}>
              {syncing ? '⟳' : '●'}
            </span>
            {syncing ? 'Syncing from Strava…' : 'Strava connected'}
          </div>
        )}

        <button
          onClick={onSignOut}
          style={{
            width: '100%', padding: '9px 14px',
            background: 'none', border: `1px solid ${COLORS.border}`,
            borderRadius: 8, color: COLORS.muted,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            textAlign: 'left', fontFamily: 'inherit',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = COLORS.text; e.currentTarget.style.borderColor = COLORS.muted }}
          onMouseLeave={e => { e.currentTarget.style.color = COLORS.muted; e.currentTarget.style.borderColor = COLORS.border }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
