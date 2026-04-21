import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '../../lib/colors'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { Profile } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type SportTab = 'running' | 'cycling' | 'swimming' | 'triathlon'

interface RunRow { name: string; distanceKm: number; totalSeconds: number; paceSecondsPerKm: number }
interface BikeRow { name: string; distanceKm: number; totalSeconds: number; avgSpeedKmh: number; avgPowerW: number }
interface SwimRow { name: string; distanceM: number; totalSeconds: number; paceSeconds100m: number }
interface TriRow {
  name: string
  swimSec: number; t1Sec: number; bikeSec: number; t2Sec: number; runSec: number
  totalSec: number
}

interface NarrativeCache {
  narrative: string; generatedAt: number
  ctl: number; ftp: number; runPace: string; css: string
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function parsePace(pace: string): number | null {
  const p = pace.trim().split(':')
  if (p.length !== 2) return null
  const m = parseInt(p[0], 10), s = parseInt(p[1], 10)
  if (isNaN(m) || isNaN(s)) return null
  return m * 60 + s
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}

function fmtPace100m(secPer100m: number): string {
  const m = Math.floor(secPer100m / 60)
  const s = Math.round(secPer100m % 60)
  return `${m}:${String(s).padStart(2, '0')}/100m`
}

const HM_KM = 21.0975

function calcRunRows(runPaceStr: string, ctl: number): RunRow[] {
  const baseSecPerKm = parsePace(runPaceStr)
  if (!baseSecPerKm) return []
  // Threshold pace ≈ half marathon race pace (approx 1 hour effort for most athletes)
  const t1Seconds = baseSecPerKm * HM_KM
  // Subtle CTL adjustment — capped at ±5%
  const ctlFactor = 1 - Math.min(0.05, Math.max(-0.05, (ctl - 30) * 0.001))
  const t1Adj = t1Seconds * ctlFactor
  return [
    { name: '5K', distanceKm: 5 },
    { name: '10K', distanceKm: 10 },
    { name: 'Half Marathon', distanceKm: HM_KM },
    { name: 'Marathon', distanceKm: 42.195 },
  ].map(r => {
    const totalSeconds = t1Adj * Math.pow(r.distanceKm / HM_KM, 1.06)
    return { ...r, totalSeconds, paceSecondsPerKm: totalSeconds / r.distanceKm }
  })
}

function bikeSpeedKmh(powerW: number): number {
  return Math.pow(powerW / 0.239, 1 / 3) * 3.6
}

function calcBikeRows(ftp: number, ctl: number): BikeRow[] {
  const adjFtp = ftp * (1 + (ctl - 30) * 0.002)
  return [
    { name: '40K TT', distanceKm: 40, intensityFactor: 1.05 },
    { name: '100K', distanceKm: 100, intensityFactor: 0.82 },
    { name: 'Gran Fondo (160K)', distanceKm: 160, intensityFactor: 0.75 },
  ].map(r => {
    const avgPowerW = Math.round(adjFtp * r.intensityFactor)
    const avgSpeedKmh = bikeSpeedKmh(avgPowerW)
    const totalSeconds = (r.distanceKm / avgSpeedKmh) * 3600
    return { name: r.name, distanceKm: r.distanceKm, totalSeconds, avgSpeedKmh, avgPowerW }
  })
}

function calcSwimRows(cssStr: string): SwimRow[] {
  const base = parsePace(cssStr)
  if (!base) return []
  return [
    { name: '400m', distanceM: 400, intensityFactor: 1.05 },
    { name: '1500m', distanceM: 1500, intensityFactor: 0.97 },
    { name: '1900m (70.3 swim)', distanceM: 1900, intensityFactor: 0.94 },
    { name: '3800m (Ironman swim)', distanceM: 3800, intensityFactor: 0.90 },
  ].map(r => {
    const paceSeconds100m = base / r.intensityFactor
    const totalSeconds = (r.distanceM / 100) * paceSeconds100m
    return { name: r.name, distanceM: r.distanceM, totalSeconds, paceSeconds100m }
  })
}

function calcTriRows(ftp: number, cssStr: string, runPaceStr: string, ctl: number): TriRow[] | null {
  const css = parsePace(cssStr)
  const runBase = parsePace(runPaceStr)
  if (!css || !runBase || !ftp) return null

  const adjFtp = ftp * (1 + (ctl - 30) * 0.002)
  const ctlFactor = 1 - Math.min(0.05, Math.max(-0.05, (ctl - 30) * 0.001))
  const adjRunPace = runBase * ctlFactor

  const swimSec = (distM: number, swimIF: number) => (distM / 100) * (css / swimIF)
  const bikeSec = (distKm: number, bikeIF: number) => {
    const power = adjFtp * bikeIF
    return (distKm / bikeSpeedKmh(power)) * 3600
  }
  const t1HM = adjRunPace * HM_KM
  const runSec = (distKm: number, brickFactor: number) =>
    t1HM * Math.pow(distKm / HM_KM, 1.06) * brickFactor

  const races = [
    {
      name: 'Sprint',
      swimM: 750, swimIF: 1.01, t1: 180,
      bikeKm: 20, bikeIF: 0.95, t2: 120,
      runKm: 5, brickFactor: 1.02,
    },
    {
      name: 'Olympic',
      swimM: 1500, swimIF: 0.97, t1: 180,
      bikeKm: 40, bikeIF: 0.90, t2: 120,
      runKm: 10, brickFactor: 1.03,
    },
    {
      name: 'Ironman 70.3',
      swimM: 1900, swimIF: 0.94, t1: 300,
      bikeKm: 90, bikeIF: 0.77, t2: 180,
      runKm: 21.1, brickFactor: 1.05,
    },
    {
      name: 'Ironman',
      swimM: 3800, swimIF: 0.90, t1: 480,
      bikeKm: 180, bikeIF: 0.67, t2: 300,
      runKm: 42.2, brickFactor: 1.08,
    },
  ]

  return races.map(r => {
    const sw = swimSec(r.swimM, r.swimIF)
    const bk = bikeSec(r.bikeKm, r.bikeIF)
    const rn = runSec(r.runKm, r.brickFactor)
    return {
      name: r.name,
      swimSec: sw, t1Sec: r.t1, bikeSec: bk, t2Sec: r.t2, runSec: rn,
      totalSec: sw + r.t1 + bk + r.t2 + rn,
    }
  })
}

function metricsDrift(cached: NarrativeCache, ctl: number, ftp: number, runPace: string, css: string): boolean {
  const ctlDrift = Math.abs(ctl - cached.ctl) / Math.max(cached.ctl, 1) > 0.05
  const ftpDrift = Math.abs(ftp - cached.ftp) / Math.max(cached.ftp, 1) > 0.05
  const paceDrift = runPace !== cached.runPace
  const cssDrift = css !== cached.css
  return ctlDrift || ftpDrift || paceDrift || cssDrift
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MissingData({ sport, field, isMobile }: { sport: string; field: string; isMobile: boolean }) {
  return (
    <div style={{
      padding: isMobile ? '28px 16px' : '36px 24px',
      textAlign: 'center',
      color: COLORS.muted,
    }}>
      <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>
        {sport === 'run' ? '🏃' : sport === 'bike' ? '🚴' : '🏊'}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        Set your <span style={{ color: COLORS.text, fontWeight: 600 }}>{field}</span> in Profile Settings to see {sport} predictions.
      </div>
    </div>
  )
}

function LowCtlWarning() {
  return (
    <div style={{
      margin: '0 0 12px',
      padding: '8px 14px',
      background: COLORS.orange + '12',
      borderTop: `1px solid ${COLORS.orange}30`,
      borderRight: `1px solid ${COLORS.orange}30`,
      borderBottom: `1px solid ${COLORS.orange}30`,
      borderLeft: `3px solid ${COLORS.orange}`,
      borderRadius: 8,
      fontSize: 12,
      color: COLORS.orange,
    }}>
      Log more workouts for more accurate predictions — predictions improve as CTL builds above 10.
    </div>
  )
}

function PredictionRow({
  label, time, sub, color, isLast,
}: {
  label: string; time: string; sub: string; color: string; isLast: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '11px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${COLORS.border}`,
      borderLeft: `3px solid ${color}40`,
    }}>
      <div style={{ flex: 1, fontSize: 13, color: COLORS.muted }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.text, fontFamily: "'DM Mono', monospace", marginRight: 16 }}>{time}</div>
      <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'DM Mono', monospace", minWidth: 88, textAlign: 'right' }}>{sub}</div>
    </div>
  )
}

function TriSplitBar({ row, isMobile }: { row: TriRow; isMobile: boolean }) {
  const total = row.totalSec
  const pct = (s: number) => `${(s / total * 100).toFixed(1)}%`
  const segments = [
    { label: 'Swim', seconds: row.swimSec, color: COLORS.purple },
    { label: 'T1', seconds: row.t1Sec, color: COLORS.border },
    { label: 'Bike', seconds: row.bikeSec, color: COLORS.accent },
    { label: 'T2', seconds: row.t2Sec, color: COLORS.border },
    { label: 'Run', seconds: row.runSec, color: COLORS.green },
  ]

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
        {segments.map(s => (
          <div key={s.label} style={{ width: pct(s.seconds), background: s.color, flexShrink: 0 }} />
        ))}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', gap: isMobile ? 8 : 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        {segments.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: COLORS.muted }}>{s.label}</span>
            <span style={{ fontSize: 10, color: COLORS.text, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
              {fmtTime(s.seconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RacePredictorProps {
  profile: Profile
  ctl: number
}

export function RacePredictor({ profile, ctl }: RacePredictorProps) {
  const isMobile = useIsMobile()

  // Default tab from profile sport
  const defaultTab: SportTab =
    profile.sport === 'cycling' ? 'cycling'
    : profile.sport === 'running' ? 'running'
    : profile.sport === 'swimming' ? 'swimming'
    : 'triathlon'

  const [activeTab, setActiveTab] = useState<SportTab>(defaultTab)
  const [showTooltip, setShowTooltip] = useState(false)
  const [narrative, setNarrative] = useState<string | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrativeError, setNarrativeError] = useState<string | null>(null)
  const [narrativeStale, setNarrativeStale] = useState(false)

  const ftp = profile.ftp || 0
  const runPace = profile.run_pace || ''
  const css = profile.css || ''
  const lowCtl = ctl < 10

  const runRows = runPace ? calcRunRows(runPace, ctl) : []
  const bikeRows = ftp ? calcBikeRows(ftp, ctl) : []
  const swimRows = css ? calcSwimRows(css) : []
  const triRows = (ftp && css && runPace) ? calcTriRows(ftp, css, runPace, ctl) : null

  // Narrative cache key
  const cacheKey = `vexr_race_predictor_${profile.id}`

  // Load cached narrative on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey)
      if (!raw) return
      const cached: NarrativeCache = JSON.parse(raw)
      setNarrative(cached.narrative)
      const stale = metricsDrift(cached, ctl, ftp, runPace, css)
        || (Date.now() - cached.generatedAt) > 7 * 24 * 60 * 60 * 1000
      setNarrativeStale(stale)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generateNarrative = useCallback(async () => {
    setNarrativeLoading(true)
    setNarrativeError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Build a concise predictions summary for the prompt
      const runSummary = runRows.length
        ? runRows.map(r => `${r.name}: ${fmtTime(r.totalSeconds)} (${fmtPace(r.paceSecondsPerKm)})`).join(', ')
        : 'No run data'
      const bikeSummary = bikeRows.length
        ? bikeRows.map(r => `${r.name}: ${fmtTime(r.totalSeconds)} @ ${r.avgSpeedKmh.toFixed(1)}km/h`).join(', ')
        : 'No bike data'
      const swimSummary = swimRows.length
        ? swimRows.map(r => `${r.name}: ${fmtTime(r.totalSeconds)}`).join(', ')
        : 'No swim data'
      const triSummary = triRows
        ? triRows.map(r => `${r.name}: ${fmtTime(r.totalSec)}`).join(', ')
        : 'No tri data'

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          mode: 'race_predictor',
          ctl, ftp, runPace, css,
          sport: profile.sport,
          predictions: { running: runSummary, cycling: bikeSummary, swimming: swimSummary, triathlon: triSummary },
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate analysis')

      const text = json.narrative as string
      setNarrative(text)
      setNarrativeStale(false)

      // Cache to localStorage
      const cache: NarrativeCache = {
        narrative: text,
        generatedAt: Date.now(),
        ctl, ftp, runPace, css,
      }
      localStorage.setItem(cacheKey, JSON.stringify(cache))
    } catch (err) {
      setNarrativeError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setNarrativeLoading(false)
    }
  }, [ctl, ftp, runPace, css, runRows, bikeRows, swimRows, triRows, profile.sport, cacheKey])

  // ── Render helpers ─────────────────────────────────────────────────────────

  const tab = (id: SportTab, label: string) => {
    const active = activeTab === id
    return (
      <button
        key={id}
        onClick={() => setActiveTab(id)}
        style={{
          padding: isMobile ? '6px 10px' : '6px 16px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.12s',
          background: active ? COLORS.accentDim : 'transparent',
          color: active ? COLORS.accent : COLORS.muted,
          borderTop: `1px solid ${active ? COLORS.accent : COLORS.border}`,
          borderRight: `1px solid ${active ? COLORS.accent : COLORS.border}`,
          borderBottom: `1px solid ${active ? COLORS.accent : COLORS.border}`,
          borderLeft: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        }}
      >
        {label}
      </button>
    )
  }

  const tableWrap = (rows: React.ReactNode) => (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {rows}
    </div>
  )

  // ── Tab content ─────────────────────────────────────────────────────────────

  const renderRunning = () => {
    if (!runPace) return <MissingData sport="run" field="threshold pace" isMobile={isMobile} />
    return tableWrap(runRows.map((r, i) => (
      <PredictionRow
        key={r.name} label={r.name}
        time={fmtTime(r.totalSeconds)}
        sub={fmtPace(r.paceSecondsPerKm)}
        color={COLORS.green}
        isLast={i === runRows.length - 1}
      />
    )))
  }

  const renderCycling = () => {
    if (!ftp) return <MissingData sport="bike" field="FTP" isMobile={isMobile} />
    return tableWrap(bikeRows.map((r, i) => (
      <PredictionRow
        key={r.name} label={r.name}
        time={fmtTime(r.totalSeconds)}
        sub={`${r.avgSpeedKmh.toFixed(1)} km/h · ${r.avgPowerW}w`}
        color={COLORS.accent}
        isLast={i === bikeRows.length - 1}
      />
    )))
  }

  const renderSwimming = () => {
    if (!css) return <MissingData sport="swim" field="CSS" isMobile={isMobile} />
    return tableWrap(swimRows.map((r, i) => (
      <PredictionRow
        key={r.name} label={r.name}
        time={fmtTime(r.totalSeconds)}
        sub={fmtPace100m(r.paceSeconds100m)}
        color={COLORS.purple}
        isLast={i === swimRows.length - 1}
      />
    )))
  }

  const renderTriathlon = () => {
    const missing = []
    if (!ftp) missing.push('FTP (cycling)')
    if (!runPace) missing.push('threshold pace (running)')
    if (!css) missing.push('CSS (swimming)')

    if (missing.length > 0) {
      return (
        <div style={{ padding: isMobile ? '28px 16px' : '36px 24px', textAlign: 'center', color: COLORS.muted }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>🏁</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Set your{' '}
            <span style={{ color: COLORS.text, fontWeight: 600 }}>{missing.join(', ')}</span>
            {' '}in Profile Settings to see triathlon predictions.
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {triRows!.map(row => (
          <div key={row.name} style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{row.name}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.accent, fontFamily: "'DM Mono', monospace" }}>
                {fmtTime(row.totalSec)}
              </div>
            </div>
            <TriSplitBar row={row} isMobile={isMobile} />
          </div>
        ))}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      background: COLORS.card,
      borderTop: `1px solid ${COLORS.border}`,
      borderRight: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      borderLeft: `1px solid ${COLORS.border}`,
      borderRadius: 14,
      padding: isMobile ? '20px 16px' : '24px 28px',
      marginBottom: 20,
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, letterSpacing: '0.01em' }}>
              Race Predictor
            </div>
            {/* Tooltip */}
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: COLORS.subtle, border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted, fontSize: 10, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default', fontFamily: 'inherit', padding: 0,
                }}
              >?</button>
              {showTooltip && (
                <div style={{
                  position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
                  transform: 'translateX(-50%)', background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`, borderRadius: 8,
                  padding: '10px 12px', fontSize: 12, color: COLORS.text,
                  lineHeight: 1.5, width: 260, zIndex: 10,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)', pointerEvents: 'none',
                }}>
                  Predictions are based on your CTL, FTP, threshold pace and CSS. As your fitness improves, predictions update automatically.
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>
            Estimated finish times based on your current fitness
          </div>
        </div>
      </div>

      {/* Sport tabs */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 16,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        {tab('running', '🏃 Running')}
        {tab('cycling', '🚴 Cycling')}
        {tab('swimming', '🏊 Swimming')}
        {tab('triathlon', '🏁 Triathlon')}
      </div>

      {/* Low CTL warning */}
      {lowCtl && <LowCtlWarning />}

      {/* Predictions */}
      {activeTab === 'running' && renderRunning()}
      {activeTab === 'cycling' && renderCycling()}
      {activeTab === 'swimming' && renderSwimming()}
      {activeTab === 'triathlon' && renderTriathlon()}

      {/* AI narrative */}
      <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Coach Analysis
          </div>
          {(narrative || narrativeStale) && (
            <button
              onClick={generateNarrative}
              disabled={narrativeLoading}
              style={{
                background: 'transparent',
                borderTop: `1px solid ${COLORS.border}`,
                borderRight: `1px solid ${COLORS.border}`,
                borderBottom: `1px solid ${COLORS.border}`,
                borderLeft: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                color: narrativeStale ? COLORS.orange : COLORS.muted,
                fontSize: 11, padding: '4px 10px',
                cursor: narrativeLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 600,
                opacity: narrativeLoading ? 0.5 : 1,
              }}
            >
              {narrativeLoading ? '…' : narrativeStale ? '↻ Recalculate' : '↻ Refresh'}
            </button>
          )}
        </div>

        {narrativeLoading && !narrative ? (
          <div>
            {[100, 88, 72].map((w, i) => (
              <div key={i} style={{
                height: 13, borderRadius: 6, background: COLORS.subtle,
                width: `${w}%`, marginBottom: 10,
              }} />
            ))}
          </div>
        ) : narrativeLoading && narrative ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: COLORS.text, opacity: 0.4 }}>
            {narrative}
          </p>
        ) : narrative ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: COLORS.text, opacity: 0.88 }}>
            {narrative}
          </p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
              Get a personalised analysis of your predictions and where to focus training.
            </div>
            <button
              onClick={generateNarrative}
              disabled={narrativeLoading}
              style={{
                background: COLORS.accent + '15',
                borderTop: `1px solid ${COLORS.accent}`,
                borderRight: `1px solid ${COLORS.accent}`,
                borderBottom: `1px solid ${COLORS.accent}`,
                borderLeft: `1px solid ${COLORS.accent}`,
                borderRadius: 8,
                color: COLORS.accent, fontSize: 12, fontWeight: 700,
                padding: '8px 16px', cursor: narrativeLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              ✦ Analyse
            </button>
          </div>
        )}

        {narrativeError && (
          <div style={{ marginTop: 10, fontSize: 12, color: COLORS.orange, padding: '8px 12px', background: COLORS.orange + '10', borderRadius: 6 }}>
            {narrativeError}
          </div>
        )}
      </div>
    </div>
  )
}
