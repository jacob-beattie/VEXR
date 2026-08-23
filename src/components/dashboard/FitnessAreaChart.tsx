import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { COLORS, PMC_COLORS } from '../../lib/colors'
import { RADIUS } from '../../lib/designTokens'

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: COLORS.muted, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

export function FitnessAreaChart({ data }: { data: Array<{ week: string; fitness: number; fatigue: number; form: number }> }) {
  const hasData = data.some(d => d.fitness > 0 || d.fatigue > 0)
  const tickInterval = data.length > 28 ? Math.floor(data.length / 8) : data.length > 14 ? 6 : 0

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '18px 20px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Fitness · Fatigue · Form
        </div>
        <div style={{ display: 'flex', gap: 14, marginLeft: 'auto' }}>
          {[
            { label: 'CTL', color: PMC_COLORS.ctl },
            { label: 'ATL', color: PMC_COLORS.atl },
            { label: 'TSB', color: PMC_COLORS.tsb },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLORS.muted }}>
              <div style={{ width: 20, height: 2, borderRadius: 1, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PMC_COLORS.ctl} stopOpacity={0.25} />
                <stop offset="100%" stopColor={PMC_COLORS.ctl} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="atlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PMC_COLORS.atl} stopOpacity={0.2} />
                <stop offset="100%" stopColor={PMC_COLORS.atl} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval={tickInterval} />
            <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="fitness" stroke={PMC_COLORS.ctl} strokeWidth={2} fill="url(#ctlFill)" dot={false} name="CTL" />
            <Area type="monotone" dataKey="fatigue" stroke={PMC_COLORS.atl} strokeWidth={2} fill="url(#atlFill)" dot={false} name="ATL" />
            <Area type="monotone" dataKey="form" stroke={PMC_COLORS.tsb} strokeWidth={1.5} fill="none" dot={false} name="TSB" strokeDasharray="4 2" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, color: COLORS.muted }}>No workout data yet</div>
          <div style={{ fontSize: 11, color: COLORS.muted, opacity: 0.6 }}>Log workouts with TSS to see your fitness trend</div>
        </div>
      )}
    </div>
  )
}
