import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from '../Dashboard'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('recharts', () => ({
  AreaChart: () => <div data-testid="area-chart" />,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockAuth = vi.hoisted(() => ({
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: mockAuth,
    from: mockFrom,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  },
}))

// Use hoisted to ensure values are defined before vi.mock factories run
const mockCtl = vi.hoisted(() => ({ value: 55 }))
const mockAtl = vi.hoisted(() => ({ value: 60 }))
const mockTsb = vi.hoisted(() => ({ value: -5 }))

vi.mock('../../contexts/WorkoutsContext', () => ({
  useWorkouts: () => ({
    workouts: [],
    loading: false,
    refetchWorkouts: vi.fn(),
    addWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    getWorkoutsForMonth: () => [],
    getWorkoutsForWeek: () => [],
    getTodaysWorkouts: () => [],
    calculateFitnessMetrics: () => ({ ctl: mockCtl.value, atl: mockAtl.value, tsb: mockTsb.value }),
    getWeeklyLoadHistory: () => [{ week: '10 Jun', tss: 300, planned: 0 }],
    getDailyWeekLoad: () => [
      { day: 'Mon', tss: 0, planned: 0 },
      { day: 'Tue', tss: 0, planned: 0 },
      { day: 'Wed', tss: 0, planned: 0 },
      { day: 'Thu', tss: 0, planned: 0 },
      { day: 'Fri', tss: 0, planned: 0 },
      { day: 'Sat', tss: 0, planned: 0 },
      { day: 'Sun', tss: 0, planned: 0 },
    ],
    getFitnessHistory: () => [{ week: '10 Jun', fitness: 55, fatigue: 60, form: -5 }],
    getUpcomingWorkouts: () => [],
  }),
}))

vi.mock('../../contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: {
      id: 'user-1',
      name: 'Jacob',
      sport: 'triathlon',
      ftp: 250,
      run_pace: '4:30',
      css: '1:40',
      race_goal: 'Ironman Melbourne',
      race_date: '2027-06-01',
    },
    setProfile: vi.fn(),
  }),
}))

function makeQueryProxy(defaultData: unknown = []) {
  const okResult = { data: defaultData, error: null }
  const nullResult = { data: null, error: null }
  // single/maybeSingle are true terminals → return a real Promise.
  // Everything else (select, eq, order, limit, insert, update, delete, etc.)
  // stays on the proxy so any suffix can still chain.
  // Awaiting the proxy directly hits the 'then' trap → resolves to okResult.
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
  mockCtl.value = 55
  mockAtl.value = 60
  mockTsb.value = -5
  mockFrom.mockReturnValue(makeQueryProxy([]))
})

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>)
}

describe('Dashboard — greeting', () => {
  it('renders a greeting with the user name', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText(/jacob/i)).toBeInTheDocument())
  })

  it('renders one of the three time-based greetings', async () => {
    renderDashboard()
    await waitFor(() => {
      const greetings = ['Good morning', 'Good afternoon', 'Good evening']
      const found = greetings.some(g => screen.queryByText(new RegExp(g, 'i')))
      expect(found).toBe(true)
    })
  })
})

describe('Dashboard — stat cards', () => {
  it('renders CTL stat card with value', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('CTL')).toBeInTheDocument())
    expect(screen.getByText('55')).toBeInTheDocument()
  })

  it('renders ATL stat card with value', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('ATL')).toBeInTheDocument())
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('renders TSB stat card', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('TSB')).toBeInTheDocument())
  })

  it('renders Race Goal stat card', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Race Goal')).toBeInTheDocument())
    expect(screen.getByText(/Ironman Melbourne/)).toBeInTheDocument()
  })
})

describe('Dashboard — layout sections', () => {
  it('renders the fitness area chart', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByTestId('area-chart')).toBeInTheDocument())
  })

  it('renders the Coming Up section', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText(/coming up/i)).toBeInTheDocument())
  })

  it('renders the Season Goals section', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText(/season goals/i)).toBeInTheDocument())
  })

  it('shows no-upcoming message when there are no planned workouts', async () => {
    renderDashboard()
    await waitFor(() => expect(screen.getByText(/no planned workouts ahead/i)).toBeInTheDocument())
  })
})

describe('Dashboard — high fatigue badge', () => {
  it('shows high-fatigue badge when TSB is below −20', async () => {
    mockTsb.value = -25
    mockAtl.value = 95
    renderDashboard()
    await waitFor(() => {
      const els = screen.getAllByText(/high fatigue/i)
      expect(els.length).toBeGreaterThan(0)
    })
  })

  it('does not show high-fatigue badge when TSB is above −20', async () => {
    mockTsb.value = -5
    renderDashboard()
    await waitFor(() => screen.getByText('CTL'))
    expect(screen.queryByText(/high fatigue/i)).not.toBeInTheDocument()
  })
})
