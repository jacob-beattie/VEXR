import { useState } from 'react'
import { COLORS } from '../lib/colors'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAICoachData } from '../hooks/useAICoachData'
import { RacePredictor } from '../components/ai/RacePredictor'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/)
  return match ? match[0] : text.slice(0, 120) + '…'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, color, sub,
}: {
  label: string
  value: string | number
  color: string
  sub?: string
}) {
  return (
    <div style={{
      flex: 1,
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '14px 16px',
      textAlign: 'center',
      minWidth: 80,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.85 }} />
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 5, letterSpacing: '0.04em' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function QuickStatCard({
  label, value, color, sub, icon,
}: {
  label: string
  value: string
  color: string
  sub?: string
  icon?: string
}) {
  return (
    <div style={{
      flex: 1,
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
          {value}
        </div>
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AICoach() {
  const isMobile = useIsMobile()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const {
    profile,
    workoutsLoading, workoutsError, refetchWorkouts,
    fitness, ctlChange,
    daysUntilRace, phase,
    compliance, completedThisWeekCount, totalWeekSessions,
    thisWeekTSS, lastWeekTSS,
    loadingBriefings, briefingsError, refetchBriefings, generating, genError, generate,
    current, isCurrentFresh, history,
  } = useAICoachData()

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tsbPositive = fitness.tsb >= 0

  // ── Render ────────────────────────────────────────────────────────────────

  if (workoutsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: COLORS.muted }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {workoutsError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: COLORS.orange + '15', border: `1px solid ${COLORS.orange}40`, borderRadius: 10,
          padding: '10px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, color: COLORS.orange }}>{workoutsError}</span>
          <button
            onClick={() => refetchWorkouts()}
            style={{
              background: 'none', border: `1px solid ${COLORS.orange}60`, borderRadius: 6,
              color: COLORS.orange, fontSize: 12, fontWeight: 700, padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {briefingsError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: COLORS.orange + '15', border: `1px solid ${COLORS.orange}40`, borderRadius: 10,
          padding: '10px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, color: COLORS.orange }}>{briefingsError}</span>
          <button
            onClick={() => refetchBriefings()}
            style={{
              background: 'none', border: `1px solid ${COLORS.orange}60`, borderRadius: 6,
              color: COLORS.orange, fontSize: 12, fontWeight: 700, padding: '4px 10px',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Metrics row ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: isMobile ? 8 : 12,
        marginBottom: 20,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        <MetricCard
          label="CTL · Fitness"
          value={fitness.ctl}
          color={COLORS.purple}
          sub={ctlChange !== 0 ? `${ctlChange > 0 ? '+' : ''}${ctlChange} this week` : 'stable'}
        />
        <MetricCard
          label="ATL · Fatigue"
          value={fitness.atl}
          color={COLORS.orange}
        />
        <MetricCard
          label="TSB · Form"
          value={fitness.tsb > 0 ? `+${fitness.tsb}` : String(fitness.tsb)}
          color={COLORS.green}
          sub={tsbPositive ? 'Fresh' : 'Carrying fatigue'}
        />
        {daysUntilRace !== null && daysUntilRace >= 0 ? (
          <MetricCard
            label="Race Countdown"
            value={daysUntilRace}
            color={COLORS.purple}
            sub={profile?.race_goal ?? undefined}
          />
        ) : (
          <div style={{
            flex: 1,
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: '14px 16px',
            textAlign: 'center',
            minWidth: 80,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.muted, opacity: 0.3 }} />
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Race Countdown
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>No race set</div>
          </div>
        )}
      </div>

      {/* ── Main briefing card ───────────────────────────────────────────────── */}
      <div style={{
        background: COLORS.card,
        borderTop: `1px solid ${COLORS.border}`,
        borderRight: `1px solid ${COLORS.border}`,
        borderBottom: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${COLORS.accent}`,
        borderRadius: 14,
        padding: '24px 28px',
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Gradient glow top border */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${COLORS.accent}, ${COLORS.accent}80, transparent)`,
        }} />

        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
              Weekly Briefing
            </div>
            {current && (
              <div style={{ fontSize: 11, color: COLORS.muted }}>
                Generated {formatAge(current.generated_at)}
                {!isCurrentFresh && ' · briefing is stale'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {current && (
              <button
                onClick={() => generate(true)}
                disabled={generating}
                style={{
                  background: 'transparent',
                  borderTop: `1px solid ${COLORS.border}`,
                  borderRight: `1px solid ${COLORS.border}`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  borderLeft: `1px solid ${COLORS.border}`,
                  borderRadius: 7,
                  color: COLORS.muted,
                  fontSize: 12,
                  padding: '6px 12px',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  opacity: generating ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (!generating) {
                    (e.currentTarget as HTMLButtonElement).style.color = COLORS.text
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.accent
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = COLORS.muted
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.border
                }}
              >
                ↻ Refresh
              </button>
            )}
          </div>
        </div>

        {/* Loading skeleton */}
        {(generating && !current) || loadingBriefings ? (
          <div>
            {[100, 92, 78, 60].map((w, i) => (
              <div key={i} style={{
                height: 14,
                borderRadius: 7,
                background: COLORS.subtle,
                width: `${w}%`,
                marginBottom: 12,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        ) : generating && current ? (
          <div>
            <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.75, color: COLORS.text, opacity: 0.4 }}>
              {current.briefing}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.muted, fontSize: 12 }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
              Generating new briefing…
            </div>
          </div>
        ) : current ? (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: COLORS.text, opacity: 0.92 }}>
            {current.briefing}
          </p>
        ) : (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>✦</div>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: COLORS.muted, lineHeight: 1.6 }}>
              Get a personalised coaching briefing based on your current fitness,
              fatigue, and upcoming workouts.
            </p>
            <button
              onClick={() => generate(false)}
              disabled={generating}
              style={{
                background: COLORS.accent + '15',
                borderTop: `1px solid ${COLORS.accent}`,
                borderRight: `1px solid ${COLORS.accent}`,
                borderBottom: `1px solid ${COLORS.accent}`,
                borderLeft: `1px solid ${COLORS.accent}`,
                borderRadius: 9,
                color: COLORS.accent,
                fontSize: 13,
                fontWeight: 700,
                padding: '10px 22px',
                cursor: generating ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: generating ? 0.7 : 1,
                letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}
            >
              {generating ? 'Generating…' : '✦ Generate Weekly Briefing'}
            </button>
          </div>
        )}

        {/* Error state */}
        {genError && (
          <div style={{ marginTop: 12, fontSize: 12, color: COLORS.orange, padding: '8px 12px', background: COLORS.orange + '10', borderRadius: 6 }}>
            {genError}
          </div>
        )}
      </div>

      {/* ── Race Predictor ──────────────────────────────────────────────────── */}
      {profile && <RacePredictor profile={profile} ctl={fitness.ctl} />}

      {/* ── Quick stats ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 10 : 12,
        marginBottom: 20,
      }}>
        <QuickStatCard
          label="Training Phase"
          value={phase.label}
          color={phase.color}
          sub={phase.description}
        />
        <QuickStatCard
          label="Weekly Compliance"
          value={compliance !== null ? `${compliance}%` : '—'}
          color={
            compliance === null ? COLORS.muted
            : compliance >= 80 ? COLORS.green
            : compliance >= 50 ? COLORS.orange
            : COLORS.danger
          }
          sub={
            totalWeekSessions > 0
              ? `${completedThisWeekCount} of ${totalWeekSessions} sessions`
              : 'No sessions this week'
          }
        />
        <QuickStatCard
          label="TSS This Week"
          value={String(thisWeekTSS)}
          color={COLORS.text}
          sub={
            lastWeekTSS > 0
              ? `${thisWeekTSS >= lastWeekTSS ? '+' : ''}${thisWeekTSS - lastWeekTSS} vs last week`
              : 'vs last week: —'
          }
          icon={
            lastWeekTSS > 0 && thisWeekTSS !== lastWeekTSS
              ? thisWeekTSS > lastWeekTSS ? '↑' : '↓'
              : undefined
          }
        />
        <QuickStatCard
          label="CTL Trend"
          value={`${ctlChange >= 0 ? '+' : ''}${ctlChange}`}
          color={ctlChange > 0 ? COLORS.green : ctlChange < 0 ? COLORS.orange : COLORS.muted}
          sub="fitness change this week"
          icon={ctlChange > 0 ? '↑' : ctlChange < 0 ? '↓' : undefined}
        />
      </div>

      {/* ── Briefing history ─────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div style={{
          background: COLORS.card,
          borderTop: `1px solid ${COLORS.border}`,
          borderRight: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
          borderLeft: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Previous Briefings
            </div>
          </div>

          {history.map((b, idx) => {
            const expanded = expandedIds.has(b.id)
            const isLast = idx === history.length - 1
            return (
              <div
                key={b.id}
                style={{
                  borderBottom: isLast ? 'none' : `1px solid ${COLORS.border}`,
                }}
              >
                <button
                  onClick={() => toggleExpand(b.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '14px 24px',
                    background: expanded ? COLORS.surface : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    if (!expanded) (e.currentTarget as HTMLButtonElement).style.background = COLORS.card
                  }}
                  onMouseLeave={e => {
                    if (!expanded) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: COLORS.accent, fontWeight: 600, marginBottom: 4, letterSpacing: '0.04em' }}>
                      {formatHistoryDate(b.generated_at)}
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: COLORS.muted,
                      fontStyle: 'italic',
                      whiteSpace: expanded ? 'normal' : 'nowrap',
                      overflow: expanded ? 'visible' : 'hidden',
                      textOverflow: expanded ? 'unset' : 'ellipsis',
                    }}>
                      {expanded ? b.briefing : firstSentence(b.briefing)}
                    </div>
                  </div>
                  <span style={{ color: COLORS.muted, fontSize: 14, flexShrink: 0, marginTop: 16, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
                    ∨
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 20 }} />
    </div>
  )
}
