import { vi } from 'vitest'

// A chainable Supabase query builder mock that actually filters an in-memory
// "table" and enforces row-level security, instead of returning a canned
// value regardless of what filters/ownership the code under test applied.
//
// Real Postgres RLS always scopes rows to the authenticated user server-side,
// whether or not the client also applies its own `.eq('user_id', ...)`
// filter — this mock models that: seed rows for one or more users via
// `seedMockTable`, set the "authenticated" user via `setMockCurrentUser`, and
// reads/writes are scoped to that user's rows regardless of the query shape
// the app code used. A dropped/incorrect ownership filter in application code
// therefore can't "leak" here any more than it could against real RLS — but a
// row a test *expects* to be visible/mutable will correctly disappear if the
// seeded owner doesn't match the current user, which is what catches an
// insert that forgot to set `user_id`.

type Row = Record<string, unknown>
type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'

interface Filter {
  op: FilterOp
  column: string
  value: unknown
}

interface RlsConfig {
  ownerColumn: string
}

// Mirrors the RLS policies in supabase-schema.sql — every user-owned table is
// keyed by the column its "user can only access their own rows" policy checks.
// `profiles` is keyed by `id` (the PK *is* the auth user id); everything else
// by `user_id`. Tables without RLS (e.g. `food_database`, public/read-only)
// are intentionally omitted so reads against them are unrestricted.
const RLS_TABLES: Record<string, RlsConfig> = {
  profiles: { ownerColumn: 'id' },
  workouts: { ownerColumn: 'user_id' },
  strava_connections: { ownerColumn: 'user_id' },
  training_plans: { ownerColumn: 'user_id' },
  training_sessions: { ownerColumn: 'user_id' },
  workout_library: { ownerColumn: 'user_id' },
  fitness_benchmarks: { ownerColumn: 'user_id' },
  training_zones: { ownerColumn: 'user_id' },
  ai_briefings: { ownerColumn: 'user_id' },
  nutrition_logs: { ownerColumn: 'user_id' },
  nutrition_custom_foods: { ownerColumn: 'user_id' },
  nutrition_targets: { ownerColumn: 'user_id' },
  hydration_logs: { ownerColumn: 'user_id' },
  goals: { ownerColumn: 'user_id' },
}

let currentUserId: string | null = null
let tables: Record<string, Row[]> = {}

/** Sets the "authenticated" user id used to enforce RLS on every table query. */
export function setMockCurrentUser(userId: string | null) {
  currentUserId = userId
}

/**
 * Seeds (replacing any existing rows) an in-memory table for the mock to query against.
 * Accepts any object type (e.g. the app's `Workout`/`Profile` interfaces) — the constraint
 * is deliberately `object`, not `Record<string, unknown>`, because named interfaces without
 * an index signature aren't assignable to the latter even though they're valid row shapes.
 */
export function seedMockTable<T extends object>(table: string, rows: T[]) {
  tables[table] = rows.map(r => ({ ...r })) as unknown as Row[]
}

/** Returns the table's current live rows (post insert/update/delete) for assertions. */
export function getMockTable<T extends object = Row>(table: string): T[] {
  return (tables[table] ?? []) as unknown as T[]
}

/** Clears all seeded data and the current user. Call in `beforeEach`. */
export function resetMockSupabase() {
  currentUserId = null
  tables = {}
}

function getRows(table: string): Row[] {
  if (!tables[table]) tables[table] = []
  return tables[table]
}

// A real Postgrest client would serialize `undefined` as the literal string
// "undefined" and send a nonsensical filter to the server — in practice this
// only happens when the caller has a bug (e.g. `user.id` from an
// unauthenticated session). Fail loudly instead of silently matching nothing
// or everything, so the bug surfaces at the call site under test.
function assertDefinedFilterValue(column: string, value: unknown) {
  if (value === undefined) {
    throw new Error(
      `Mock Supabase: filter on "${column}" received undefined. A real Postgrest query would ` +
      `serialize this as the literal string "undefined" — this is almost always a bug in the ` +
      `caller (e.g. an auth race or a missing null-check), not something to special-case in the mock.`
    )
  }
}

function matchesFilter(row: Row, filter: Filter): boolean {
  const actual = row[filter.column]
  switch (filter.op) {
    case 'eq': return actual === filter.value
    case 'neq': return actual !== filter.value
    case 'gt': return (actual as number) > (filter.value as number)
    case 'gte': return (actual as number) >= (filter.value as number)
    case 'lt': return (actual as number) < (filter.value as number)
    case 'lte': return (actual as number) <= (filter.value as number)
    case 'in': return Array.isArray(filter.value) && (filter.value as unknown[]).includes(actual)
    default: return true
  }
}

/** Simulates a Postgres RLS `USING` clause: scopes rows to the current user, regardless of client-side filters. */
function applyRls(table: string, rows: Row[]): Row[] {
  const rls = RLS_TABLES[table]
  if (!rls) return rows
  if (currentUserId == null) return []
  return rows.filter(r => r[rls.ownerColumn] === currentUserId)
}

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

type QueryResult = { data: unknown; error: unknown }

class MockQueryBuilder implements PromiseLike<QueryResult> {
  private table: string
  private operation: Operation = 'select'
  private payload: Row | Row[] | null = null
  private filters: Filter[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private upsertConflict: string | null = null
  private selectColumns: string | null = null

  constructor(table: string) {
    this.table = table
  }

  select(columns?: string) {
    this.selectColumns = columns ?? null
    return this
  }

  insert(payload: Row | Row[]) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operation = 'upsert'
    this.payload = payload
    this.upsertConflict = opts?.onConflict ?? null
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    assertDefinedFilterValue(column, value)
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  neq(column: string, value: unknown) {
    assertDefinedFilterValue(column, value)
    this.filters.push({ op: 'neq', column, value })
    return this
  }

  gt(column: string, value: unknown) {
    assertDefinedFilterValue(column, value)
    this.filters.push({ op: 'gt', column, value })
    return this
  }

  gte(column: string, value: unknown) {
    assertDefinedFilterValue(column, value)
    this.filters.push({ op: 'gte', column, value })
    return this
  }

  lt(column: string, value: unknown) {
    assertDefinedFilterValue(column, value)
    this.filters.push({ op: 'lt', column, value })
    return this
  }

  lte(column: string, value: unknown) {
    assertDefinedFilterValue(column, value)
    this.filters.push({ op: 'lte', column, value })
    return this
  }

  in(column: string, values: unknown[]) {
    assertDefinedFilterValue(column, values)
    this.filters.push({ op: 'in', column, value: values })
    return this
  }

  match(criteria: Row) {
    for (const [column, value] of Object.entries(criteria)) {
      assertDefinedFilterValue(column, value)
      this.filters.push({ op: 'eq', column, value })
    }
    return this
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderCol = column
    this.orderAsc = opts?.ascending ?? true
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  // Postgrest filters this mock doesn't model semantically — kept chainable
  // (no-op, args ignored) rather than crashing tests that happen to use them incidentally.
  not() { return this }
  is() { return this }
  ilike() { return this }
  contains() { return this }

  single(): PromiseLike<QueryResult> {
    return this.execute().then(({ data, error }) => {
      if (error) return { data: null, error }
      const rows = data as Row[]
      if (rows.length !== 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
      }
      return { data: rows[0], error: null }
    })
  }

  maybeSingle(): PromiseLike<QueryResult> {
    return this.execute().then(({ data, error }) => {
      if (error) return { data: null, error }
      const rows = data as Row[]
      if (rows.length > 1) {
        return { data: null, error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116' } }
      }
      return { data: rows[0] ?? null, error: null }
    })
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  // Projects a simple comma-separated column list (e.g. 'athlete_id, athlete_name').
  // Join/aggregate select syntax ('*', 'a, b(count)', etc.) is left unprojected —
  // modeling that correctly isn't worth it for what this mock is used for.
  private projectColumns(rows: Row[]): Row[] {
    const columns = this.selectColumns
    if (!columns || columns.trim() === '*' || columns.includes('(')) return rows
    const keys = columns.split(',').map(c => c.trim()).filter(Boolean)
    return rows.map(row => {
      const projected: Row = {}
      for (const key of keys) projected[key] = row[key]
      return projected
    })
  }

  private async execute(): Promise<QueryResult> {
    const rls = RLS_TABLES[this.table]

    if (this.operation === 'select') {
      let rows = applyRls(this.table, getRows(this.table))
      rows = rows.filter(r => this.filters.every(f => matchesFilter(r, f)))
      if (this.orderCol) {
        const col = this.orderCol
        const asc = this.orderAsc
        rows = [...rows].sort((a, b) => {
          const av = a[col] as string | number
          const bv = b[col] as string | number
          if (av < bv) return asc ? -1 : 1
          if (av > bv) return asc ? 1 : -1
          return 0
        })
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN)
      rows = this.projectColumns(rows)
      return { data: rows, error: null }
    }

    if (this.operation === 'insert' || this.operation === 'upsert') {
      const items = (Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : []) as Row[]
      // Simulates a Postgres RLS `WITH CHECK` failure: a row whose owner
      // column doesn't match the authenticated user is rejected, not silently
      // written — this is what catches an insert that forgot to set `user_id`.
      if (rls) {
        for (const item of items) {
          if (item[rls.ownerColumn] !== currentUserId) {
            return {
              data: null,
              error: { message: `new row violates row-level security policy for table "${this.table}"`, code: '42501' },
            }
          }
        }
      }
      const store = getRows(this.table)
      const conflictCol = this.upsertConflict
      const result: Row[] = []
      for (const item of items) {
        if (this.operation === 'upsert' && conflictCol && item[conflictCol] !== undefined) {
          const idx = store.findIndex(r => r[conflictCol] === item[conflictCol])
          if (idx !== -1) {
            store[idx] = { ...store[idx], ...item }
            result.push(store[idx])
            continue
          }
        }
        const row = { id: `mock-${Math.random().toString(36).slice(2)}`, created_at: new Date().toISOString(), ...item }
        store.push(row)
        result.push(row)
      }
      return { data: result, error: null }
    }

    if (this.operation === 'update') {
      const all = getRows(this.table)
      let target = all.filter(r => this.filters.every(f => matchesFilter(r, f)))
      target = applyRls(this.table, target)
      for (const row of target) Object.assign(row, this.payload)
      return { data: target, error: null }
    }

    if (this.operation === 'delete') {
      const all = getRows(this.table)
      let target = all.filter(r => this.filters.every(f => matchesFilter(r, f)))
      target = applyRls(this.table, target)
      tables[this.table] = all.filter(r => !target.includes(r))
      return { data: target, error: null }
    }

    return { data: null, error: null }
  }
}

export const mockFrom = vi.fn((table: string) => new MockQueryBuilder(table))

export const mockSupabaseAuth = {
  getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
}

export const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}

export const mockSupabase = {
  auth: mockSupabaseAuth,
  from: mockFrom,
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
}

vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }))
