import type { ReactNode } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line, ReferenceLine,
  PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { COLORS, SPORT_COLORS } from '../../lib/colors'
import type { Workout, WorkoutType, Profile } from '../../types'
import { workoutTypes } from '../ui/Badge'
import { useIsMobile } from '../../hooks/useIsMobile'

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_OPTIONS: Array<{ label: string; weeks: number | null }> = [
  { label: '4W',  weeks: 4  },
  { label: '12W', weeks: 12 },
  { label: '6M',  weeks: 26 },
  { label: 'All', weeks: null },
]

const ZONE_COLORS: Record<string, string> = {
  'Zone 1': COLORS.accent,
  'Zone 2': COLORS.green,
  'Zone 3': COLORS.amber,
  'Zone 4': COLORS.orange,
  'Zone 5': COLORS.danger,
  'Zone 6': COLORS.danger,
}

// Each band shows best avg_power from rides of AT LEAST this duration.
// This keeps the curve physiologically correct (shorter = higher or equal power).
const POWER_BANDS = [
  { label: '5m',  minMin: 3  },
  { label: '10m', minMin: 8  },
  { label: '20m', minMin: 15 },
  { label: '30m', minMin: 25 },
  { label: '60m', minMin: 45 },
]

const PACE_BANDS = [
  { label: '5K',  minKm: 4,  maxKm: 7  },
  { label: '10K', minKm: 8,  maxKm: 12 },
  { label: '15K', minKm: 13, maxKm: 17 },
  { label: 'HM',  minKm: 19, maxKm: 23 },
  { label: 'Mar', minKm: 40, maxKm: 45 },
]

const HR_ZONE_COLORS = [COLORS.accent, COLORS.green, COLORS.amber, COLORS.orange, COLORS.danger]
const HR_ZONE_LABELS = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5']

// Default boundaries using 220-35 and correct zone percentages
const DEFAULT_MAX_HR = 185
const DEFAULT_HR_BOUNDARIES: Array<{ min: number; max: number | null }> = (() => {
  const z1Max = Math.round(DEFAULT_MAX_HR * 0.65)
  const z2Max = Math.round(DEFAULT_MAX_HR * 0.75)
  const z3Max = Math.round(DEFAULT_MAX_HR * 0.82)
  const z4Max = Math.round(DEFAULT_MAX_HR * 0.89)
  return [
    { min: 0,         max: z1Max },
    { min: z1Max + 1, max: z2Max },
    { min: z2Max + 1, max: z3Max },
    { min: z3Max + 1, max: z4Max },
    { min: z4Max + 1, max: null },
  ]
})()

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
  if (lower === 'endurance' || lower === 'long' || lower.includes('aerob')) return 'Zone 2'
  if (lower.includes('tempo')) return 'Zone 3'
  if (lower.includes('thresh')) return 'Zone 4'
  if (lower === 'intervals' || lower === 'race' || lower.includes('vo2') || lower.includes('v02')) return 'Zone 5'
  return zone
}

function parsePaceToSecs(pace: string | null | undefined): number | null {
  if (!pace) return null
  const parts = pace.split(':')
  if (parts.length !== 2) return null
  const mins = parseInt(parts[0])
  const secs = parseInt(parts[1])
  if (isNaN(mins) || isNaN(secs)) return null
  return mins * 60 + secs
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

function getZoneDistribution(workouts: Workout[], rangeStart: Date) {
  const completed = workouts.filter(w => {
    if (w.planned || !w.duration_minutes) return false
    return new Date(w.date + 'T00:00:00') >= rangeStart
  })
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

function getBestPerformances(workouts: Workout[], rangeStart: Date) {
  const completed = workouts.filter(w => !w.planned && new Date(w.date + 'T00:00:00') >= rangeStart)

  const longestRun = completed
    .filter(w => w.type === 'run' && w.distance_meters)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0] ?? null

  const longestRide = completed
    .filter(w => w.type === 'ride' && w.distance_meters)
    .sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0] ?? null

  const highestTSS = completed
    .filter(w => w.tss > 0)
    .sort((a, b) => b.tss - a.tss)[0] ?? null

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

  const sportCounts = completed.reduce<Record<string, number>>((acc, w) => {
    acc[w.type] = (acc[w.type] || 0) + 1
    return acc
  }, {})

  return { longestRun, longestRide, highestTSS, bestWeekTSS, sportCounts }
}

function getPowerCurve(workouts: Workout[], rangeStart: Date, ftp: number) {
  const rides = workouts.filter(w =>
    !w.planned && w.type === 'ride' && w.avg_power && w.avg_power > 0 &&
    new Date(w.date + 'T00:00:00') >= rangeStart
  )
  if (rides.length === 0) return []

  return POWER_BANDS.map(band => {
    const candidates = rides.filter(w => w.duration_minutes >= band.minMin)
    if (candidates.length === 0) return null
    const watts = Math.max(...candidates.map(w => w.avg_power!))
    const pctFtp = ftp > 0 ? Math.round((watts / ftp) * 100) : null
    return { label: band.label, watts, pctFtp }
  }).filter(Boolean) as Array<{ label: string; watts: number; pctFtp: number | null }>
}

function getPaceCurve(workouts: Workout[], rangeStart: Date) {
  // Accept any run with distance — calculate pace from distance+duration if avg_pace not stored
  const runs = workouts.filter(w =>
    !w.planned && w.type === 'run' &&
    w.distance_meters && w.distance_meters > 0 &&
    w.duration_minutes && w.duration_minutes > 0 &&
    new Date(w.date + 'T00:00:00') >= rangeStart
  )
  if (runs.length === 0) return []

  return PACE_BANDS.map(band => {
    const candidates = runs.filter(w => {
      const km = (w.distance_meters || 0) / 1000
      return km >= band.minKm && km <= band.maxKm
    })
    if (candidates.length === 0) return null
    let bestSecs = Infinity
    for (const w of candidates) {
      // Prefer stored avg_pace; fall back to duration/distance
      let secs = parsePaceToSecs(w.avg_pace)
      if (secs === null) {
        const km = w.distance_meters! / 1000
        secs = (w.duration_minutes * 60) / km
      }
      // Ignore anything slower than 10 min/km — walks/hikes mapped to run type
      if (secs !== null && secs < 600 && secs < bestSecs) bestSecs = secs
    }
    if (bestSecs === Infinity) return null
    const speedKmh = parseFloat((3600 / bestSecs).toFixed(2))
    const paceStr = `${Math.floor(bestSecs / 60)}:${String(Math.round(bestSecs % 60)).padStart(2, '0')}/km`
    return { label: band.label, speedKmh, paceStr }
  }).filter(Boolean) as Array<{ label: string; speedKmh: number; paceStr: string }>
}

function getHRZones(workouts: Workout[], rangeStart: Date, boundaries: Array<{ min: number; max: number | null }>) {
  const relevant = workouts.filter(w => {
    if (w.planned || !w.heart_rate_avg || !w.duration_minutes) return false
    const d = new Date(w.date + 'T00:00:00')
    return d >= rangeStart
  })

  const zoneMinutes = [0, 0, 0, 0, 0]
  for (const w of relevant) {
    const hr = w.heart_rate_avg!
    let idx = boundaries.length - 1
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i]
      if (hr >= b.min && (b.max === null || hr <= b.max)) { idx = i; break }
    }
    if (idx < zoneMinutes.length) zoneMinutes[idx] += w.duration_minutes
  }

  const total = zoneMinutes.reduce((s, v) => s + v, 0)
  return {
    total,
    zones: zoneMinutes.map((mins, i) => ({
      zone: HR_ZONE_LABELS[i],
      minutes: mins,
      pct: total > 0 ? Math.round((mins / total) * 100) : 0,
      color: HR_ZONE_COLORS[i],
    })),
  }
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
      <div style={{ color: COLORS.green, fontWeight: 600 }}>{paceStr}</div>
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

export function AnalyticsPage({ workouts, fitnessHistory, weeklyHistory, weeks, effectiveWeeks, onWeeksChange, onOpenProfile, profile }: AnalyticsPageProps) {
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
    : monotony < 2.0 ? COLORS.orange
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
  const activeBoundaries = (() => {
    const maxHr = profile?.max_hr
    if (!maxHr) return DEFAULT_HR_BOUNDARIES
    const z1Max = Math.round(maxHr * 0.65)
    const z2Max = Math.round(maxHr * 0.75)
    const z3Max = Math.round(maxHr * 0.82)
    const z4Max = Math.round(maxHr * 0.89)
    return [
      { min: 0,         max: z1Max },
      { min: z1Max + 1, max: z2Max },
      { min: z2Max + 1, max: z3Max },
      { min: z3Max + 1, max: z4Max },
      { min: z4Max + 1, max: null  },
    ]
  })()
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
          <div key={s.label} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '16px 20px' }}>
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
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px' }}>
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
                  <Bar dataKey="speedKmh" fill={COLORS.green} radius={[4, 4, 0, 0]} name="Speed">
                    <LabelList
                      dataKey="paceStr"
                      position="top"
                      style={{ fill: COLORS.green, fontSize: 10, fontWeight: 600, fontFamily: 'DM Mono, monospace' }}
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
