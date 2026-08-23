import { COLORS } from '../../lib/colors'
import { RADIUS } from '../../lib/designTokens'

export function StatCard({ label, value, unit, sub, color }: {
  label: string
  value: string | number
  unit?: string
  sub: string
  color: string
  dimSub?: boolean
}) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: RADIUS.card,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.85 }} />
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>
        {sub}
      </div>
    </div>
  )
}
