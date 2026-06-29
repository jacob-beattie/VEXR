import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Nutrition } from '../Nutrition'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: mockAuth, from: mockFrom },
}))

function makeQueryProxy(defaultData: unknown = []) {
  const okResult = { data: defaultData, error: null }
  const nullResult = { data: null, error: null }
  const proxy: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'single') return () => Promise.resolve(nullResult)
      if (prop === 'maybeSingle') return () => Promise.resolve(nullResult)
      if (prop === 'then') return (res: (v: unknown) => void) => res(okResult)
      return () => proxy
    },
  })
  return proxy
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockFrom.mockReturnValue(makeQueryProxy([]))
})

function renderNutrition() {
  return render(<MemoryRouter><Nutrition /></MemoryRouter>)
}

describe('Nutrition page', () => {
  it('renders the date navigator with Today label', async () => {
    renderNutrition()
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument())
  })

  it('renders the Calories stat card', async () => {
    renderNutrition()
    await waitFor(() => expect(screen.getByText('Calories')).toBeInTheDocument())
  })

  it('renders all four macro stat cards', async () => {
    renderNutrition()
    await waitFor(() => {
      expect(screen.getByText('Calories')).toBeInTheDocument()
      // Protein/Carbohydrates/Fat each appear in multiple elements (stat card + macro bar)
      expect(screen.getAllByText('Protein').length).toBeGreaterThan(0)
      expect(screen.getByText('Carbohydrates')).toBeInTheDocument()
      expect(screen.getAllByText('Fat').length).toBeGreaterThan(0)
    })
  })

  it('shows the Targets button', async () => {
    renderNutrition()
    await waitFor(() => expect(screen.getByText(/Targets/i)).toBeInTheDocument())
  })

  it('shows meal sections', async () => {
    renderNutrition()
    await waitFor(() => {
      expect(screen.getByText('Breakfast')).toBeInTheDocument()
      expect(screen.getByText('Lunch')).toBeInTheDocument()
    })
  })

  it('clicking ← shows TODAY button', async () => {
    const user = userEvent.setup()
    renderNutrition()
    await waitFor(() => screen.getByText('Today'))

    await user.click(screen.getByText('←'))
    await waitFor(() => {
      // dateOffset = -1 → "Yesterday" shown, and TODAY button appears
      expect(screen.getByText('Yesterday')).toBeInTheDocument()
      expect(screen.getByText('TODAY')).toBeInTheDocument()
    })
  })

  it('clicking TODAY after navigating returns to today', async () => {
    const user = userEvent.setup()
    renderNutrition()
    await waitFor(() => screen.getByText('Today'))

    await user.click(screen.getByText('←'))
    await waitFor(() => screen.getByText('TODAY'))
    await user.click(screen.getByText('TODAY'))
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.queryByText('TODAY')).not.toBeInTheDocument()
    })
  })
})
