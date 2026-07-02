// Runtime shape validation for the LLM-generated training plan JSON.
// JSON.parse() only proves the string was *some* valid JSON — it says nothing about whether
// it matches the shape the rest of the pipeline (resolveDate, conflict detection, DB inserts)
// assumes. This narrows `unknown` down to ValidatedPlan field-by-field so a malformed/partial
// LLM response fails loudly instead of flowing through as silent `undefined`s.

export interface ValidatedSession {
  week: number
  day_of_week: string
  time_of_day: string
  sport: string
  title: string
  description: string
  duration_minutes: number | null
  target_metric: string
  zone_label: string
  phase: string
  notes: string
}

export interface ValidatedRace {
  name: string
  date: string
}

export interface ValidatedPlan {
  plan_name: string
  total_weeks: number
  races: ValidatedRace[]
  sessions: ValidatedSession[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateSession(raw: unknown): ValidatedSession | null {
  if (!isRecord(raw)) return null
  if (typeof raw.week !== 'number') return null
  if (typeof raw.day_of_week !== 'string') return null
  if (typeof raw.sport !== 'string') return null
  if (typeof raw.title !== 'string') return null
  return {
    week: raw.week,
    day_of_week: raw.day_of_week,
    time_of_day: typeof raw.time_of_day === 'string' ? raw.time_of_day : '',
    sport: raw.sport,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : '',
    duration_minutes: typeof raw.duration_minutes === 'number' ? raw.duration_minutes : null,
    target_metric: typeof raw.target_metric === 'string' ? raw.target_metric : '',
    zone_label: typeof raw.zone_label === 'string' ? raw.zone_label : '',
    phase: typeof raw.phase === 'string' ? raw.phase : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  }
}

function validateRace(raw: unknown): ValidatedRace | null {
  if (!isRecord(raw)) return null
  if (typeof raw.name !== 'string' || typeof raw.date !== 'string') return null
  return { name: raw.name, date: raw.date }
}

// Returns null if the top-level shape is unusable (not an object, or `sessions` isn't an array).
// Individual malformed sessions/races are dropped rather than failing the whole plan, since a
// single bad entry from the LLM shouldn't sink an otherwise-valid multi-week plan.
export function validateParsedPlan(parsed: unknown): ValidatedPlan | null {
  if (!isRecord(parsed)) return null
  if (!Array.isArray(parsed.sessions)) return null

  const sessions = parsed.sessions
    .map(validateSession)
    .filter((s): s is ValidatedSession => s !== null)

  const races = Array.isArray(parsed.races)
    ? parsed.races.map(validateRace).filter((r): r is ValidatedRace => r !== null)
    : []

  return {
    plan_name: typeof parsed.plan_name === 'string' ? parsed.plan_name : '',
    total_weeks: typeof parsed.total_weeks === 'number'
      ? parsed.total_weeks
      : Math.max(...sessions.map(s => s.week), 1),
    races,
    sessions,
  }
}
