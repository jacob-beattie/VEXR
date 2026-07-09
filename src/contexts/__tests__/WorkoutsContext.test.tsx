import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  mockSupabaseAuth as mockAuth,
  mockChannel,
  mockFrom,
  seedMockTable,
  getMockTable,
  setMockCurrentUser,
  resetMockSupabase,
} from '../../test/mocks/supabase'
import { WorkoutsProvider, useWorkouts } from '../WorkoutsContext'
import type { Workout } from '../../types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// WorkoutsContext's default fetch only covers a trailing ~24-month window (see
// HISTORY_WINDOW_DAYS), so fixture dates need to move with "today" rather than being pinned to
// a fixed calendar date, or they'll silently fall outside the window and never load.
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dateKey(d)
}

// Day pinned to 15 to sidestep month-length overflow (e.g. subtracting a month from the 31st).
function monthsAgo(n: number): Date {
  const d = new Date()
  d.setDate(15)
  d.setMonth(d.getMonth() - n)
  return d
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  const date = daysAgo(30)
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'user-1',
    title: 'Test ride',
    type: 'ride',
    date,
    duration_minutes: 60,
    tss: 80,
    zone: '',
    notes: '',
    planned: false,
    created_at: `${date}T10:00:00Z`,
    ...overrides,
  }
}

function Wrapper({ children }: { children: ReactNode }) {
  return <WorkoutsProvider>{children}</WorkoutsProvider>
}

function Consumer({ fn }: { fn: (ctx: ReturnType<typeof useWorkouts>) => void }) {
  fn(useWorkouts())
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMockSupabase()
  setMockCurrentUser('user-1')
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkoutsContext — initial fetch', () => {
  it('starts loading and populates workouts from Supabase', async () => {
    const workout = makeWorkout()
    seedMockTable('workouts', [workout])

    const snapshots: Workout[][] = []
    render(
      <Wrapper>
        <Consumer fn={(ctx) => snapshots.push(ctx.workouts)} />
      </Wrapper>
    )

    await waitFor(() => expect(snapshots).toContainEqual([workout]))
  })

  it('handles Supabase fetch error gracefully (empty workouts)', async () => {
    // Force a DB error via a one-off override — not a shape the generic RLS
    // mock models, since it's a transport/DB failure rather than a filter or
    // ownership outcome.
    mockFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn(() => Promise.resolve({ data: null, error: new Error('DB error') })),
    }) as never)

    const snapshots: boolean[] = []
    render(
      <Wrapper>
        <Consumer fn={(ctx) => snapshots.push(ctx.loading)} />
      </Wrapper>
    )

    await waitFor(() => expect(snapshots).toContain(false))
  })

  it('only returns workouts owned by the authenticated user (RLS enforcement)', async () => {
    const own = makeWorkout({ id: 'own-1', user_id: 'user-1' })
    const foreign = makeWorkout({ id: 'foreign-1', user_id: 'user-2' })
    seedMockTable('workouts', [own, foreign])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    expect(ctx.workouts.map(w => w.id)).toEqual(['own-1'])
  })
})

describe('WorkoutsContext — addWorkout', () => {
  it('inserts the workout with the authenticated user\'s id', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    const newWorkout = { title: 'Run', type: 'run' as const, date: '2024-06-20', duration_minutes: 45, tss: 60, zone: '', notes: '', planned: false }
    await act(async () => { await ctx.addWorkout(newWorkout) })

    const inserted = getMockTable('workouts').find(w => w.title === 'Run')
    expect(inserted).toMatchObject({ ...newWorkout, user_id: 'user-1' })
  })

  it('rejects the insert when the payload is missing user_id (RLS WITH CHECK)', async () => {
    // Directly exercises the mock's RLS-on-insert enforcement: a payload
    // that doesn't carry the authenticated user's id must be rejected the
    // same way Postgres would reject it, not silently accepted.
    const { mockFrom } = await import('../../test/mocks/supabase')
    const result = await mockFrom('workouts').insert({ title: 'No owner', type: 'run', date: '2024-06-20' })
    expect(result.error).toMatchObject({ code: '42501' })
  })

  it('throws when insert returns an error', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    // Override just the upcoming insert call — the mount fetch above already
    // ran against the default (real-filtering) mock.
    mockFrom.mockImplementationOnce(() => ({
      insert: vi.fn(() => Promise.resolve({ error: new Error('Insert failed') })),
    }) as never)

    const newWorkout = { title: 'Run', type: 'run' as const, date: '2024-06-20', duration_minutes: 45, tss: 60, zone: '', notes: '', planned: false }
    await expect(act(async () => { await ctx.addWorkout(newWorkout) })).rejects.toThrow('Insert failed')
  })
})

describe('WorkoutsContext — updateWorkout', () => {
  it('updates the workout row in place', async () => {
    seedMockTable('workouts', [makeWorkout({ id: 'workout-1', tss: 80 })])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await act(async () => { await ctx.updateWorkout('workout-1', { tss: 90 }) })

    expect(getMockTable('workouts').find(w => w.id === 'workout-1')?.tss).toBe(90)
  })

  it('does not update a workout owned by another user (RLS enforcement)', async () => {
    seedMockTable('workouts', [makeWorkout({ id: 'foreign-1', user_id: 'user-2', tss: 50 })])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await act(async () => { await ctx.updateWorkout('foreign-1', { tss: 999 }) })

    expect(getMockTable('workouts').find(w => w.id === 'foreign-1')?.tss).toBe(50)
  })

  it('throws when update returns an error', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    mockFrom.mockImplementationOnce(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn(() => Promise.resolve({ error: new Error('Update failed') })),
      }),
    }) as never)

    await expect(act(async () => { await ctx.updateWorkout('bad-id', {}) })).rejects.toThrow('Update failed')
  })
})

describe('WorkoutsContext — deleteWorkout', () => {
  it('removes the workout row', async () => {
    seedMockTable('workouts', [makeWorkout({ id: 'workout-1' })])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await act(async () => { await ctx.deleteWorkout('workout-1') })

    expect(getMockTable('workouts').some(w => w.id === 'workout-1')).toBe(false)
  })

  it('does not delete a workout owned by another user (RLS enforcement)', async () => {
    seedMockTable('workouts', [makeWorkout({ id: 'foreign-1', user_id: 'user-2' })])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await act(async () => { await ctx.deleteWorkout('foreign-1') })

    expect(getMockTable('workouts').some(w => w.id === 'foreign-1')).toBe(true)
  })

  it('throws when delete returns an error', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    mockFrom.mockImplementationOnce(() => ({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn(() => Promise.resolve({ error: new Error('Delete failed') })),
      }),
    }) as never)

    await expect(act(async () => { await ctx.deleteWorkout('bad-id') })).rejects.toThrow('Delete failed')
  })
})

describe('WorkoutsContext — getWorkoutsForMonth', () => {
  it('returns only workouts in the specified month', async () => {
    const target = monthsAgo(2)
    const nextMonth = monthsAgo(1)
    const inMonth = makeWorkout({ date: dateKey(target) })
    const outMonth = makeWorkout({ date: dateKey(nextMonth) })
    seedMockTable('workouts', [inMonth, outMonth])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(2))

    const result = ctx.getWorkoutsForMonth(target.getFullYear(), target.getMonth())
    expect(result).toEqual([inMonth])
  })

  it('returns empty array when no workouts match', async () => {
    const seeded = monthsAgo(3)
    const queried = monthsAgo(2)
    seedMockTable('workouts', [makeWorkout({ date: dateKey(seeded) })])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(1))

    expect(ctx.getWorkoutsForMonth(queried.getFullYear(), queried.getMonth())).toEqual([])
  })
})

describe('WorkoutsContext — getTodaysWorkouts', () => {
  it('returns only workouts dated today', async () => {
    const todayWorkout = makeWorkout({ date: dateKey(new Date()) })
    const otherDayWorkout = makeWorkout({ date: daysAgo(5) })
    seedMockTable('workouts', [todayWorkout, otherDayWorkout])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(2))

    expect(ctx.getTodaysWorkouts()).toEqual([todayWorkout])
  })
})

describe('WorkoutsContext — getUpcomingWorkouts', () => {
  it('returns only future planned workouts within the window', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = dateKey(tomorrow)

    const planned = makeWorkout({ date: tomorrowStr, planned: true })
    const completed = makeWorkout({ date: tomorrowStr, planned: false })
    const past = makeWorkout({ date: daysAgo(5), planned: true })
    seedMockTable('workouts', [planned, completed, past])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(3))

    const upcoming = ctx.getUpcomingWorkouts(14)
    expect(upcoming).toEqual([planned])
  })

  it('returns empty when no upcoming planned workouts', async () => {
    seedMockTable('workouts', [makeWorkout({ date: daysAgo(5), planned: true })])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(1))

    expect(ctx.getUpcomingWorkouts(14)).toEqual([])
  })
})

describe('WorkoutsContext — history window pagination', () => {
  it('excludes workouts older than the default fetch window', async () => {
    const recent = makeWorkout({ date: daysAgo(30) })
    const ancient = makeWorkout({ date: daysAgo(900) }) // ~2.5 years back, outside the ~24-month window
    seedMockTable('workouts', [recent, ancient])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    expect(ctx.workouts.map(w => w.id)).toEqual([recent.id])
    expect(ctx.hasFullHistory).toBe(false)
  })

  it('requestFullHistory loads workouts outside the default window', async () => {
    const recent = makeWorkout({ date: daysAgo(30) })
    const ancient = makeWorkout({ date: daysAgo(900) })
    seedMockTable('workouts', [recent, ancient])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(1))

    await act(async () => { await ctx.requestFullHistory() })

    expect(ctx.workouts.map(w => w.id).sort()).toEqual([ancient.id, recent.id].sort())
    expect(ctx.hasFullHistory).toBe(true)
  })
})

describe('WorkoutsContext — getWeeklyLoadHistory', () => {
  it('excludes planned workouts from actual TSS', async () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const actual = makeWorkout({ date: todayStr, tss: 80, planned: false })
    const planned = makeWorkout({ date: todayStr, tss: 999, planned: true })
    seedMockTable('workouts', [actual, planned])

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(2))

    const history = ctx.getWeeklyLoadHistory(1)
    const thisWeek = history[0]
    expect(thisWeek.tss).toBe(80)
    expect(thisWeek.planned).toBe(999)
  })
})

describe('WorkoutsContext — realtime subscription', () => {
  it('sets up a channel subscription on mount', async () => {
    render(<Wrapper><Consumer fn={() => {}} /></Wrapper>)
    await waitFor(() => {})

    const { supabase } = await import('../../lib/supabase')
    expect(supabase.channel).toHaveBeenCalledWith('workouts-global')
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })
})
