import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StravaProvider, useStrava } from '../StravaContext'
import { WorkoutsProvider } from '../WorkoutsContext'

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}))

let mockMaybeSingleResolve: { data: unknown } = { data: null }

const mockFromImpl = vi.hoisted(() =>
  vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    }),
    maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingleResolve)),
  }))
)

const mockChannel = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
    from: mockFromImpl,
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

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

const mockConnection = { athlete_id: 123, athlete_name: 'Jacob' }

beforeEach(() => {
  vi.clearAllMocks()
  mockMaybeSingleResolve = { data: null }
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('StravaContext — refetchConnection', () => {
  it('sets connection when one exists', async () => {
    mockMaybeSingleResolve = { data: mockConnection }

    const received: (typeof mockConnection | null)[] = []
    render(
      <Wrapper>
        <Consumer fn={(ctx) => received.push(ctx.connection as typeof mockConnection | null)} />
      </Wrapper>
    )

    await waitFor(() => expect(received).toContainEqual(mockConnection))
  })

  it('leaves connection null when none exists', async () => {
    mockMaybeSingleResolve = { data: null }

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    expect(ctx.connection).toBeNull()
  })
})

describe('StravaContext — disconnect', () => {
  it('calls delete on strava_connections and clears connection', async () => {
    mockMaybeSingleResolve = { data: mockConnection }

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.connection).toEqual(mockConnection))

    // Suppress auto-sync fetch during this test
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) })

    await act(async () => { await ctx.disconnect() })

    expect(ctx.connection).toBeNull()
    expect(mockFromImpl).toHaveBeenCalledWith('strava_connections')
  })
})

describe('StravaContext — triggerSync', () => {
  it('calls the strava-sync edge function with auth headers', async () => {
    // No connection so auto-sync doesn't fire
    mockMaybeSingleResolve = { data: null }
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
    mockMaybeSingleResolve = { data: null }
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

    // Resolve pending fetch
    resolveFetch({ ok: true, json: async () => ({ count: 0 }) })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('sets syncing=false after sync completes', async () => {
    mockMaybeSingleResolve = { data: null }
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
    mockMaybeSingleResolve = { data: null }
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ count: 3 }) })

    let ctx!: ReturnType<typeof useStrava>
    render(<Wrapper><Consumer fn={(c) => { ctx = c }} /></Wrapper>)
    await waitFor(() => expect(ctx.loadingConnection).toBe(false))

    await act(async () => { await ctx.triggerSync() })

    expect(ctx.toastMessage).toContain('3')
  })

  it('clearToast sets toastMessage to null', async () => {
    mockMaybeSingleResolve = { data: null }
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
