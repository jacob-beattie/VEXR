import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeeklySummary } from '../WeeklySummary'
import type { Workout } from '../../../types'

// useIsMobile always returns false in tests (jsdom width = 1024)
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

// Monday of a fixed week
const WEEK_START = new Date('2024-06-10T00:00:00')

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    title: 'Test',
    type: 'ride',
    date: '2024-06-10',
    duration_minutes: 60,
    tss: 80,
    zone: '',
    notes: '',
    planned: false,
    created_at: '2024-06-10T10:00:00Z',
    ...overrides,
  }
}

describe('WeeklySummary', () => {
  it('returns null when no workouts in the week', () => {
    const { container } = render(
      <WeeklySummary workouts={[]} weekStart={WEEK_START} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when only workouts outside the week', () => {
    const { container } = render(
      <WeeklySummary
        workouts={[makeWorkout({ date: '2024-01-01' })]}
        weekStart={WEEK_START}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows completed workout count (excludes planned)', () => {
    const workouts = [
      makeWorkout({ date: '2024-06-10', planned: false }),
      makeWorkout({ date: '2024-06-11', planned: false }),
      makeWorkout({ date: '2024-06-12', planned: true }),
    ]
    render(<WeeklySummary workouts={workouts} weekStart={WEEK_START} />)
    // 2 completed workouts visible in the count
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows inline +N count when planned workouts exist', () => {
    const workouts = [
      makeWorkout({ date: '2024-06-10', planned: false }),
      makeWorkout({ date: '2024-06-11', planned: true }),
      makeWorkout({ date: '2024-06-12', planned: true }),
    ]
    render(<WeeklySummary workouts={workouts} weekStart={WEEK_START} />)
    // Component renders "+2" in a span alongside the completed count
    expect(screen.getByText((content) => content.trim() === '+2')).toBeInTheDocument()
  })

  it('sums TSS from completed workouts only', () => {
    const workouts = [
      makeWorkout({ date: '2024-06-10', tss: 80, planned: false }),
      makeWorkout({ date: '2024-06-11', tss: 999, planned: true }),
    ]
    render(<WeeklySummary workouts={workouts} weekStart={WEEK_START} />)
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()
  })

  it('shows sport breakdown row for sports with completed workouts', () => {
    const workouts = [
      makeWorkout({ type: 'run', date: '2024-06-10', planned: false }),
      makeWorkout({ type: 'swim', date: '2024-06-11', planned: false }),
    ]
    render(<WeeklySummary workouts={workouts} weekStart={WEEK_START} />)
    expect(screen.getAllByText(/Run/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Swim/i).length).toBeGreaterThan(0)
  })

  it('does not show sport row for sports with only planned workouts', () => {
    const workouts = [
      makeWorkout({ type: 'run', date: '2024-06-10', planned: false }),
      makeWorkout({ type: 'ride', date: '2024-06-11', planned: true }),
    ]
    render(<WeeklySummary workouts={workouts} weekStart={WEEK_START} />)
    expect(screen.getAllByText(/Run/i).length).toBeGreaterThan(0)
    // Ride is planned only — should not appear in sport stats
    expect(screen.queryByText('Ride')).not.toBeInTheDocument()
  })

  it('formats total duration correctly', () => {
    const workouts = [
      makeWorkout({ date: '2024-06-10', duration_minutes: 90, planned: false }),
    ]
    render(<WeeklySummary workouts={workouts} weekStart={WEEK_START} />)
    expect(screen.getAllByText('1h 30m').length).toBeGreaterThan(0)
  })
})
