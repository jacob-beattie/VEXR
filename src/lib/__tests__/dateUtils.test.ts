import { describe, it, expect } from 'vitest'
import { getWeekStart, getWeekEnd } from '../dateUtils'

describe('getWeekStart', () => {
  it('returns the same Monday for every day in that week', () => {
    // Mon 2024-01-01 through Sun 2024-01-07
    const monday = new Date('2024-01-01T12:00:00')
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const start = getWeekStart(d)
      expect(start.getFullYear()).toBe(2024)
      expect(start.getMonth()).toBe(0)
      expect(start.getDate()).toBe(1)
      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
      expect(start.getMilliseconds()).toBe(0)
    }
  })

  it('handles a Sunday correctly (getDay() === 0 edge case)', () => {
    const sunday = new Date('2024-01-07T18:30:00')
    const start = getWeekStart(sunday)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(0)
  })

  it('does not mutate the input date', () => {
    const input = new Date('2024-01-03T15:00:00')
    const before = input.getTime()
    getWeekStart(input)
    expect(input.getTime()).toBe(before)
  })
})

describe('getWeekEnd', () => {
  it('returns the Sunday 23:59:59.999 of the same week as getWeekStart', () => {
    const wednesday = new Date('2024-01-03T09:00:00')
    const end = getWeekEnd(wednesday)
    expect(end.getFullYear()).toBe(2024)
    expect(end.getMonth()).toBe(0)
    expect(end.getDate()).toBe(7)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
  })

  it('is always 6 days + 23:59:59.999 after getWeekStart for the same date', () => {
    const d = new Date('2024-06-15T00:00:00')
    const start = getWeekStart(d)
    const end = getWeekEnd(d)
    const diffMs = end.getTime() - start.getTime()
    expect(diffMs).toBe(6 * 86400000 + (24 * 3600000 - 1))
  })
})
