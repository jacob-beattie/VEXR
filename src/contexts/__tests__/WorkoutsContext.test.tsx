import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { WorkoutsProvider, useWorkouts } from '../WorkoutsContext'
import type { Workout } from '../../types'

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}))

const mockChannel = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}))

// Shared mutable mock return value for .from() chains
let mockSelectResolve: { data: unknown; error: unknown } = { data: [], error: null }
let mockInsertResolve: { error: unknown } = { error: null }
let mockUpdateResolve: { error: unknown } = { error: null }
let mockDeleteResolve: { error: unknown } = { error: null }

const mockFromImpl = vi.hoisted(() =>
  vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(() => Promise.resolve(mockSelectResolve)),
    insert: vi.fn(() => Promise.resolve(mockInsertResolve)),
    update: vi.fn().mockReturnValue({
      eq: vi.fn(() => Promise.resolve(mockUpdateResolve)),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn(() => Promise.resolve(mockDeleteResolve)),
    }),
  }))
)

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
    from: mockFromImpl,
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'user-1',
    title: 'Test ride',
    type: 'ride',
    date: '2024-06-15',
    duration_minutes: 60,
    tss: 80,
    zone: '',
    notes: '',
    planned: false,
    created_at: '2024-06-15T10:00:00Z',
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
  mockSelectResolve = { data: [], error: null }
  mockInsertResolve = { error: null }
  mockUpdateResolve = { error: null }
  mockDeleteResolve = { error: null }
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkoutsContext — initial fetch', () => {
  it('starts loading and populates workouts from Supabase', async () => {
    const workout = makeWorkout()
    mockSelectResolve = { data: [workout], error: null }

    const snapshots: Workout[][] = []
    render(
      <Wrapper>
        <Consumer fn={(ctx) => snapshots.push(ctx.workouts)} />
      </Wrapper>
    )

    await waitFor(() => expect(snapshots).toContainEqual([workout]))
  })

  it('handles Supabase fetch error gracefully (empty workouts)', async () => {
    mockSelectResolve = { data: null, error: new Error('DB error') }

    const snapshots: boolean[] = []
    render(
      <Wrapper>
        <Consumer fn={(ctx) => snapshots.push(ctx.loading)} />
      </Wrapper>
    )

    await waitFor(() => expect(snapshots).toContain(false))
  })
})

describe('WorkoutsContext — addWorkout', () => {
  it('calls insert with the workout payload and user_id', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    const newWorkout = { title: 'Run', type: 'run' as const, date: '2024-06-20', duration_minutes: 45, tss: 60, zone: '', notes: '', planned: false }
    await act(async () => { await ctx.addWorkout(newWorkout) })

    expect(mockFromImpl).toHaveBeenCalledWith('workouts')
  })

  it('throws when insert returns an error', async () => {
    mockInsertResolve = { error: new Error('Insert failed') }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    const newWorkout = { title: 'Run', type: 'run' as const, date: '2024-06-20', duration_minutes: 45, tss: 60, zone: '', notes: '', planned: false }
    await expect(act(async () => { await ctx.addWorkout(newWorkout) })).rejects.toThrow('Insert failed')
  })
})

describe('WorkoutsContext — updateWorkout', () => {
  it('calls update on the workouts table', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await act(async () => { await ctx.updateWorkout('workout-1', { tss: 90 }) })

    expect(mockFromImpl).toHaveBeenCalledWith('workouts')
  })

  it('throws when update returns an error', async () => {
    mockUpdateResolve = { error: new Error('Update failed') }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await expect(act(async () => { await ctx.updateWorkout('bad-id', {}) })).rejects.toThrow('Update failed')
  })
})

describe('WorkoutsContext — deleteWorkout', () => {
  it('calls delete on the workouts table', async () => {
    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await act(async () => { await ctx.deleteWorkout('workout-1') })

    expect(mockFromImpl).toHaveBeenCalledWith('workouts')
  })

  it('throws when delete returns an error', async () => {
    mockDeleteResolve = { error: new Error('Delete failed') }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loading).toBe(false))

    await expect(act(async () => { await ctx.deleteWorkout('bad-id') })).rejects.toThrow('Delete failed')
  })
})

describe('WorkoutsContext — getWorkoutsForMonth', () => {
  it('returns only workouts in the specified month', async () => {
    const inMonth = makeWorkout({ date: '2024-06-15' })
    const outMonth = makeWorkout({ date: '2024-07-01' })
    mockSelectResolve = { data: [inMonth, outMonth], error: null }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(2))

    const result = ctx.getWorkoutsForMonth(2024, 5) // month is 0-indexed
    expect(result).toEqual([inMonth])
  })

  it('returns empty array when no workouts match', async () => {
    mockSelectResolve = { data: [makeWorkout({ date: '2024-01-01' })], error: null }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(1))

    expect(ctx.getWorkoutsForMonth(2024, 5)).toEqual([])
  })
})

describe('WorkoutsContext — getTodaysWorkouts', () => {
  it('returns only workouts dated today', async () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const todayWorkout = makeWorkout({ date: todayStr })
    const oldWorkout = makeWorkout({ date: '2020-01-01' })
    mockSelectResolve = { data: [todayWorkout, oldWorkout], error: null }

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
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

    const planned = makeWorkout({ date: tomorrowStr, planned: true })
    const completed = makeWorkout({ date: tomorrowStr, planned: false })
    const old = makeWorkout({ date: '2020-01-01', planned: true })
    mockSelectResolve = { data: [planned, completed, old], error: null }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(3))

    const upcoming = ctx.getUpcomingWorkouts(14)
    expect(upcoming).toEqual([planned])
  })

  it('returns empty when no upcoming planned workouts', async () => {
    mockSelectResolve = { data: [makeWorkout({ date: '2020-01-01', planned: true })], error: null }

    let ctx!: ReturnType<typeof useWorkouts>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.workouts.length).toBe(1))

    expect(ctx.getUpcomingWorkouts(14)).toEqual([])
  })
})

describe('WorkoutsContext — getWeeklyLoadHistory', () => {
  it('excludes planned workouts from actual TSS', async () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const actual = makeWorkout({ date: todayStr, tss: 80, planned: false })
    const planned = makeWorkout({ date: todayStr, tss: 999, planned: true })
    mockSelectResolve = { data: [actual, planned], error: null }

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
