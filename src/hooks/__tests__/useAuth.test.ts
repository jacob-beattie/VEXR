import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signOut: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: mockAuth },
}))

import { useAuth } from '../useAuth'

const mockUser = { id: 'user-1', email: 'test@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})

describe('useAuth — initial state', () => {
  it('starts in loading state with null user', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('resolves to not-loading with null user when no session', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('populates user from existing session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: mockUser } }, error: null })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toEqual(mockUser)
  })
})

describe('useAuth — auth state changes', () => {
  it('updates user when auth state changes to signed-in', async () => {
    let capturedCb: ((event: string, session: unknown) => void) | null = null
    mockAuth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCb = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => capturedCb?.('SIGNED_IN', { user: mockUser }))
    expect(result.current.user).toEqual(mockUser)
  })

  it('clears user when auth state changes to signed-out', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: mockUser } }, error: null })
    let capturedCb: ((event: string, session: unknown) => void) | null = null
    mockAuth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCb = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.user).toEqual(mockUser))

    act(() => capturedCb?.('SIGNED_OUT', null))
    expect(result.current.user).toBeNull()
  })

  it('unsubscribes from auth changes on unmount', async () => {
    const unsubscribe = vi.fn()
    mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
    const { unmount } = renderHook(() => useAuth())
    await waitFor(() => {})
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('useAuth — signIn', () => {
  it('calls signInWithPassword with email and password', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await result.current.signIn('user@example.com', 'password123')
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'password123' })
  })

  it('throws when signIn returns an error', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: new Error('Invalid credentials') })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.signIn('bad@example.com', 'wrong')).rejects.toThrow('Invalid credentials')
  })
})

describe('useAuth — signUp', () => {
  it('calls signUp with email, password, and name in metadata', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await result.current.signUp('new@example.com', 'pass123', 'Jacob')
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'pass123',
      options: { data: { name: 'Jacob' } },
    })
  })

  it('throws when signUp returns an error', async () => {
    mockAuth.signUp.mockResolvedValue({ data: {}, error: new Error('Email taken') })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.signUp('taken@example.com', 'pass', 'Bob')).rejects.toThrow('Email taken')
  })
})

describe('useAuth — signOut', () => {
  it('calls supabase signOut', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await result.current.signOut()
    expect(mockAuth.signOut).toHaveBeenCalledOnce()
  })

  it('throws when signOut returns an error', async () => {
    mockAuth.signOut.mockResolvedValue({ error: new Error('Network error') })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(result.current.signOut()).rejects.toThrow('Network error')
  })
})
