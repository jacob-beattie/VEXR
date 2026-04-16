import { COLORS } from '../../lib/colors'
import { Button } from '../ui/Button'

interface TopBarProps {
  title: string
  subtitle?: string
  onLogWorkout: () => void
  onMenuClick?: () => void
  isMobile?: boolean
}

export function TopBar({ title, subtitle, onLogWorkout, onMenuClick, isMobile = false }: TopBarProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isMobile && (
          <button
            onClick={onMenuClick}
            style={{
              background: 'none', border: 'none',
              color: COLORS.text, fontSize: 20, cursor: 'pointer',
              padding: '2px 4px', lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Open menu"
          >
            ☰
          </button>
        )}
        <div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, letterSpacing: '-0.02em', color: COLORS.text }}>{title}</div>
          {subtitle && !isMobile && <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      {isMobile ? (
        <button
          onClick={onLogWorkout}
          style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: COLORS.accent, border: 'none',
            color: '#000', fontSize: 24, fontWeight: 400,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
          aria-label="Log workout"
        >
          +
        </button>
      ) : (
        <Button onClick={onLogWorkout}>+ Log Workout</Button>
      )}
    </div>
  )
}
