import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { mockSupabaseAuth as mockAuth, seedMockTable, setMockCurrentUser, resetMockSupabase } from '../../test/mocks/supabase'
import { useProfile, ProfileProvider } from '../ProfileContext'
import type { Profile } from '../../types'

const mockProfileRow = {
  id: 'user-1',
  name: 'Jacob',
  sport: 'triathlon',
  ftp: 250,
  run_pace: '4:30',
  css: '1:40',
  race_goal: null,
  race_date: null,
  onboarding_completed: null,
  max_hr: null,
  avatar_url: null,
}

const mockProfile: Profile = {
  id: 'user-1',
  name: 'Jacob',
  sport: 'triathlon',
  ftp: 250,
  run_pace: '4:30',
  css: '1:40',
  max_hr: null,
  avatar_url: null,
}

function ProfileConsumer({ onProfile }: { onProfile: (p: Profile | null) => void }) {
  const { profile } = useProfile()
  onProfile(profile)
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  resetMockSupabase()
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('ProfileContext — fetch on mount', () => {
  it('fetches profile when user is authenticated', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setMockCurrentUser('user-1')
    seedMockTable('profiles', [mockProfileRow])

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    await waitFor(() => expect(received).toContainEqual(mockProfile))
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

  it('does not fetch another user\'s profile row (RLS enforcement)', async () => {
    // Seed a profile owned by a different user than the one who is
    // "authenticated" — the mock's RLS layer must scope the row lookup to
    // the current user, not just whatever `.eq('id', ...)` the client sent.
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setMockCurrentUser('user-2')
    seedMockTable('profiles', [mockProfileRow])

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    await waitFor(() => expect(received.length).toBeGreaterThan(0))
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

    setMockCurrentUser('user-1')
    seedMockTable('profiles', [mockProfileRow])

    const received: (Profile | null)[] = []
    render(
      <ProfileProvider>
        <ProfileConsumer onProfile={(p) => received.push(p)} />
      </ProfileProvider>
    )

    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const cb = capturedCb as ((event: string, session: unknown) => void) | null
    if (cb) cb('SIGNED_IN', { access_token: 'tok' })

    await waitFor(() => expect(received).toContainEqual(mockProfile))
  })

  it('clears profile on auth state change to signed-out', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    setMockCurrentUser('user-1')
    seedMockTable('profiles', [mockProfileRow])

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
    setMockCurrentUser('user-1')
    seedMockTable('profiles', [mockProfileRow])

    const receivedSetProfile: ((p: Profile) => void)[] = []
    const received: (Profile | null)[] = []

    function Consumer() {
      const { profile, setProfile } = useProfile()
      receivedSetProfile.push(setProfile)
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
    act(() => receivedSetProfile[receivedSetProfile.length - 1](updated))
    await waitFor(() => expect(received[received.length - 1]).toEqual(updated))
  })
})
