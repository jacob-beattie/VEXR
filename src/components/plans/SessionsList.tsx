import { useState } from 'react'
import { COLORS, SPORT_COLORS } from '../../lib/colors'
import { SPORT_LABELS } from './shared'
import type { SessionSport } from '../../types'

// Shared by ImportReviewScreen (plan import/generate review step) and PlanCard's session list
// (viewing an existing plan's sessions) — both render the same sport-filter-tab-row +
// week-grouped, collapsible session-row pattern, previously reimplemented independently in each
// file. `variant` captures the two call sites' real visual differences (density, whether a
// conflict column exists) rather than forcing them to look identical.

export interface SessionListItem {
  id: string | number
  week: number
  sport: SessionSport
  title: string
  dateLabel: string | null
  durationLabel: string
  targetMetric: string | null
  detail: string | null
  conflict?: boolean
}

export interface SessionsListSportTab {
  key: SessionSport | 'all'
  label: string
}

interface SessionsListProps {
  sessions: SessionListItem[]
  isMobile: boolean
  variant: 'review' | 'compact'
  sportTabs: SessionsListSportTab[]
  showSportTabs: boolean
  sportFilter: string
  onSportFilterChange: (f: string) => void
  openWeeks: Record<number, boolean>
  onToggleWeek: (w: number) => void
  defaultWeekOpen: boolean
}

// Per-variant sizing — the two source files agreed on structure but not on density; these are
// the literal values each one used before the merge, kept exact to avoid a visual regression.
const VARIANT_STYLE = {
  review: {
    desktopGrid: '24px 90px 1fr 90px 70px 110px 80px',
    mobileGrid: '90px 1fr 70px',
    showConflictColumn: true,
    tabPadding: '7px 14px',
    tabFontSize: 12,
    tabGap: 6,
    tabBorderRadius: 8,
    tabActiveBg: COLORS.accentDim,
    weekHeaderPadding: '10px 16px',
    weekHeaderBorderRadius: 8,
    rowPadding: { desktop: '11px 16px', mobile: '10px 12px' },
    rowBorderRadius: 8,
    dotSize: 8,
    sportLabelFontSize: 10,
    titleFontSize: 13,
    caretFontSize: 9,
    metaFontSize: 11,
    detailPadding: '12px 16px 14px',
    detailFontSize: 13,
  },
  compact: {
    desktopGrid: '82px 1fr 95px 55px 110px',
    mobileGrid: '82px 1fr 55px',
    showConflictColumn: false,
    tabPadding: '4px 10px',
    tabFontSize: 11,
    tabGap: 5,
    tabBorderRadius: 7,
    tabActiveBg: `${COLORS.accent}15`,
    weekHeaderPadding: '8px 10px',
    weekHeaderBorderRadius: 7,
    rowPadding: { desktop: '8px 10px', mobile: '7px 10px' },
    rowBorderRadius: 6,
    dotSize: 7,
    sportLabelFontSize: 10,
    titleFontSize: 12,
    caretFontSize: 8,
    metaFontSize: 10,
    detailPadding: '10px 12px 12px',
    detailFontSize: 12,
  },
} as const

export function SessionsList({
  sessions,
  isMobile,
  variant,
  sportTabs,
  showSportTabs,
  sportFilter,
  onSportFilterChange,
  openWeeks,
  onToggleWeek,
  defaultWeekOpen,
}: SessionsListProps) {
  const [hoveredSession, setHoveredSession] = useState<string | number | null>(null)
  const [expandedSession, setExpandedSession] = useState<string | number | null>(null)

  const s = VARIANT_STYLE[variant]

  const filtered = sportFilter === 'all' ? sessions : sessions.filter(x => x.sport === sportFilter)
  const weeks = Array.from(new Set(sessions.map(x => x.week))).sort((a, b) => a - b)

  return (
    <div>
      {/* Sport filter tabs */}
      {showSportTabs && (
        <div style={{
          display: 'flex', gap: s.tabGap, flexWrap: 'wrap',
          marginBottom: variant === 'compact' ? 12 : 0,
          padding: variant === 'review' ? '14px 28px' : 0,
          borderBottom: variant === 'review' ? `1px solid ${COLORS.border}` : 'none',
        }}>
          {sportTabs.map(t => {
            const isActive = sportFilter === t.key
            return (
              <button
                key={t.key}
                onClick={() => onSportFilterChange(t.key)}
                style={{
                  padding: s.tabPadding,
                  borderRadius: s.tabBorderRadius,
                  border: `1px solid ${isActive ? `${COLORS.accent}40` : 'transparent'}`,
                  fontSize: s.tabFontSize, fontWeight: 600,
                  cursor: 'pointer',
                  background: isActive ? s.tabActiveBg : 'transparent',
                  color: isActive ? COLORS.accent : COLORS.muted,
                  display: 'flex', alignItems: 'center', gap: s.tabGap,
                  transition: 'all 0.15s',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {t.key !== 'all' && (
                  <span style={{
                    display: 'inline-block', width: 6, height: 6,
                    borderRadius: '50%',
                    background: SPORT_COLORS[t.key] || COLORS.muted,
                    flexShrink: 0,
                  }} />
                )}
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Column headers + week rows — nested in the same padded scroll container so a header's
          own inner padding lines up with each row's own inner padding against one shared
          container inset (exactly how the two original files independently did this). */}
      <div style={variant === 'review'
        ? { flex: 1, overflowY: 'auto', padding: isMobile ? '12px 16px' : '16px 28px', maxHeight: 'calc(88vh - 160px)' }
        : { maxHeight: 480, overflowY: 'auto' }
      }>
        {!isMobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: s.desktopGrid,
            gap: variant === 'review' ? 12 : 10,
            padding: variant === 'review' ? '0 16px 10px' : '0 10px 8px',
            fontSize: 10, fontWeight: 700, color: COLORS.muted,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            fontFamily: 'DM Mono, monospace',
          }}>
            {s.showConflictColumn && <span />}
            <span>Sport</span>
            <span>Session</span>
            <span>Date</span>
            <span>Duration</span>
            <span>Target</span>
            {s.showConflictColumn && <span />}
          </div>
        )}

        {weeks.map(w => {
          const wSessions = filtered.filter(x => x.week === w)
          if (wSessions.length === 0) return null
          const wConflicts = wSessions.filter(x => x.conflict).length
          const isOpen = openWeeks[w] ?? defaultWeekOpen

          return (
            <div key={w} style={{ marginBottom: variant === 'review' ? 10 : 6 }}>
              {/* Week header */}
              <div
                onClick={() => onToggleWeek(w)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: s.weekHeaderPadding,
                  background: COLORS.bg,
                  borderRadius: s.weekHeaderBorderRadius,
                  border: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: isOpen ? (variant === 'review' ? 6 : 3) : 0,
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{
                  fontSize: variant === 'review' ? 10 : 9,
                  color: isOpen ? COLORS.accent : COLORS.muted,
                  display: 'inline-block',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}>▶</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>Week {w}</span>
                <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                  {wSessions.length} session{wSessions.length !== 1 ? 's' : ''}
                </span>
                {s.showConflictColumn && wConflicts > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 11,
                    background: '#f59e0b18', color: COLORS.amber,
                    border: '1px solid #f59e0b40', borderRadius: 6,
                    padding: '2px 8px', fontWeight: 700,
                  }}>
                    ⚠ {wConflicts} conflict{wConflicts !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Session rows */}
              {isOpen && wSessions.map(session => {
                const sportColor = SPORT_COLORS[session.sport] || COLORS.muted
                const isHovered = hoveredSession === session.id
                const isExpanded = expandedSession === session.id
                const hasDetail = Boolean(session.detail)
                return (
                  <div key={session.id} style={{ marginBottom: 2 }}>
                    <div
                      onMouseEnter={() => setHoveredSession(session.id)}
                      onMouseLeave={() => setHoveredSession(null)}
                      onClick={() => hasDetail && setExpandedSession(prev => prev === session.id ? null : session.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? s.mobileGrid : s.desktopGrid,
                        alignItems: 'center',
                        gap: variant === 'review' ? 12 : 10,
                        padding: isMobile ? s.rowPadding.mobile : s.rowPadding.desktop,
                        borderRadius: isExpanded ? `${s.rowBorderRadius}px ${s.rowBorderRadius}px 0 0` : s.rowBorderRadius,
                        background: isHovered || isExpanded
                          ? (variant === 'review' ? COLORS.bg : `${COLORS.border}40`)
                          : 'transparent',
                        cursor: hasDetail ? 'pointer' : 'default',
                        transition: 'background 0.12s',
                      }}
                    >
                      {/* Conflict icon — review variant, desktop only */}
                      {s.showConflictColumn && !isMobile && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {session.conflict && (
                            <span title="Schedule conflict" style={{ fontSize: 13, color: COLORS.amber }}>⚠</span>
                          )}
                        </div>
                      )}

                      {/* Sport tag */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: variant === 'review' ? 6 : 5 }}>
                        <div style={{
                          width: s.dotSize, height: s.dotSize, borderRadius: '50%',
                          background: sportColor, flexShrink: 0,
                          boxShadow: `0 0 5px ${sportColor}80`,
                        }} />
                        <span style={{
                          fontSize: s.sportLabelFontSize, fontWeight: 700, color: sportColor,
                          fontFamily: 'DM Mono, monospace',
                          letterSpacing: '0.05em', textTransform: 'uppercase',
                        }}>
                          {SPORT_LABELS[session.sport] || session.sport}
                        </span>
                      </div>

                      {/* Title + expand caret */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: variant === 'review' ? 6 : 5, overflow: 'hidden' }}>
                        <span style={{
                          fontSize: s.titleFontSize, color: COLORS.text, fontWeight: 500,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {session.title}
                        </span>
                        {hasDetail && (
                          <span style={{
                            fontSize: s.caretFontSize, color: isExpanded ? COLORS.accent : COLORS.muted,
                            flexShrink: 0,
                            display: 'inline-block',
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s, color 0.15s',
                          }}>▶</span>
                        )}
                      </div>

                      {/* Date — desktop only */}
                      {!isMobile && (
                        <span style={{ fontSize: s.metaFontSize, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                          {session.dateLabel ?? '—'}
                        </span>
                      )}

                      {/* Duration */}
                      <span style={{ fontSize: s.metaFontSize, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                        {session.durationLabel}
                      </span>

                      {/* Target metric — desktop only */}
                      {!isMobile && session.targetMetric && (
                        <span style={{
                          fontSize: s.metaFontSize, color: COLORS.accent, fontFamily: 'DM Mono, monospace',
                          background: `${COLORS.accent}10`, borderRadius: 4,
                          padding: '2px 7px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {session.targetMetric}
                        </span>
                      )}

                      {/* Conflict badge — review variant, desktop only */}
                      {s.showConflictColumn && !isMobile && (
                        <div>
                          {session.conflict && (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              background: '#f59e0b15', color: COLORS.amber,
                              border: '1px solid #f59e0b35',
                              borderRadius: 5, padding: '2px 7px',
                              fontFamily: 'DM Mono, monospace',
                            }}>conflict</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded description */}
                    {isExpanded && hasDetail && (
                      <div style={{
                        padding: s.detailPadding,
                        background: COLORS.bg,
                        borderTop: `1px solid ${COLORS.border}40`,
                        borderRight: `1px solid ${COLORS.border}${variant === 'review' ? '' : '40'}`,
                        borderBottom: `1px solid ${COLORS.border}${variant === 'review' ? '' : '40'}`,
                        borderLeft: `1px solid ${COLORS.border}${variant === 'review' ? '' : '40'}`,
                        borderRadius: `0 0 ${s.rowBorderRadius}px ${s.rowBorderRadius}px`,
                        fontSize: s.detailFontSize, color: COLORS.muted, lineHeight: 1.65,
                      }}>
                        {session.detail}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
