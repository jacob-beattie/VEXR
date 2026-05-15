import { describe, it, expect } from 'vitest'
import { paceToSeconds, secsToPaceStr, computeSimpleTSS, computeStructuredTSS } from '../tss'
import type { WorkoutBlock } from '../../types'

describe('paceToSeconds', () => {
  it('parses M:SS format', () => {
    expect(paceToSeconds('4:30')).toBe(270)
    expect(paceToSeconds('5:00')).toBe(300)
    expect(paceToSeconds('1:40')).toBe(100)
  })

  it('handles single-digit seconds', () => {
    expect(paceToSeconds('4:05')).toBe(245)
  })

  it('returns 0 for invalid input', () => {
    expect(paceToSeconds('')).toBe(0)
    expect(paceToSeconds('invalid')).toBe(0)
    expect(paceToSeconds('4')).toBe(0)
  })
})

describe('secsToPaceStr', () => {
  it('converts seconds to M:SS', () => {
    expect(secsToPaceStr(270)).toBe('4:30')
    expect(secsToPaceStr(300)).toBe('5:00')
    expect(secsToPaceStr(245)).toBe('4:05')
  })

  it('returns empty string for zero or negative', () => {
    expect(secsToPaceStr(0)).toBe('')
    expect(secsToPaceStr(-10)).toBe('')
  })

  it('round-trips with paceToSeconds', () => {
    expect(secsToPaceStr(paceToSeconds('4:45'))).toBe('4:45')
    expect(secsToPaceStr(paceToSeconds('5:30'))).toBe('5:30')
  })
})

describe('computeSimpleTSS — run', () => {
  it('calculates TSS=100 for 60min at threshold pace', () => {
    expect(computeSimpleTSS('run', 60, '4:30', 0, 0, 0, 0, '4:30', '')).toBe(100)
  })

  it('calculates TSS=81 for 60min at 5:00/km with 4:30 threshold (IF≈0.9)', () => {
    // IF = 270/300 = 0.9, TSS = 1 * 0.81 * 100 = 81
    expect(computeSimpleTSS('run', 60, '5:00', 0, 0, 0, 0, '4:30', '')).toBe(81)
  })

  it('returns 0 when pace is missing', () => {
    expect(computeSimpleTSS('run', 60, '', 0, 0, 0, 0, '4:30', '')).toBe(0)
    expect(computeSimpleTSS('run', 60, '5:00', 0, 0, 0, 0, '', '')).toBe(0)
  })

  it('scales linearly with duration', () => {
    const half = computeSimpleTSS('run', 30, '4:30', 0, 0, 0, 0, '4:30', '')
    const full = computeSimpleTSS('run', 60, '4:30', 0, 0, 0, 0, '4:30', '')
    expect(full).toBe(half * 2)
  })
})

describe('computeSimpleTSS — ride', () => {
  it('calculates TSS=100 for 60min at FTP', () => {
    expect(computeSimpleTSS('ride', 60, '', 200, 0, 0, 200, '', '')).toBe(100)
  })

  it('calculates TSS=81 for 60min at 90% FTP', () => {
    // IF = 180/200 = 0.9, TSS = 1 * 0.81 * 100 = 81
    expect(computeSimpleTSS('ride', 60, '', 180, 0, 0, 200, '', '')).toBe(81)
  })

  it('returns 0 when FTP or power is 0', () => {
    expect(computeSimpleTSS('ride', 60, '', 0, 0, 0, 200, '', '')).toBe(0)
    expect(computeSimpleTSS('ride', 60, '', 200, 0, 0, 0, '', '')).toBe(0)
  })
})

describe('computeSimpleTSS — swim', () => {
  it('calculates TSS=100 for 3600m in 60min with CSS=1:40/100m', () => {
    // avgPacePer100m = (60*60)/(3600/100) = 3600/36 = 100s = 1:40, IF=1.0
    expect(computeSimpleTSS('swim', 60, '', 0, 3600, 0, 0, '', '1:40')).toBe(100)
  })

  it('calculates lower TSS when swimming slower than CSS', () => {
    // 3000m in 60min → avgPacePer100m = 3600/30 = 120s = 2:00
    // CSS = 1:40 = 100s, IF = 100/120 ≈ 0.833, TSS ≈ 69
    const tss = computeSimpleTSS('swim', 60, '', 0, 3000, 0, 0, '', '1:40')
    expect(tss).toBe(69)
  })

  it('returns 0 when CSS or distance is missing', () => {
    expect(computeSimpleTSS('swim', 60, '', 0, 0, 0, 0, '', '1:40')).toBe(0)
    expect(computeSimpleTSS('swim', 60, '', 0, 3600, 0, 0, '', '')).toBe(0)
  })
})

describe('computeSimpleTSS — strength/rest', () => {
  it('calculates TSS from duration × RPE × 0.5', () => {
    expect(computeSimpleTSS('strength', 60, '', 0, 0, 5, 0, '', '')).toBe(150)
    expect(computeSimpleTSS('rest', 30, '', 0, 0, 4, 0, '', '')).toBe(60)
  })
})

describe('computeStructuredTSS', () => {
  const block = (durationMinutes: number, reps: number, intensity: string): WorkoutBlock => ({
    id: 'test',
    blockType: 'interval',
    durationMinutes,
    reps,
    intensity,
    notes: '',
  })

  it('calculates TSS for a single ride block at FTP (IF=1.0)', () => {
    // 60min × 1 rep at 100% = TSS 100
    expect(computeStructuredTSS([block(60, 1, '100')], 'ride', '')).toBe(100)
  })

  it('calculates TSS for ride block at 80% FTP', () => {
    // 60min × 1 rep at 80% → IF=0.8, TSS = 1 * 0.64 * 100 = 64
    expect(computeStructuredTSS([block(60, 1, '80')], 'ride', '')).toBe(64)
  })

  it('multiplies reps into duration', () => {
    // 10min × 3 reps = 30min effective; at 100% = TSS 50
    expect(computeStructuredTSS([block(10, 3, '100')], 'ride', '')).toBe(50)
  })

  it('sums TSS across multiple blocks', () => {
    const warmup = block(10, 1, '60')  // 10min at 60% → IF=0.6, TSS ≈ 6
    const main = block(30, 1, '90')   // 30min at 90% → IF=0.9, TSS ≈ 41
    const total = computeStructuredTSS([warmup, main], 'ride', '')
    expect(total).toBe(
      computeStructuredTSS([warmup], 'ride', '') + computeStructuredTSS([main], 'ride', '')
    )
  })

  it('calculates run block TSS from pace vs threshold', () => {
    // 60min at 4:30 with 4:30 threshold → IF=1.0, TSS=100
    expect(computeStructuredTSS([block(60, 1, '4:30')], 'run', '4:30')).toBe(100)
  })
})
