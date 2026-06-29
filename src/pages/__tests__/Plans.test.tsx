import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Plans } from '../Plans'

// Capture plans passed to child so we can inspect them
let capturedPlans: { name?: string; total_sessions?: number }[] = []

vi.mock('../../components/plans/PlansPage', () => ({
  PlansPage: ({ plans }: { plans: { name?: string; total_sessions?: number }[] }) => {
    capturedPlans = plans
    return (
      <div data-testid="plans-page">
        {plans.map((p, i) => <div key={i}>{p.name}</div>)}
      </div>
    )
  },
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function makeChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedPlans = []
})

describe('Plans page', () => {
  it('shows loading state initially', () => {
    // Return a never-resolving promise so we stay in loading state
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue(new Promise(() => {})),
    })
    render(<Plans />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders PlansPage with fetched plans', async () => {
    mockFrom.mockReturnValue(makeChain([{
      id: 'plan-1',
      name: '12-Week Build',
      training_sessions: [{ count: 36 }],
    }]))
    render(<Plans />)
    await waitFor(() => expect(screen.getByTestId('plans-page')).toBeInTheDocument())
    expect(screen.getByText('12-Week Build')).toBeInTheDocument()
  })

  it('maps training_sessions[0].count to total_sessions', async () => {
    mockFrom.mockReturnValue(makeChain([{
      id: 'plan-1',
      name: 'Test',
      training_sessions: [{ count: 42 }],
    }]))
    render(<Plans />)
    await waitFor(() => expect(screen.getByTestId('plans-page')).toBeInTheDocument())
    expect(capturedPlans[0]?.total_sessions).toBe(42)
  })

  it('shows error state when fetch fails', async () => {
    mockFrom.mockReturnValue(makeChain(null, new Error('DB error')))
    render(<Plans />)
    await waitFor(() => expect(screen.getByText('DB error')).toBeInTheDocument())
    expect(screen.queryByTestId('plans-page')).not.toBeInTheDocument()
  })
})
