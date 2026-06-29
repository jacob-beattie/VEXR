import { vi } from 'vitest'

// Chainable query builder mock — supports .select().eq().order() etc.
function makeQueryBuilder(resolvedValue: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder: Record<string, unknown> = {}
  const proxy: typeof builder = new Proxy(builder, {
    get(_target, prop: string) {
      if (prop === 'then') {
        // Makes the builder itself awaitable
        return (resolve: (v: unknown) => void) => resolve(resolvedValue)
      }
      // Methods that resolve the chain
      if (['single', 'maybeSingle'].includes(prop)) {
        return () => Promise.resolve(resolvedValue)
      }
      // Methods that return the proxy for continued chaining
      return () => proxy
    },
  })

  return proxy
}

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

export const mockFrom = vi.fn(() => makeQueryBuilder())

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
