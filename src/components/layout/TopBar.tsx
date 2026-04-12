import { COLORS } from '../../lib/colors'
import { Button } from '../ui/Button'

interface TopBarProps {
  title: string
  subtitle?: string
  onLogWorkout: () => void
}

export function TopBar({ title, subtitle, onLogWorkout }: TopBarProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 28,
    }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: COLORS.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <Button onClick={onLogWorkout}>+ Log Workout</Button>
    </div>
  )
}
