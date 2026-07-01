import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanCard } from '../PlanCard'
import type { TrainingPlan } from '../../../types'

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
    from: mockFrom,
  },
}))

const basePlan: TrainingPlan = {
  id: 'plan-1',
  user_id: 'user-1',
  name: '12-Week Ironman Build',
  sport: 'triathlon',
  total_weeks: 12,
  current_week: 4,
  status: 'active',
  race_name: 'Ironman Melbourne',
  race_date: '2025-03-15',
  start_date: null, // null so currentWeek = plan.current_week
  source: 'import',
  total_sessions: 3,
}

const mockOnRefresh = vi.fn()
const mockOnToast = vi.fn()

function makeSelectChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeSelectChain([]))
})

describe('PlanCard — rendering', () => {
  it('renders the plan name', () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    expect(screen.getByText('12-Week Ironman Build')).toBeInTheDocument()
  })

  it('renders the Active status badge', () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders Archived badge for archived plans', () => {
    const plan = { ...basePlan, status: 'archived' as const }
    render(<PlanCard plan={plan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('renders race name when provided', () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    expect(screen.getByText(/Ironman Melbourne/)).toBeInTheDocument()
  })

  it('renders week progress text', () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    expect(screen.getByText(/week 4 of 12/i)).toBeInTheDocument()
  })

  it('renders the sessions toggle button', () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    expect(screen.getByText(/view all 3 sessions/i)).toBeInTheDocument()
  })
})

describe('PlanCard — three-dot menu', () => {
  it('opens the dropdown when ⋯ is clicked', async () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText('⋯'))
    // Active plan → "Mark Complete" and "Archive" appear
    expect(screen.getByText('Mark Complete')).toBeInTheDocument()
    expect(screen.getByText('Archive')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('shows "Set Active" for archived plans', async () => {
    const plan = { ...basePlan, status: 'archived' as const }
    render(<PlanCard plan={plan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText('⋯'))
    expect(screen.getByText('Set Active')).toBeInTheDocument()
  })
})

describe('PlanCard — delete confirmation', () => {
  it('shows confirmation dialog when Delete is clicked', async () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText('⋯'))
    await userEvent.click(screen.getByText('Delete'))
    expect(screen.getByText(/delete this plan/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete plan/i })).toBeInTheDocument()
  })

  it('dismisses the confirmation when Cancel is clicked', async () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText('⋯'))
    await userEvent.click(screen.getByText('Delete'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByText(/delete this plan/i)).not.toBeInTheDocument()
  })

  it('calls onRefresh and onToast after confirmed delete', async () => {
    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText('⋯'))
    await userEvent.click(screen.getByText('Delete'))
    await userEvent.click(screen.getByRole('button', { name: /delete plan/i }))

    await waitFor(() => expect(mockOnRefresh).toHaveBeenCalled())
    expect(mockOnToast).toHaveBeenCalledWith(expect.stringContaining('deleted'))
  })
})

describe('PlanCard — sessions panel', () => {
  it('expands to show sessions when the sessions button is clicked', async () => {
    mockFrom.mockReturnValue(makeSelectChain([
      { id: 's1', week_number: 1, sport: 'run', title: 'Easy run', scheduled_date: null, duration_min: 45, target_metric: null, notes: null, status: 'pending' },
    ]))

    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText(/view all 3 sessions/i))

    await waitFor(() => expect(screen.getByText('Easy run')).toBeInTheDocument())
  })

  it('hides sessions when the button is clicked again', async () => {
    mockFrom.mockReturnValue(makeSelectChain([
      { id: 's1', week_number: 1, sport: 'run', title: 'Easy run', scheduled_date: null, duration_min: 45, target_metric: null, notes: null, status: 'pending' },
    ]))

    render(<PlanCard plan={basePlan} onRefresh={mockOnRefresh} onToast={mockOnToast} />)
    await userEvent.click(screen.getByText(/view all 3 sessions/i))
    await waitFor(() => screen.getByText('Easy run'))

    await userEvent.click(screen.getByText(/hide sessions/i))
    expect(screen.queryByText('Easy run')).not.toBeInTheDocument()
  })
})
