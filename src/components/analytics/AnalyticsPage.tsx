import type { ReactNode } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { COLORS } from '../../lib/colors'
import type { Workout, WorkoutType } from '../../types'
import { workoutTypes } from '../ui/Badge'

interface AnalyticsPageProps {
  workouts: Workout[]
  fitnessHistory: Array<{ week: string; fitness: number; fatigue: number; form: number }>
  weeklyHistory: Array<{ week: string; tss: number; planned: number }>
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
        <div style={{ color: COLORS.muted, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
        ))}
      </div>
    )
  }
  return null
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function AnalyticsPage({ workouts, fitnessHistory, weeklyHistory }: AnalyticsPageProps) {
  // Sport breakdown
  const sportTotals = workouts.reduce<Record<string, { count: number; tss: number; minutes: number }>>((acc, w) => {
    if (!acc[w.type]) acc[w.type] = { count: 0, tss: 0, minutes: 0 }
    acc[w.type].count++
    acc[w.type].tss += w.tss || 0
    acc[w.type].minutes += w.duration_minutes || 0
    return acc
  }, {})

  const totalTss = Object.values(sportTotals).reduce((s, v) => s + v.tss, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sport breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {(Object.keys(workoutTypes) as Array<keyof typeof workoutTypes>).map(type => {
          const wt = workoutTypes[type]
          const data = sportTotals[type] || { count: 0, tss: 0, minutes: 0 }
          const h = Math.floor(data.minutes / 60)
          const m = data.minutes % 60
          return (
            <div key={type} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: wt.color, opacity: 0.7 }} />
              <div style={{ fontSize: 22, marginBottom: 6 }}>{wt.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{wt.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: wt.color, fontFamily: 'monospace' }}>{data.count}</div>
              <div style={{ fontSize: 10, color: COLORS.muted }}>workouts</div>
              <div style={{ marginTop: 8, fontSize: 12, color: COLORS.text, fontWeight: 600 }}>
                {h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : '—'}
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted }}>total time</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Fitness / fatigue / form */}
        <ChartCard title="Fitness · Fatigue · Form (8 weeks)">
          {fitnessHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={fitnessHistory}>
                <defs>
                  <linearGradient id="fitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="fitness" stroke={COLORS.accent} strokeWidth={2} fill="url(#fitGrad)" name="Fitness" dot={false} />
                <Area type="monotone" dataKey="fatigue" stroke={COLORS.orange} strokeWidth={2} fill="none" name="Fatigue" dot={false} />
                <Area type="monotone" dataKey="form" stroke={COLORS.green} strokeWidth={2} fill="none" name="Form" dot={false} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 13 }}>
              Log workouts to see trends
            </div>
          )}
        </ChartCard>

        {/* Weekly TSS history */}
        <ChartCard title="Weekly TSS (8 weeks)">
          {weeklyHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyHistory} barGap={4}>
                <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="planned" fill={COLORS.subtle} radius={[4, 4, 0, 0]} name="Planned" />
                <Bar dataKey="tss" fill={COLORS.accent} radius={[4, 4, 0, 0]} name="Actual TSS" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 13 }}>
              Log workouts to see trends
            </div>
          )}
        </ChartCard>
      </div>

      {/* TSS breakdown by sport */}
      {totalTss > 0 && (
        <ChartCard title="TSS Distribution by Sport">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(Object.keys(sportTotals) as WorkoutType[]).map(type => {
              const wt = workoutTypes[type as keyof typeof workoutTypes]
              const pct = Math.round((sportTotals[type].tss / totalTss) * 100)
              return (
                <div key={type} style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: wt.color, fontWeight: 600 }}>{wt.icon} {wt.label}</span>
                    <span style={{ fontSize: 11, color: COLORS.muted }}>{pct}%</span>
                  </div>
                  <div style={{ background: COLORS.subtle, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: wt.color, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>{sportTotals[type].tss} TSS</div>
                </div>
              )
            })}
          </div>
        </ChartCard>
      )}
    </div>
  )
}

