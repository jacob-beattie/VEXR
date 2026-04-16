import type { ReactNode } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { COLORS } from '../../lib/colors'
import type { Workout, WorkoutType } from '../../types'
import { workoutTypes } from '../ui/Badge'
import { useIsMobile } from '../../hooks/useIsMobile'

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: '4W',  weeks: 4  },
  { label: '8W',  weeks: 8  },
  { label: '12W', weeks: 12 },
  { label: '6M',  weeks: 26 },
]

const ZONE_COLORS: Record<string, string> = {
  'Zone 1': '#4a9eff',
  'Zone 2': COLORS.accent,
  'Zone 3': COLORS.green,
  'Zone 4': COLORS.orange,
  'Zone 5': '#ff4757',
  'Zone 6': '#ff2d55',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function parseZone(zone: string | null | undefined): string {
  if (!zone) return 'Unspecified'
  const match = zone.match(/(\d+)/)
  if (match) return `Zone ${match[1]}`
  const lower = zone.toLowerCase()
  if (lower.includes('recov')) return 'Zone 1'
  if (lower.includes('thresh')) return 'Zone 4'
  if (lower.includes('tempo')) return 'Zone 3'
  if (lower.includes('aerob')) return 'Zone 2'
  if (lower.includes('vo2') || lower.includes('v02')) return 'Zone 5'
  return zone
}

function getVolumeHistory(workouts: Workout[], weeks: number) {
  const now = new Date()
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(now)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(now.getDate() + diff - (weeks - 1 - i) * 7)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const ww = workouts.filter(w => {
      const d = new Date(w.date + 'T00:00:00')
      return d >= weekStart && d <= weekEnd && !w.planned
    })

    return {
      week: formatDateLabel(weekStart),
      run:      +(ww.filter(w => w.type === 'run').reduce((s, w)      => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
      ride:     +(ww.filter(w => w.type === 'ride').reduce((s, w)     => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
      swim:     +(ww.filter(w => w.type === 'swim').reduce((s, w)     => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
      strength: +(ww.filter(w => w.type === 'strength').reduce((s, w) => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
    }
  })
}

function getZoneDistribution(workouts: Workout[]) {
  const completed = workouts.filter(w => !w.planned && w.duration_minutes > 0)
  const totals: Record<string, number> = {}
  for (const w of completed) {
    const z = parseZone(w.zone)
    totals[z] = (totals[z] || 0) + (w.duration_minutes || 0)
  }
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  return Object.entries(totals)
    .map(([zone, minutes]) => ({ zone, minutes, pct: total > 0 ? Math.round((minutes / total) * 100) : 0 }))
    .sort((a, b) => {
      const numA = parseInt(a.zone.replace(/\D/g, '')) || 99
      const numB = parseInt(b.zone.replace(/\D/g, '')) || 99
      return numA - numB
    })
}

// Monotony = avg daily TSS / stddev of daily TSS over the range
function getMonotony(workouts: Workout[], weeks: number): number | null {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setDate(now.getDate() - weeks * 7)
  start.setHours(0, 0, 0, 0)

  const tssByDay: Record<string, number> = {}
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    tssByDay[localDateKey(d)] = 0
  }
  workouts.filter(w => !w.planned).forEach(w => {
    const key = w.date.split('T')[0]
    if (key in tssByDay) tssByDay[key] += w.tss || 0
  })

  const values = Object.values(tssByDay)
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  if (avg === 0) return null
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  if (stddev === 0) return null
  return Math.round((avg / stddev) * 100) / 100
}

function getYTDStats(workouts: Workout[]) {
  const year = new Date().getFullYear()
  const completed = workouts.filter(w => {
    if (w.planned) return false
    const d = new Date(w.date + 'T00:00:00')
    return d.getFullYear() === year
  })
  return {
    count: completed.length,
    hours: +(completed.reduce((s, w) => s + (w.duration_minutes || 0), 0) / 60).toFixed(1),
    distanceKm: +(completed.reduce((s, w) => s + (w.distance_meters || 0), 0) / 1000).toFixed(0),
    tss: completed.reduce((s, w) => s + (w.tss || 0), 0),
  }
}

function getBestPerformances(workouts: Workout[]) {
  const year = new Date().getFullYear()
  const completed = workouts.filter(w => !w.planned)
  const ytd = completed.filter(w => new Date(w.date + 'T00:00:00').getFullYear() === year)

  const longestRun = completed
    .filter(w => w.type === 'run' && w.distance_meters)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0] ?? null

  const longestRide = completed
    .filter(w => w.type === 'ride' && w.distance_meters)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0] ?? null

  const highestTSS = completed
    .filter(w => w.tss > 0)
    .sort((a, b) => b.tss - a.tss)[0] ?? null

  // Best TSS week (all time)
  const tssByWeek: Record<string, number> = {}
  completed.forEach(w => {
    const d = new Date(w.date + 'T00:00:00')
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const mon = new Date(d)
    mon.setDate(d.getDate() + diff)
    const key = localDateKey(mon)
    tssByWeek[key] = (tssByWeek[key] || 0) + (w.tss || 0)
  })
  const bestWeekTSS = Object.values(tssByWeek).length > 0
    ? Math.max(...Object.values(tssByWeek))
    : 0

  // YTD sport counts
  const sportCounts = ytd.reduce<Record<string, number>>((acc, w) => {
    acc[w.type] = (acc[w.type] || 0) + 1
    return acc
  }, {})

  return { longestRun, longestRide, highestTSS, bestWeekTSS, sportCounts }
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

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

function EmptyChart({ height = 200 }: { height?: number }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 13 }}>
      Log workouts to see trends
    </div>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AnalyticsPageProps {
  workouts: Workout[]
  fitnessHistory: Array<{ week: string; fitness: number; fatigue: number; form: number }>
  weeklyHistory: Array<{ week: string; tss: number; planned: number }>
  weeks: number
  onWeeksChange: (w: number) => void
  onOpenProfile?: () => void
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AnalyticsPage({ workouts, fitnessHistory, weeklyHistory, weeks, onWeeksChange, onOpenProfile }: AnalyticsPageProps) {
  const isMobile = useIsMobile()
  const volumeHistory = getVolumeHistory(workouts, weeks)
  const zoneDist = getZoneDistribution(workouts)
  const hasZoneData = zoneDist.some(z => z.zone !== 'Unspecified')
  const monotony = getMonotony(workouts, weeks)
  const ytd = getYTDStats(workouts)
  const best = getBestPerformances(workouts)

  const tickInterval = (len: number) =>
    isMobile ? Math.max(1, Math.floor(len / 3)) : (len > 12 ? Math.floor(len / 6) : 0)

  // Sport breakdown (range-filtered)
  const sportTotals = workouts.filter(w => !w.planned).reduce<Record<string, { count: number; tss: number; minutes: number }>>((acc, w) => {
    if (!acc[w.type]) acc[w.type] = { count: 0, tss: 0, minutes: 0 }
    acc[w.type].count++
    acc[w.type].tss += w.tss || 0
    acc[w.type].minutes += w.duration_minutes || 0
    return acc
  }, {})

  const totalTss = Object.values(sportTotals).reduce((s, v) => s + v.tss, 0)

  // Monotony status
  const monotonyColor = monotony === null ? COLORS.muted
    : monotony < 1.5 ? COLORS.green
    : monotony < 2.0 ? COLORS.orange
    : '#ff4757'
  const monotonyLabel = monotony === null ? '—'
    : monotony < 1.5 ? 'Good variety'
    : monotony < 2.0 ? 'Moderate risk'
    : 'High risk'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* YTD Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: `${new Date().getFullYear()} Workouts`, value: String(ytd.count), color: COLORS.accent },
          { label: `${new Date().getFullYear()} Hours`, value: String(ytd.hours), color: COLORS.green },
          { label: `${new Date().getFullYear()} Distance`, value: `${ytd.distanceKm} km`, color: COLORS.purple },
          { label: `${new Date().getFullYear()} TSS`, value: String(ytd.tss), color: COLORS.orange },
        ].map(s => (
          <div key={s.label} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Range toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Range</span>
        <div style={{ display: 'flex', gap: 5 }}>
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.weeks}
              onClick={() => onWeeksChange(o.weeks)}
              style={{
                padding: '4px 11px', borderRadius: 6,
                border: `1px solid ${weeks === o.weeks ? COLORS.accent : COLORS.border}`,
                background: weeks === o.weeks ? COLORS.accentDim : 'transparent',
                color: weeks === o.weeks ? COLORS.accent : COLORS.muted,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.05em', transition: 'all 0.12s', fontFamily: 'inherit',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fitness · Fatigue · Form — full width */}
      <ChartCard title="Fitness · Fatigue · Form">
        {fitnessHistory.some(d => d.fitness > 0 || d.fatigue > 0) ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={fitnessHistory}>
              <defs>
                <linearGradient id="fitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} interval={tickInterval(fitnessHistory.length)} />
              <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="fitness" stroke={COLORS.accent}  strokeWidth={2} fill="url(#fitGrad)" name="Fitness (CTL)" dot={false} />
              <Area type="monotone" dataKey="fatigue" stroke={COLORS.orange}  strokeWidth={2} fill="none"           name="Fatigue (ATL)" dot={false} />
              <Area type="monotone" dataKey="form"    stroke={COLORS.green}   strokeWidth={2} fill="none"           name="Form (TSB)"    dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart height={220} />
        )}
      </ChartCard>

      {/* Weekly TSS + Sport breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

        {/* Weekly TSS actual vs planned */}
        <ChartCard title="Weekly TSS — Actual vs Planned">
          {weeklyHistory.some(w => w.tss > 0 || w.planned > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyHistory} barGap={3}>
                <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} interval={tickInterval(weeklyHistory.length)} />
                <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="planned" fill={COLORS.subtle}  radius={[3, 3, 0, 0]} name="Planned" />
                <Bar dataKey="tss"     fill={COLORS.accent}  radius={[3, 3, 0, 0]} name="Actual TSS" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Sport breakdown */}
        <ChartCard title="Training by Sport">
          {Object.keys(sportTotals).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(Object.keys(workoutTypes) as WorkoutType[]).filter(t => sportTotals[t]).map(type => {
                const wt = workoutTypes[type]
                const data = sportTotals[type]
                const pct = totalTss > 0 ? Math.round((data.tss / totalTss) * 100) : 0
                const h = Math.floor(data.minutes / 60)
                const m = data.minutes % 60
                return (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: wt.color, fontWeight: 600 }}>{wt.icon} {wt.label}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COLORS.muted }}>
                        <span>{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", color: COLORS.text }}>{data.tss} TSS</span>
                        <span style={{ color: wt.color, fontWeight: 700 }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ background: COLORS.subtle, borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: wt.color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* Volume trends + Zone distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

        {/* Volume trends (stacked bar, hours) */}
        <ChartCard title="Volume by Sport (hours)">
          {volumeHistory.some(w => w.run + w.ride + w.swim + w.strength > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={volumeHistory} barSize={12}>
                <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} interval={tickInterval(volumeHistory.length)} />
                <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} unit="h" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="run"      stackId="vol" fill={COLORS.green}   radius={[0, 0, 0, 0]} name="Run" />
                <Bar dataKey="ride"     stackId="vol" fill={COLORS.accent}  radius={[0, 0, 0, 0]} name="Ride" />
                <Bar dataKey="swim"     stackId="vol" fill={COLORS.purple}  radius={[0, 0, 0, 0]} name="Swim" />
                <Bar dataKey="strength" stackId="vol" fill={COLORS.orange}  radius={[3, 3, 0, 0]} name="Strength" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Training zone distribution */}
        <ChartCard title="Training Distribution by Zone">
          {hasZoneData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
              {zoneDist.filter(z => z.zone !== 'Unspecified').map(z => {
                const color = ZONE_COLORS[z.zone] ?? COLORS.muted
                const h = Math.floor(z.minutes / 60)
                const m = z.minutes % 60
                return (
                  <div key={z.zone}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color, fontWeight: 600 }}>{z.zone}</span>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COLORS.muted }}>
                        <span>{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>
                        <span style={{ color, fontWeight: 700 }}>{z.pct}%</span>
                      </div>
                    </div>
                    <div style={{ background: COLORS.subtle, borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${z.pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )
              })}
              {zoneDist.find(z => z.zone === 'Unspecified') && (
                <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' }}>
                  {zoneDist.find(z => z.zone === 'Unspecified')!.pct}% of workouts have no zone logged
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.5, maxWidth: 220 }}>
                Set your training zones in Profile Settings to see zone distribution
              </div>
              {onOpenProfile && (
                <button
                  onClick={onOpenProfile}
                  style={{
                    background: COLORS.accentDim, border: `1px solid ${COLORS.accent}`,
                    borderRadius: 8, color: COLORS.accent,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    padding: '7px 16px', fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = COLORS.accent + '30')}
                  onMouseLeave={e => (e.currentTarget.style.background = COLORS.accentDim)}
                >
                  Open Profile Settings
                </button>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Monotony score */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Training Monotony
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 24 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, color: monotonyColor, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
              {monotony !== null ? monotony.toFixed(2) : '—'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: monotonyColor, marginTop: 6 }}>{monotonyLabel}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.6 }}>
              Avg daily TSS ÷ standard deviation of daily TSS over the selected range.
              A lower score means more varied training stimulus.
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 10 : 20, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { range: '< 1.5', label: 'Good variety', color: COLORS.green },
                { range: '1.5 – 2.0', label: 'Moderate risk', color: COLORS.orange },
                { range: '> 2.0', label: 'High risk', color: '#ff4757' },
              ].map(s => (
                <div key={s.range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: COLORS.muted }}><span style={{ color: s.color, fontWeight: 600 }}>{s.range}</span> {s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Best Performances */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Best Performances
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            {
              label: 'Longest Run',
              value: best.longestRun ? `${(best.longestRun.distance_meters! / 1000).toFixed(1)} km` : '—',
              sub: best.longestRun?.title ?? '',
              color: COLORS.green,
            },
            {
              label: 'Longest Ride',
              value: best.longestRide ? `${(best.longestRide.distance_meters! / 1000).toFixed(1)} km` : '—',
              sub: best.longestRide?.title ?? '',
              color: COLORS.accent,
            },
            {
              label: 'Highest TSS',
              value: best.highestTSS ? String(best.highestTSS.tss) : '—',
              sub: best.highestTSS?.title ?? '',
              color: COLORS.orange,
            },
            {
              label: 'Best TSS Week',
              value: best.bestWeekTSS > 0 ? String(best.bestWeekTSS) : '—',
              sub: 'all time',
              color: COLORS.purple,
            },
          ].map(s => (
            <div key={s.label} style={{ background: COLORS.surface, borderRadius: 8, padding: '14px 16px', border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: 'DM Mono, monospace', marginBottom: 4 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* YTD sport counts */}
        {Object.keys(best.sportCounts).length > 0 && (
          <>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              {new Date().getFullYear()} workouts by sport
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(Object.keys(workoutTypes) as WorkoutType[]).filter(t => best.sportCounts[t]).map(type => {
                const wt = workoutTypes[type]
                return (
                  <div key={type} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: wt.color + '12', border: `1px solid ${wt.color}30`,
                    borderRadius: 8, padding: '8px 14px',
                  }}>
                    <span style={{ fontSize: 15 }}>{wt.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: wt.color, fontFamily: 'DM Mono, monospace', lineHeight: 1 }}>
                        {best.sportCounts[type]}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, marginTop: 2 }}>{wt.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
