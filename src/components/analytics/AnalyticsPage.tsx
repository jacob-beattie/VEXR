import type { ReactNode } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line, ReferenceLine,
  PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { COLORS, SPORT_COLORS, PMC_COLORS, HR_ZONE_RAMP } from '../../lib/colors'
import { RADIUS } from '../../lib/designTokens'
import { calcHRZoneBoundaries } from '../../lib/zones'
import type { Workout, WorkoutType, Profile } from '../../types'
import { workoutTypes } from '../ui/Badge'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  parsePaceToSecs,
  getVolumeHistory,
  getZoneDistribution,
  getMonotony,
  getYTDStats,
  getBestPerformances,
  getPowerCurve,
  getPaceCurve,
  getHRZones,
} from '../../lib/analyticsDerivations'

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_OPTIONS: Array<{ label: string; weeks: number | null }> = [
  { label: '4W',  weeks: 4  },
  { label: '12W', weeks: 12 },
  { label: '6M',  weeks: 26 },
  { label: 'All', weeks: null },
]

const ZONE_COLORS: Record<string, string> = {
  'Zone 1': HR_ZONE_RAMP[0],
  'Zone 2': HR_ZONE_RAMP[1],
  'Zone 3': HR_ZONE_RAMP[2],
  'Zone 4': HR_ZONE_RAMP[3],
  'Zone 5': HR_ZONE_RAMP[4],
  'Zone 6': HR_ZONE_RAMP[4],
}

// Default boundaries using 220-35 and correct zone percentages
const DEFAULT_MAX_HR = 185
const DEFAULT_HR_BOUNDARIES = calcHRZoneBoundaries(DEFAULT_MAX_HR)

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '20px 24px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function EmptyChart({ height = 200, message }: { height?: number; message?: string }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 13, textAlign: 'center', padding: '0 16px' }}>
      {message ?? 'Log workouts to see trends'}
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

function PowerTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { pctFtp: number | null } }>; label?: string }) {
  if (!active || !payload?.length) return null
  const watts = payload[0]?.value
  const pctFtp = payload[0]?.payload?.pctFtp
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ color: COLORS.purple, fontWeight: 600 }}>
        {watts}w{pctFtp !== null ? ` — ${pctFtp}% FTP` : ''}
      </div>
    </div>
  )
}

function PaceTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { paceStr: string } }>; label?: string }) {
  if (!active || !payload?.length) return null
  const paceStr = payload[0]?.payload?.paceStr
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ color: SPORT_COLORS.run, fontWeight: 600 }}>{paceStr}</div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AnalyticsPageProps {
  workouts: Workout[]
  fitnessHistory: Array<{ week: string; fitness: number; fatigue: number; form: number }>
  weeklyHistory: Array<{ week: string; tss: number; planned: number }>
  weeks: number | null
  effectiveWeeks: number
  onWeeksChange: (w: number | null) => void
  onOpenProfile?: () => void
  profile?: Profile | null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AnalyticsPage({ workouts, fitnessHistory, weeklyHistory, weeks, effectiveWeeks, onWeeksChange, profile }: AnalyticsPageProps) {
  const isMobile = useIsMobile()

  const rangeStart = new Date()
  rangeStart.setHours(0, 0, 0, 0)
  rangeStart.setDate(rangeStart.getDate() - effectiveWeeks * 7)

  const volumeHistory = getVolumeHistory(workouts, effectiveWeeks)
  const monotony = getMonotony(workouts, effectiveWeeks)
  const ytd = getYTDStats(workouts)
  const best = getBestPerformances(workouts, rangeStart)

  const tickInterval = (len: number) =>
    isMobile ? Math.max(1, Math.floor(len / 3)) : (len > 12 ? Math.floor(len / 6) : 0)

  const zoneDist = getZoneDistribution(workouts, rangeStart)
  const hasZoneData = zoneDist.some(z => z.zone !== 'Unspecified')

  const sportTotals = workouts.filter(w => {
    if (w.planned) return false
    const d = new Date(w.date + 'T00:00:00')
    return d >= rangeStart
  }).reduce<Record<string, { count: number; tss: number; minutes: number }>>((acc, w) => {
    if (!acc[w.type]) acc[w.type] = { count: 0, tss: 0, minutes: 0 }
    acc[w.type].count++
    acc[w.type].tss += w.tss || 0
    acc[w.type].minutes += w.duration_minutes || 0
    return acc
  }, {})

  const totalTss = Object.values(sportTotals).reduce((s, v) => s + v.tss, 0)

  const monotonyColor = monotony === null ? COLORS.muted
    : monotony < 1.5 ? COLORS.green
    : monotony < 2.0 ? COLORS.conflictAmber
    : COLORS.danger
  const monotonyLabel = monotony === null ? '—'
    : monotony < 1.5 ? 'Good variety'
    : monotony < 2.0 ? 'Moderate risk'
    : 'High risk'

  // New section data
  const ftp = profile?.ftp ?? 0
  const runPace = profile?.run_pace ?? ''
  const powerCurveData = getPowerCurve(workouts, rangeStart, ftp)
  const paceCurveData = getPaceCurve(workouts, rangeStart)
  const hasCustomHrZones = !!(profile?.max_hr)
  const activeBoundaries = profile?.max_hr ? calcHRZoneBoundaries(profile.max_hr) : DEFAULT_HR_BOUNDARIES
  const { total: hrTotal, zones: hrZones } = getHRZones(workouts, rangeStart, activeBoundaries)

  const thresholdSpeedKmh = (() => {
    const secs = parsePaceToSecs(runPace)
    if (!secs || secs <= 0) return null
    return parseFloat((3600 / secs).toFixed(2))
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* YTD Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: `${new Date().getFullYear()} Workouts`, value: String(ytd.count) },
          { label: `${new Date().getFullYear()} Hours`, value: String(ytd.hours) },
          { label: `${new Date().getFullYear()} Distance`, value: `${ytd.distanceKm} km` },
          { label: `${new Date().getFullYear()} TSS`, value: String(ytd.tss) },
        ].map(s => (
          <div key={s.label} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
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
                  <stop offset="5%" stopColor={PMC_COLORS.ctl} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PMC_COLORS.ctl} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fill: COLORS.muted, fontSize: isMobile ? 10 : 11 }} axisLine={false} tickLine={false} interval={tickInterval(fitnessHistory.length)} />
              <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="fitness" stroke={PMC_COLORS.ctl}  strokeWidth={2} fill="url(#fitGrad)" name="Fitness (CTL)" dot={false} />
              <Area type="monotone" dataKey="fatigue" stroke={PMC_COLORS.atl}  strokeWidth={2} fill="none"           name="Fatigue (ATL)" dot={false} />
              <Area type="monotone" dataKey="form"    stroke={PMC_COLORS.tsb}  strokeWidth={2} fill="none"           name="Form (TSB)"    dot={false} strokeDasharray="4 2" />
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
                <Bar dataKey="run"      stackId="vol" fill={SPORT_COLORS.run}      radius={[0, 0, 0, 0]} name="Run" />
                <Bar dataKey="ride"     stackId="vol" fill={SPORT_COLORS.ride}     radius={[0, 0, 0, 0]} name="Ride" />
                <Bar dataKey="swim"     stackId="vol" fill={SPORT_COLORS.swim}     radius={[0, 0, 0, 0]} name="Swim" />
                <Bar dataKey="strength" stackId="vol" fill={SPORT_COLORS.strength} radius={[3, 3, 0, 0]} name="Strength" />
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
            <EmptyChart height={160} message="Set a Session Focus when logging workouts to see zone distribution" />
          )}
        </ChartCard>
      </div>

      {/* Monotony score */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '20px 24px' }}>
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
                { range: '1.5 – 2.0', label: 'Moderate risk', color: COLORS.conflictAmber },
                { range: '> 2.0', label: 'High risk', color: COLORS.danger },
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
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: '20px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Best Performances — {RANGE_OPTIONS.find(o => o.weeks === weeks)?.label ?? `${weeks}W`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            {
              label: 'Longest Run',
              value: best.longestRun ? `${(best.longestRun.distance_meters! / 1000).toFixed(1)} km` : '—',
              sub: best.longestRun?.title ?? '',
            },
            {
              label: 'Longest Ride',
              value: best.longestRide ? `${(best.longestRide.distance_meters! / 1000).toFixed(1)} km` : '—',
              sub: best.longestRide?.title ?? '',
            },
            {
              label: 'Highest TSS',
              value: best.highestTSS ? String(best.highestTSS.tss) : '—',
              sub: best.highestTSS?.title ?? '',
            },
            {
              label: 'Best TSS Week',
              value: best.bestWeekTSS > 0 ? String(best.bestWeekTSS) : '—',
              sub: 'all time',
            },
          ].map(s => (
            <div key={s.label} style={{ background: COLORS.surface, borderRadius: 8, padding: '14px 16px', border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, fontFamily: 'DM Mono, monospace', marginBottom: 4 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {Object.keys(best.sportCounts).length > 0 && (
          <>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Workouts by sport
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

      {/* Power Curve + Pace Curve */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>

        {/* Power Curve */}
        <ChartCard title="Power Curve">
          {powerCurveData.length >= 2 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={powerCurveData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.muted, fontSize: 10 }} axisLine={false} tickLine={false} unit="w" domain={['auto', 'auto']} />
                  <Tooltip content={<PowerTooltip />} />
                  {ftp > 0 && (
                    <ReferenceLine
                      y={ftp}
                      stroke={COLORS.muted}
                      strokeDasharray="4 3"
                      label={{ value: `FTP ${ftp}w`, position: 'insideTopRight', fill: COLORS.muted, fontSize: 10 }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="watts"
                    stroke={COLORS.purple}
                    strokeWidth={2}
                    dot={{ r: 4, fill: COLORS.purple, stroke: COLORS.bg, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: COLORS.purple }}
                    name="Power"
                  />
                </LineChart>
              </ResponsiveContainer>
              {ftp > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {powerCurveData.map(d => (
                    <div key={d.label} style={{ fontSize: 10, color: COLORS.muted, background: COLORS.surface, borderRadius: 4, padding: '3px 8px', border: `1px solid ${COLORS.border}` }}>
                      <span style={{ color: COLORS.text, fontWeight: 600 }}>{d.label}</span>
                      {' '}
                      <span style={{ color: COLORS.purple, fontFamily: 'DM Mono, monospace' }}>{d.watts}w</span>
                      {d.pctFtp !== null && <span style={{ color: COLORS.muted }}> — {d.pctFtp}%</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyChart message="Log more rides with power data to see your power curve" />
          )}
        </ChartCard>

        {/* Pace Curve */}
        <ChartCard title="Pace Curve">
          {paceCurveData.length >= 1 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={paceCurveData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={false} axisLine={false} tickLine={false} domain={[0, 'auto']} hide />
                  <Tooltip content={<PaceTooltip />} />
                  {thresholdSpeedKmh !== null && (
                    <ReferenceLine
                      y={thresholdSpeedKmh}
                      stroke={COLORS.muted}
                      strokeDasharray="4 3"
                      label={{ value: `Threshold ${runPace}/km`, position: 'insideTopRight', fill: COLORS.muted, fontSize: 10 }}
                    />
                  )}
                  <Bar dataKey="speedKmh" fill={SPORT_COLORS.run} radius={[4, 4, 0, 0]} name="Speed">
                    <LabelList
                      dataKey="paceStr"
                      position="top"
                      style={{ fill: SPORT_COLORS.run, fontSize: 10, fontWeight: 600, fontFamily: 'DM Mono, monospace' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 6, textAlign: 'center' }}>
                Best pace per distance band · faster = taller bar
              </div>
            </>
          ) : (
            <EmptyChart message="Log more runs to see your pace curve" />
          )}
        </ChartCard>
      </div>

      {/* Heart Rate Zones — full width */}
      <ChartCard title="Heart Rate Zones">
        {hrTotal > 0 ? (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: isMobile ? 'stretch' : 'center' }}>

            {/* Donut — Z5 first so it renders clockwise from top with highest zone prominent */}
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <PieChart width={148} height={148}>
                <Pie
                  data={[...hrZones].reverse().filter(z => z.pct > 0)}
                  cx={69}
                  cy={69}
                  innerRadius={46}
                  outerRadius={68}
                  dataKey="pct"
                  strokeWidth={0}
                  startAngle={90}
                  endAngle={-270}
                >
                  {[...hrZones].reverse().filter(z => z.pct > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </div>

            {/* Legend + stacked bar */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {[...hrZones].reverse().map(z => {
                  const h = Math.floor(z.minutes / 60)
                  const m = z.minutes % 60
                  return (
                    <div key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: z.color, fontWeight: 600, width: 50 }}>{z.zone}</span>
                      <div style={{ flex: 1, background: COLORS.subtle, borderRadius: 3, height: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${z.pct}%`, height: '100%', background: z.color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                      </div>
                      <span style={{ fontSize: 11, color: z.pct > 0 ? COLORS.text : COLORS.muted, fontFamily: 'DM Mono, monospace', width: 32, textAlign: 'right' }}>
                        {z.pct}%
                      </span>
                      <span style={{ fontSize: 11, color: COLORS.muted, width: 50, textAlign: 'right' }}>
                        {z.minutes > 0 ? (h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Stacked horizontal bar — Z1 on left (base), Z5 on right (top) */}
              <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden' }}>
                {hrZones.filter(z => z.pct > 0).map(z => (
                  <div
                    key={z.zone}
                    style={{ width: `${z.pct}%`, background: z.color, transition: 'width 0.4s ease' }}
                    title={`${z.zone}: ${z.pct}%`}
                  />
                ))}
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 6 }}>
                {hasCustomHrZones
                  ? `Based on your HR zones set in Profile Settings`
                  : `Using estimated max HR of ${DEFAULT_MAX_HR} bpm — set your actual max HR in Profile Settings`}
              </div>
            </div>
          </div>
        ) : (
          <EmptyChart message="Connect Strava to see heart rate zone distribution" />
        )}
      </ChartCard>

    </div>
  )
}
