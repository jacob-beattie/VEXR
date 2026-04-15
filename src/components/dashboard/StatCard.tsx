import { COLORS } from '../../lib/colors'

interface StatCardProps {
  label: string
  value: number | string
  unit?: string
  delta?: string
  color: string
  hint?: string
}

export function StatCard({ label, value, unit, delta, color, hint }: StatCardProps) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '20px 24px',
      flex: 1,
      minWidth: 140,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: color,
        opacity: 0.8,
      }} />
      <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: COLORS.text, fontFamily: "'DM Mono', monospace" }}>{value}</span>
        {unit && <span style={{ color: COLORS.muted, fontSize: 13 }}>{unit}</span>}
      </div>
      {delta && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color }}>
          {delta} this week
        </div>
      )}
      {hint && (
        <div style={{ marginTop: 5, fontSize: 10, color: COLORS.muted, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  )
}
