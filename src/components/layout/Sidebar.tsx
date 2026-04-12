import { useNavigate, useLocation } from 'react-router-dom'
import { COLORS } from '../../lib/colors'
import type { Profile } from '../../types'

interface SidebarProps {
  profile: Profile | null
}

const navItems = [
  { path: '/dashboard', icon: '◈', label: 'Dashboard' },
  { path: '/calendar', icon: '⊞', label: 'Calendar' },
  { path: '/analytics', icon: '∿', label: 'Analytics' },
  { path: '/plans', icon: '≡', label: 'Training Plans' },
  { path: '/library', icon: '⊙', label: 'Workout Library' },
]

export function Sidebar({ profile }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const raceDate = profile?.race_date ? new Date(profile.race_date) : null
  const daysUntilRace = raceDate
    ? Math.ceil((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div style={{
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
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 28px' }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.08em', color: COLORS.text }}>
          <span style={{ color: COLORS.accent }}>VEX</span><span style={{ color: COLORS.text }}>R</span>
        </div>
        <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.12em', marginTop: 2 }}>TRAIN. TRACK. PERFORM.</div>
      </div>

      {/* User card */}
      <div style={{ margin: '0 12px 24px', background: COLORS.card, borderRadius: 10, padding: '12px 14px', border: `1px solid ${COLORS.border}` }}>
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
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 20px',
              background: active ? COLORS.accentDim : 'transparent',
              border: 'none',
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

      {/* Race goal */}
      {profile?.race_goal && (
        <div style={{ marginTop: 'auto', padding: '0 20px' }}>
          <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase' }}>Race Goal</div>
          <div style={{ background: COLORS.card, borderRadius: 8, padding: '10px 12px', border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>{profile.race_goal}</div>
            {raceDate && (
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>
                {raceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {daysUntilRace !== null && daysUntilRace > 0 && ` · ${daysUntilRace} days`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
