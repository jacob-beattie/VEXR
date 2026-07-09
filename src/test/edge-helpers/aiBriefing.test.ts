/**
 * Tests for pure logic used by supabase/functions/ai-briefing/index.ts.
 * `pruneIds` mirrors briefing-pruning logic that's still inlined in the edge function
 * (Deno-global-free, but not yet worth its own _shared module for two lines of logic).
 * The CTL/ATL calculation is imported directly from `_shared/calculatePMC.ts`, which is
 * itself Deno-global-free, rather than duplicated here.
 */
import { describe, it, expect } from 'vitest'
import { calculatePMC } from '../../../supabase/functions/_shared/calculatePMC'

// ─── Pruning logic ────────────────────────────────────────────────────────────
// The edge function keeps only the 9 most recent briefings: it fetches all ordered
// by generated_at DESC and deletes everything from index 9 onward.

function pruneIds(briefings: { id: string; generated_at: string }[], max = 9): string[] {
  if (briefings.length <= max) return []
  return briefings.slice(max).map(r => r.id)
}

interface Workout {
  date: string
  tss: number | null
  planned: boolean
}

function calculateCTLATL(workouts: Workout[], today: Date): { ctl: number; atl: number; tsb: number } {
  return calculatePMC(workouts, today, today).current
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
