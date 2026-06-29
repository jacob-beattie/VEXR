import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Calendar } from '../Calendar'
import type { Workout } from '../../types'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

// Mock heavy child components — Calendar logic is what we're testing
vi.mock('../../components/calendar/CalendarGrid', () => ({
  CalendarGrid: ({
    view,
    onViewChange,
    onPrevWeek,
    onNextWeek,
    onPrevMonth,
    onNextMonth,
  }: {
    view: string
    onViewChange: (v: 'month' | 'week') => void
    onPrevWeek: () => void
    onNextWeek: () => void
    onPrevMonth: () => void
    onNextMonth: () => void
  }) => (
    <div data-testid="calendar-grid">
      <span data-testid="current-view">{view}</span>
      <button onClick={() => onViewChange('month')}>Month</button>
      <button onClick={() => onViewChange('week')}>Week</button>
      <button onClick={onPrevWeek}>PrevWeek</button>
      <button onClick={onNextWeek}>NextWeek</button>
      <button onClick={onPrevMonth}>PrevMonth</button>
      <button onClick={onNextMonth}>NextMonth</button>
    </div>
  ),
}))

vi.mock('../../components/calendar/WeeklySummary', () => ({
  WeeklySummary: ({ workouts }: { workouts: Workout[] }) => (
    <div data-testid="weekly-summary">{workouts.length} workouts</div>
  ),
}))

vi.mock('../../components/LogWorkoutModal', () => ({
  LogWorkoutModal: () => null,
}))

vi.mock('../../components/WorkoutDetailModal', () => ({
  WorkoutDetailModal: () => null,
}))

vi.mock('../../components/DayWorkoutsModal', () => ({
  DayWorkoutsModal: () => null,
}))

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
    addWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    refetchWorkouts: vi.fn(),
    getWorkoutsForMonth: () => [mockWorkout],
    getWorkoutsForWeek: () => [mockWorkout],
    getTodaysWorkouts: () => [],
    calculateFitnessMetrics: () => ({ ctl: 40, atl: 45, tsb: -5 }),
    getWeeklyLoadHistory: () => [],
    getDailyWeekLoad: () => [],
    getFitnessHistory: () => [],
    getUpcomingWorkouts: () => [],
  }),
}))

function renderCalendar() {
  return render(<MemoryRouter><Calendar /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Calendar page', () => {
  it('renders the CalendarGrid', () => {
    renderCalendar()
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
  })

  it('renders the WeeklySummary', () => {
    renderCalendar()
    expect(screen.getByTestId('weekly-summary')).toBeInTheDocument()
  })

  it('defaults to week view', () => {
    renderCalendar()
    expect(screen.getByTestId('current-view').textContent).toBe('week')
  })

  it('switches to month view when toggled', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await user.click(screen.getByText('Month'))
    await waitFor(() => expect(screen.getByTestId('current-view').textContent).toBe('month'))
  })

  it('switches back to week view when toggled', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await user.click(screen.getByText('Month'))
    await user.click(screen.getByText('Week'))
    await waitFor(() => expect(screen.getByTestId('current-view').textContent).toBe('week'))
  })

  it('passes workouts to WeeklySummary', () => {
    renderCalendar()
    expect(screen.getByTestId('weekly-summary').textContent).toContain('1 workouts')
  })
})
