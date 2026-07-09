import { useState, useEffect, useCallback, useMemo } from 'react'
import { COLORS } from '../../lib/colors'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { Profile } from '../../types'
import {
  fmtTime, fmtPace, fmtPace100m,
  calcRunRows, calcBikeRows, calcSwimRows, calcTriRows,
  metricsDrift,
  type TriRow, type NarrativeCache,
} from './racePredictorMath'

// ─── Types ────────────────────────────────────────────────────────────────────

type SportTab = 'running' | 'cycling' | 'swimming' | 'triathlon'

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
    { label: 'Swim', seconds: row.swimSec, color: COLORS.accent },
    { label: 'T1', seconds: row.t1Sec, color: COLORS.border },
    { label: 'Bike', seconds: row.bikeSec, color: COLORS.purple },
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

  // Each wrapped in its own useMemo (rather than a single derived useMemo covering
  // all four) so the memoized array/null identity is stable across renders where
  // its own inputs haven't changed — otherwise a new [] each render would make
  // generateNarrative's useCallback below think its deps changed every time.
  const runRows = useMemo(() => runPace ? calcRunRows(runPace, ctl) : [], [runPace, ctl])
  const bikeRows = useMemo(() => ftp ? calcBikeRows(ftp, ctl) : [], [ftp, ctl])
  const swimRows = useMemo(() => css ? calcSwimRows(css) : [], [css])
  const triRows = useMemo(
    () => (ftp && css && runPace) ? calcTriRows(ftp, css, runPace, ctl) : null,
    [ftp, css, runPace, ctl]
  )

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

      // Separate try/catch around just the fetch: a network failure (offline/DNS/CORS)
      // is a different problem than the AI service responding with an error, and should
      // read as "check your connection" rather than reusing the AI-specific message below.
      let res: Response
      try {
        res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/race-predictor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({
            ctl, ftp, runPace, css,
            sport: profile.sport,
            predictions: { running: runSummary, cycling: bikeSummary, swimming: swimSummary, triathlon: triSummary },
          }),
        })
      } catch {
        throw new Error('Something went wrong. Check your connection and try again.')
      }

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
        color={COLORS.purple}
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
        color={COLORS.accent}
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
              <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace" }}>
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
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
