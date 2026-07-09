import type { ParsedSession, SessionSport } from '../../types'

// Shared by ImportReviewScreen and PlanCard's PlanSessionsView — both render a sport-filter
// tab row over the same set of sports, so the label/tab lists must stay in sync.
export const SPORT_LABELS: Record<string, string> = {
  swim: 'Swim', bike: 'Bike', run: 'Run',
  sc: 'S&C', brick: 'Brick', other: 'Other',
}

export const SPORT_TABS: Array<{ key: SessionSport | 'all'; label: string }> = [
  { key: 'all',   label: 'All' },
  { key: 'swim',  label: 'Swim' },
  { key: 'bike',  label: 'Bike' },
  { key: 'run',   label: 'Run' },
  { key: 'sc',    label: 'S&C' },
  { key: 'brick', label: 'Brick' },
]

// Shared by ImportModal (parse-plan) and GeneratePlanModal (generate-plan) — both edge
// functions return the same session shape (generate-plan additionally includes `description`),
// so both modals map it into the app's `ParsedSession` shape identically.

const VALID_SPORTS: SessionSport[] = ['swim', 'bike', 'run', 'sc', 'brick', 'other', 'rest']

export function toSessionSport(s: string): SessionSport {
  return VALID_SPORTS.includes(s as SessionSport) ? (s as SessionSport) : 'other'
}

export function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

export interface EdgeSession {
  week: number
  day_of_week: string
  sport: string
  title: string
  description?: string
  duration_minutes: number | null
  target_metric: string
  scheduled_date: string | null
  has_conflict: boolean
}

export function mapEdgeSessions(raw: EdgeSession[]): ParsedSession[] {
  return raw.map((s, i) => ({
    id: i + 1,
    week: s.week,
    sport: toSessionSport(s.sport),
    title: s.title,
    date: s.scheduled_date ? formatDisplayDate(s.scheduled_date) : `Wk ${s.week} ${s.day_of_week ?? ''}`,
    dur: s.duration_minutes != null ? `${s.duration_minutes} min` : '',
    metric: s.target_metric ?? '',
    description: s.description ?? '',
    conflict: s.has_conflict,
    scheduledDate: s.scheduled_date ?? null,
  }))
}
