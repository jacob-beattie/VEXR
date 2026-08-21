import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  mockSupabaseAuth as mockAuth,
  mockFrom,
  seedMockTable,
  getMockTable,
  setMockCurrentUser,
  resetMockSupabase,
} from '../../test/mocks/supabase'
import { StravaProvider, useStrava } from '../StravaContext'
import { WorkoutsProvider } from '../WorkoutsContext'

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <WorkoutsProvider>
      <StravaProvider>{children}</StravaProvider>
    </WorkoutsProvider>
  )
}

function Consumer({ fn }: { fn: (ctx: ReturnType<typeof useStrava>) => void }) {
  fn(useStrava())
  return null
}

const mockConnection = { athlete_id: 123, athlete_name: 'Jacob', user_id: 'user-1' }

beforeEach(() => {
  vi.clearAllMocks()
  resetMockSupabase()
  setMockCurrentUser('user-1')
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('StravaContext — refetchConnection', () => {
  it('sets connection when one exists', async () => {
    seedMockTable('strava_connections', [mockConnection])

    const received: (typeof mockConnection | null)[] = []
    render(
      <Wrapper>
        <Consumer fn={(ctx) => received.push(ctx.connection as typeof mockConnection | null)} />
      </Wrapper>
    )

    // .select('athlete_id, athlete_name') projects out user_id — assert the
    // shape the app actually receives, not the full seeded row.
    await waitFor(() => expect(received).toContainEqual({ athlete_id: 123, athlete_name: 'Jacob' }))
  })

  it('leaves connection null when none exists', async () => {
    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    expect(ctx.connection).toBeNull()
  })

  it('does not see another user\'s Strava connection (RLS enforcement)', async () => {
    seedMockTable('strava_connections', [{ athlete_id: 999, athlete_name: 'Someone Else', user_id: 'user-2' }])

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    expect(ctx.connection).toBeNull()
  })
})

describe('StravaContext — disconnect', () => {
  it('calls delete on strava_connections and clears connection', async () => {
    seedMockTable('strava_connections', [mockConnection])

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.connection).toEqual({ athlete_id: 123, athlete_name: 'Jacob' }))

    // Suppress auto-sync fetch during this test
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) })

    await act(async () => { await ctx.disconnect() })

    expect(ctx.connection).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('strava_connections')
    expect(getMockTable('strava_connections')).toEqual([])
  })

  it('does not delete another user\'s Strava connection (RLS enforcement)', async () => {
    // Seed a connection for a *different* user than the one currently
    // authenticated — disconnect() filters by `.eq('user_id', user.id)`
    // itself, but RLS must back that up regardless.
    seedMockTable('strava_connections', [{ athlete_id: 999, athlete_name: 'Someone Else', user_id: 'user-2' }])

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) })
    await act(async () => { await ctx.disconnect() })

    expect(getMockTable('strava_connections')).toHaveLength(1)
  })
})

describe('StravaContext — triggerSync', () => {
  it('calls the strava-sync edge function with auth headers', async () => {
    // No connection so auto-sync doesn't fire
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) })

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    await act(async () => { await ctx.triggerSync() })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('strava-sync'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      })
    )
  })

  it('does not double-sync when already syncing', async () => {
    let resolveFetch!: (v: unknown) => void
    mockFetch.mockReturnValue(new Promise(r => { resolveFetch = r }))

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    // Start first sync but don't resolve it
    act(() => { ctx.triggerSync() })
    await waitFor(() => expect(ctx.syncing).toBe(true))

    // Second call while already syncing should be a no-op
    await act(async () => { await ctx.triggerSync() })

    // Resolve pending fetch and drain resulting state updates
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ count: 0 }) })
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('sets syncing=false after sync completes', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) })

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    await act(async () => { await ctx.triggerSync() })

    expect(ctx.syncing).toBe(false)
  })
})

describe('StravaContext — toast', () => {
  it('shows toast when workouts are imported', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 3 }) })

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    await act(async () => { await ctx.triggerSync() })

    expect(ctx.toastMessage).toContain('3')
  })

  it('clearToast sets toastMessage to null', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) })

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    await act(async () => { await ctx.triggerSync() })
    expect(ctx.toastMessage).not.toBeNull()

    act(() => ctx.clearToast())
    expect(ctx.toastMessage).toBeNull()
  })
})
