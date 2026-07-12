import { COLORS } from '../../lib/colors'
import type { ParsedSession } from '../../types'
import { SPORT_TABS } from './shared'
import { SessionsList, type SessionListItem } from './SessionsList'

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

function toListItem(s: ParsedSession): SessionListItem {
  return {
    id: s.id,
    week: s.week,
    sport: s.sport,
    title: s.title,
    dateLabel: s.date,
    durationLabel: s.dur,
    targetMetric: s.metric || null,
    detail: s.description || null,
    conflict: s.conflict,
  }
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
  const weeks = Array.from(new Set(parsedSessions.map(s => s.week))).sort((a, b) => a - b)
  const conflictCount = parsedSessions.filter(s => s.conflict).length

  // Derive date range and race name from parsed sessions + form
  const planName = formData.planName || 'Imported Training Plan'
  const totalWeeks = weeks.length

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

      <SessionsList
        sessions={parsedSessions.map(toListItem)}
        isMobile={isMobile}
        variant="review"
        sportTabs={SPORT_TABS}
        showSportTabs={true}
        sportFilter={sportFilter}
        onSportFilterChange={setSportFilter}
        openWeeks={openWeeks}
        onToggleWeek={toggleWeek}
        defaultWeekOpen={true}
      />

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
