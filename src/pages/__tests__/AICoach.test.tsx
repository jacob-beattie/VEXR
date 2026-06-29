import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AICoach } from '../AICoach'
import type { Profile, Workout } from '../../types'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../components/ai/RacePredictor', () => ({
  RacePredictor: () => <div data-testid="race-predictor" />,
}))

const mockProfile: Profile = {
  id: 'user-1',
  name: 'Jacob',
  sport: 'triathlon',
  ftp: 250,
  run_pace: '4:30',
  css: '1:40',
  race_goal: 'Ironman',
  race_date: '2025-06-01',
}

const mockWorkout: Workout = {
  id: 'w1',
  user_id: 'user-1',
  title: 'Easy ride',
  type: 'ride',
  date: new Date().toISOString().split('T')[0],
  duration_minutes: 60,
  tss: 70,
  zone: '',
  notes: '',
  planned: false,
  created_at: new Date().toISOString(),
}

vi.mock('../../contexts/WorkoutsContext', () => ({
  useWorkouts: () => ({
    workouts: [mockWorkout],
    loading: false,
    calculateFitnessMetrics: () => ({ ctl: 55, atl: 60, tsb: -5 }),
    getWeeklyLoadHistory: () => [],
    getDailyWeekLoad: () => [],
    getFitnessHistory: () => [],
    getUpcomingWorkouts: () => [],
    refetchWorkouts: vi.fn(),
    addWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    getWorkoutsForMonth: vi.fn(() => []),
    getWorkoutsForWeek: vi.fn(() => []),
    getTodaysWorkouts: vi.fn(() => []),
  }),
}))

vi.mock('../../contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: mockProfile, setProfile: vi.fn() }),
}))

const mockBriefing = { id: 'b1', briefing: 'Your CTL is building well. Focus on consistency.', generated_at: new Date().toISOString() }
const mockBriefing2 = { id: 'b2', briefing: 'Last week you built good volume.', generated_at: new Date(Date.now() - 86400000 * 7).toISOString() }

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: mockAuth, from: mockFrom },
}))

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ briefing: 'Generated briefing text.', generated_at: new Date().toISOString(), cached: false }),
}))

function makeBriefingChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockReturnValue(makeBriefingChain([mockBriefing, mockBriefing2]))
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
})

function renderAICoach() {
  return render(<MemoryRouter><AICoach /></MemoryRouter>)
}

describe('AICoach page', () => {
  it('renders the CTL metric card', async () => {
    renderAICoach()
    await waitFor(() => expect(screen.getByText('CTL · Fitness')).toBeInTheDocument())
  })

  it('renders the ATL metric card', async () => {
    renderAICoach()
    await waitFor(() => expect(screen.getByText('ATL · Fatigue')).toBeInTheDocument())
  })

  it('renders the TSB metric card', async () => {
    renderAICoach()
    await waitFor(() => expect(screen.getByText('TSB · Form')).toBeInTheDocument())
  })

  it('renders the RacePredictor component', async () => {
    renderAICoach()
    await waitFor(() => expect(screen.getByTestId('race-predictor')).toBeInTheDocument())
  })

  it('renders the weekly briefing card with briefing text', async () => {
    renderAICoach()
    await waitFor(() =>
      expect(screen.getByText(/CTL is building well/i)).toBeInTheDocument()
    )
  })

  it('shows the previous briefings section when history exists', async () => {
    renderAICoach()
    await waitFor(() => expect(screen.getByText('Previous Briefings')).toBeInTheDocument())
  })

  it('renders the race countdown when race_date is set', async () => {
    renderAICoach()
    await waitFor(() => expect(screen.getByText('Race Countdown')).toBeInTheDocument())
  })
})
