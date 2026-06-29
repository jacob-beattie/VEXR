import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { useProfile, ProfileProvider } from '../ProfileContext'
import type { Profile } from '../../types'

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
    from: mockFrom,
  },
}))

const mockProfile: Profile = {
  id: 'user-1',
  name: 'Jacob',
  sport: 'triathlon',
  ftp: 250,
  run_pace: '4:30',
  css: '1:40',
}

function makeFromChain(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnThis(),
  }
  return chain
}

function ProfileConsumer({ onProfile }: { onProfile: (p: Profile | null) => void }) {
  const { profile } = useProfile()
  onProfile(profile)
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('ProfileContext — fetch on mount', () => {
  it('fetches profile when user is authenticated', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const chain = makeFromChain(mockProfile)
    mockFrom.mockReturnValue(chain)

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    await waitFor(() => expect(received).toContainEqual(mockProfile))
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('does not set profile when no user is authenticated', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    await waitFor(() => {})
    expect(received.every(p => p === null)).toBe(true)
  })
})

describe('ProfileContext — auth state changes', () => {
  it('fetches profile on auth state change to signed-in', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } })
    let capturedCb: ((event: string, session: unknown) => void) | null = null
    mockAuth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCb = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const chain = makeFromChain(mockProfile)
    mockFrom.mockReturnValue(chain)

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    capturedCb?.('SIGNED_IN', { access_token: 'tok' })

    await waitFor(() => expect(received).toContainEqual(mockProfile))
  })

  it('clears profile on auth state change to signed-out', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const chain = makeFromChain(mockProfile)
    mockFrom.mockReturnValue(chain)

    let capturedCb: ((event: string, session: unknown) => void) | null = null
    mockAuth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCb = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    await waitFor(() => expect(received).toContainEqual(mockProfile))
    act(() => capturedCb?.('SIGNED_OUT', null))
    await waitFor(() => expect(received[received.length - 1]).toBeNull())
  })
})

describe('ProfileContext — setProfile', () => {
  it('setProfile updates the context value synchronously', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const chain = makeFromChain(mockProfile)
    mockFrom.mockReturnValue(chain)

    let setProfileFn!: (p: Profile) => void
    const received: (Profile | null)[] = []

    function Consumer() {
      const { profile, setProfile } = useProfile()
      setProfileFn = setProfile
      received.push(profile)
      return null
    }

    render(
      <ProfileProvider>
        <Consumer />
      </ProfileProvider>
    )

    await waitFor(() => expect(received).toContainEqual(mockProfile))

    const updated = { ...mockProfile, ftp: 300 }
    act(() => setProfileFn(updated))
    await waitFor(() => expect(received[received.length - 1]).toEqual(updated))
  })
})
