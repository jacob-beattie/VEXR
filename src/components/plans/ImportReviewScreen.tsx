import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import type { ParsedSession } from '../../types'

const SPORT_COLORS: Record<string, string> = {
  swim:  '#0369a1',
  bike:  '#6d28d9',
  run:   '#15803d',
  sc:    '#b45309',
  brick: '#d97706',
  other: COLORS.muted,
}

const SPORT_LABELS: Record<string, string> = {
  swim: 'Swim', bike: 'Bike', run: 'Run',
  sc: 'S&C', brick: 'Brick', other: 'Other',
}

const SPORT_TABS = [
  { key: 'all',   label: 'All' },
  { key: 'swim',  label: 'Swim' },
  { key: 'bike',  label: 'Bike' },
  { key: 'run',   label: 'Run' },
  { key: 'sc',    label: 'S&C' },
  { key: 'brick', label: 'Brick' },
]

interface ImportReviewScreenProps {
  parsedSessions: ParsedSession[]
  formData: { startDate: string; raceDate: string; planName: string }
  sportFilter: string
  setSportFilter: (f: string) => void
  openWeeks: Record<number, boolean>
  toggleWeek: (w: number) => void
  onClose: () => void
  onImport: () => Promise<void>
  importing: boolean
  importError: string | null
  isMobile: boolean
}

export function ImportReviewScreen({
  parsedSessions,
  formData,
  sportFilter,
  setSportFilter,
  openWeeks,
  toggleWeek,
  onClose,
  onImport,
  importing,
  importError,
  isMobile,
}: ImportReviewScreenProps) {
  const [hoveredSession, setHoveredSession] = useState<number | null>(null)
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null)

  const filteredSessions = sportFilter === 'all'
    ? parsedSessions
    : parsedSessions.filter(s => s.sport === sportFilter)

  const weeks = Array.from(new Set(parsedSessions.map(s => s.week))).sort((a, b) => a - b)
  const conflictCount = parsedSessions.filter(s => s.conflict).length

  // Derive date range and race name from parsed sessions + form
  const planName = formData.planName || 'Imported Training Plan'
  const totalWeeks = weeks.length

  const desktopGrid = '24px 90px 1fr 90px 70px 110px 80px'
  const mobileGrid = '90px 1fr 70px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '18px 20px 16px' : '22px 28px 18px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.text, marginBottom: 4 }}>
            {planName}
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {[
              [String(parsedSessions.length), 'sessions'],
              [String(totalWeeks), 'weeks'],
              ...(formData.startDate && formData.raceDate
                ? [[`${formData.startDate} → ${formData.raceDate}`, 'date range']]
                : []),
            ].map(([val, lbl]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.text, fontFamily: 'DM Mono, monospace' }}>{val}</span>
                <span style={{ fontSize: 11, color: COLORS.muted }}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: COLORS.muted,
            fontSize: 22, cursor: 'pointer', padding: '4px 8px',
            lineHeight: 1, borderRadius: 6, flexShrink: 0,
          }}
        >×</button>
      </div>

      {/* Sport filter tabs */}
      <div style={{
        padding: isMobile ? '12px 16px' : '14px 28px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', gap: 6, flexWrap: 'wrap',
      }}>
        {SPORT_TABS.map(t => {
          const isActive = sportFilter === t.key
          return (
            <button
              key={t.key}
              onClick={() => setSportFilter(t.key)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: `1px solid ${isActive ? COLORS.accent + '40' : 'transparent'}`,
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                background: isActive ? COLORS.accentDim : 'transparent',
                color: isActive ? COLORS.accent : COLORS.muted,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {t.key !== 'all' && (
                <span style={{
                  display: 'inline-block', width: 7, height: 7,
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

      {/* Session list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: isMobile ? '12px 16px' : '16px 28px',
        maxHeight: 'calc(88vh - 160px)',
      }}>
        {/* Column headers */}
        {!isMobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: desktopGrid,
            gap: 12, padding: '0 16px 10px',
            fontSize: 10, fontWeight: 700, color: COLORS.muted,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            fontFamily: 'DM Mono, monospace',
          }}>
            <span />
            <span>Sport</span>
            <span>Session</span>
            <span>Date</span>
            <span>Duration</span>
            <span>Target</span>
            <span />
          </div>
        )}

        {weeks.map(w => {
          const wSessions = filteredSessions.filter(s => s.week === w)
          if (wSessions.length === 0) return null
          const wConflicts = wSessions.filter(s => s.conflict).length
          const isOpen = openWeeks[w] ?? true

          return (
            <div key={w} style={{ marginBottom: 10 }}>
              {/* Week header */}
              <div
                onClick={() => toggleWeek(w)}
                onMouseEnter={() => setHoveredWeek(w)}
                onMouseLeave={() => setHoveredWeek(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px',
                  background: '#0d1017',
                  borderRadius: 8,
                  border: `1px solid ${hoveredWeek === w ? COLORS.subtle : COLORS.border}`,
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: isOpen ? 6 : 0,
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{
                  fontSize: 10,
                  color: isOpen ? COLORS.accent : COLORS.muted,
                  display: 'inline-block',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}>▶</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>Week {w}</span>
                <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                  {wSessions.length} session{wSessions.length !== 1 ? 's' : ''}
                </span>
                {wConflicts > 0 && (
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
              {isOpen && wSessions.map(s => {
                const sportColor = SPORT_COLORS[s.sport] || COLORS.muted
                const isHovered = hoveredSession === s.id
                return (
                  <div
                    key={s.id}
                    onMouseEnter={() => setHoveredSession(s.id)}
                    onMouseLeave={() => setHoveredSession(null)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? mobileGrid : desktopGrid,
                      alignItems: 'center',
                      gap: 12,
                      padding: isMobile ? '10px 12px' : '11px 16px',
                      borderRadius: 8,
                      border: `1px solid ${isHovered ? COLORS.border : 'transparent'}`,
                      background: isHovered ? '#ffffff05' : 'transparent',
                      cursor: 'default',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                  >
                    {/* Conflict icon — desktop only */}
                    {!isMobile && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.conflict && (
                          <span title="Schedule conflict" style={{ fontSize: 13, color: COLORS.amber }}>⚠</span>
                        )}
                      </div>
                    )}

                    {/* Sport tag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: sportColor, flexShrink: 0,
                        boxShadow: `0 0 5px ${sportColor}80`,
                      }} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: sportColor,
                        fontFamily: 'DM Mono, monospace',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        {SPORT_LABELS[s.sport] || s.sport}
                      </span>
                    </div>

                    {/* Title */}
                    <span style={{
                      fontSize: 13, color: COLORS.text, fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {s.title}
                    </span>

                    {/* Date — desktop only */}
                    {!isMobile && (
                      <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                        {s.date}
                      </span>
                    )}

                    {/* Duration */}
                    <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                      {s.dur}
                    </span>

                    {/* Target metric — desktop only */}
                    {!isMobile && (
                      <span style={{
                        fontSize: 11, color: COLORS.accent, fontFamily: 'DM Mono, monospace',
                        background: `${COLORS.accent}10`, borderRadius: 4,
                        padding: '2px 7px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {s.metric}
                      </span>
                    )}

                    {/* Conflict badge — desktop only */}
                    {!isMobile && (
                      <div>
                        {s.conflict && (
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
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: isMobile ? '14px 16px' : '16px 28px',
        borderTop: `1px solid ${COLORS.border}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {importError && (
          <div style={{
            background: `${COLORS.orange}15`,
            border: `1px solid ${COLORS.orange}40`,
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: COLORS.orange,
          }}>
            {importError}
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: conflictCount > 0 ? 'space-between' : 'flex-end',
          gap: 16, flexWrap: 'wrap',
        }}>
        {conflictCount > 0 && (
          <div style={{ fontSize: 12, color: COLORS.muted }}>
            <span style={{ color: COLORS.amber, fontWeight: 700 }}>⚠ {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} detected</span>
            {' '}— sessions overlap with existing calendar entries
          </div>
        )}
        <button
          className="purple-glow-btn"
          onClick={onImport}
          disabled={importing}
          style={{ padding: '12px 24px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {importing ? 'Importing...' : `Import ${parsedSessions.length} Sessions →`}
        </button>
        </div>
      </div>
    </div>
  )
}
