/**
 * Tests for pure logic extracted from supabase/functions/ai-briefing/index.ts.
 * These functions are duplicated here (not imported) because the edge function uses
 * Deno globals. The tests validate the logic is correct and guard against regressions.
 */
import { describe, it, expect } from 'vitest'

// ─── Pruning logic ────────────────────────────────────────────────────────────
// The edge function keeps only the 9 most recent briefings: it fetches all ordered
// by generated_at DESC and deletes everything from index 9 onward.

function pruneIds(briefings: { id: string; generated_at: string }[], max = 9): string[] {
  if (briefings.length <= max) return []
  return briefings.slice(max).map(r => r.id)
}

// ─── CTL/ATL calculation (mirrors calculateMetrics.ts) ────────────────────────

const CTL_K = 1 - Math.exp(-1 / 42)
const ATL_K = 1 - Math.exp(-1 / 7)

interface Workout {
  date: string
  tss: number | null
  planned: boolean
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calculateCTLATL(workouts: Workout[], today: Date): { ctl: number; atl: number; tsb: number } {
  const tssByDay: Record<string, number> = {}
  for (const w of workouts) {
    if (w.planned) continue
    const key = w.date.split('T')[0]
    tssByDay[key] = (tssByDay[key] || 0) + (w.tss || 0)
  }

  const allDates = Object.keys(tssByDay).sort()
  if (allDates.length === 0) return { ctl: 0, atl: 0, tsb: 0 }

  const warmupStart = new Date(allDates[0] + 'T00:00:00')
  let ctl = 0
  let atl = 0
  const totalDays = Math.round((today.getTime() - warmupStart.getTime()) / 86400000)

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(warmupStart.getTime() + i * 86400000)
    const key = localDateKey(d)
    const tss = tssByDay[key] || 0
    ctl = ctl + CTL_K * (tss - ctl)
    atl = atl + ATL_K * (tss - atl)
  }

  return {
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(ctl - atl),
  }
}

// ─── Tests: pruneIds ──────────────────────────────────────────────────────────

describe('briefing pruning', () => {
  function makeBriefings(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `b${i}`,
      generated_at: new Date(Date.now() - i * 86400000).toISOString(),
    }))
  }

  it('returns empty array when at or below the 9-briefing limit', () => {
    expect(pruneIds(makeBriefings(9))).toEqual([])
    expect(pruneIds(makeBriefings(5))).toEqual([])
    expect(pruneIds(makeBriefings(0))).toEqual([])
  })

  it('returns ids of briefings beyond the 9th', () => {
    const briefings = makeBriefings(11) // indices 0-10
    const toDelete = pruneIds(briefings)
    expect(toDelete).toEqual(['b9', 'b10'])
    expect(toDelete).toHaveLength(2)
  })

  it('keeps exactly 9 when 10 exist', () => {
    const toDelete = pruneIds(makeBriefings(10))
    expect(toDelete).toEqual(['b9'])
    expect(toDelete).toHaveLength(1)
  })

  it('respects custom max value', () => {
    const briefings = makeBriefings(5)
    expect(pruneIds(briefings, 3)).toEqual(['b3', 'b4'])
  })
})

// ─── Tests: calculateCTLATL ───────────────────────────────────────────────────

describe('edge function CTL/ATL calculation', () => {
  it('returns zeros when no workouts', () => {
    const result = calculateCTLATL([], new Date('2024-06-01'))
    expect(result).toEqual({ ctl: 0, atl: 0, tsb: 0 })
  })

  it('TSB is approximately CTL minus ATL (rounding within ±1)', () => {
    // Each of ctl/atl/tsb is independently rounded, so TSB may differ by ±1
    const workouts: Workout[] = [
      { date: '2024-01-01', tss: 100, planned: false },
      { date: '2024-01-08', tss: 80, planned: false },
    ]
    const result = calculateCTLATL(workouts, new Date('2024-02-01'))
    expect(Math.abs(result.tsb - (result.ctl - result.atl))).toBeLessThanOrEqual(1)
  })

  it('excludes planned workouts', () => {
    const actual: Workout[] = [{ date: '2024-01-01', tss: 100, planned: false }]
    const planned: Workout[] = [{ date: '2024-01-01', tss: 9999, planned: true }]
    const r1 = calculateCTLATL(actual, new Date('2024-01-15'))
    const r2 = calculateCTLATL([...actual, ...planned], new Date('2024-01-15'))
    expect(r1).toEqual(r2)
  })

  it('ATL responds faster than CTL to a high-TSS day', () => {
    const workouts: Workout[] = [{ date: '2024-01-01', tss: 300, planned: false }]
    const result = calculateCTLATL(workouts, new Date('2024-01-01'))
    expect(result.atl).toBeGreaterThan(result.ctl)
  })

  it('CTL and ATL converge toward 0 after extended rest', () => {
    const workouts: Workout[] = [{ date: '2023-01-01', tss: 200, planned: false }]
    const result = calculateCTLATL(workouts, new Date('2023-07-01'))
    expect(result.ctl).toBeLessThan(1)
    expect(result.atl).toBe(0)
  })
})
