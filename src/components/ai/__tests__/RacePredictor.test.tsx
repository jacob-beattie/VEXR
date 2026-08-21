import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RacePredictor } from '../RacePredictor'
import {
  parsePace,
  fmtTime,
  fmtPace,
  fmtPace100m,
  calcRunRows,
  bikeSpeedKmh,
  calcBikeRows,
  calcSwimRows,
  calcTriRows,
  metricsDrift,
} from '../racePredictorMath'
import type { Profile } from '../../../types'

vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: mockAuth },
}))

// Suppress narrative fetch — tests don't need AI text
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: false,
  json: async () => ({ error: 'mocked' }),
}))

// Suppress localStorage for narrative cache
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
})

const triathlete: Profile = {
  id: 'user-1',
  name: 'Jacob',
  sport: 'triathlon',
  ftp: 250,
  run_pace: '4:30',
  css: '1:40',
}

const runner: Profile = {
  id: 'user-2',
  name: 'Runner',
  sport: 'running',
  ftp: 0,
  run_pace: '4:30',
  css: '',
}

const cyclist: Profile = {
  id: 'user-3',
  name: 'Cyclist',
  sport: 'cycling',
  ftp: 300,
  run_pace: '',
  css: '',
}

const swimmer: Profile = {
  id: 'user-4',
  name: 'Swimmer',
  sport: 'swimming',
  ftp: 0,
  run_pace: '',
  css: '1:40',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RacePredictor — sport tabs', () => {
  it('defaults to the running tab for a runner profile', () => {
    render(<RacePredictor profile={runner} ctl={40} />)
    // Running prediction rows should be visible
    expect(screen.getByText('5K')).toBeInTheDocument()
    expect(screen.getByText('10K')).toBeInTheDocument()
    expect(screen.getByText('Half Marathon')).toBeInTheDocument()
    expect(screen.getByText('Marathon')).toBeInTheDocument()
  })

  it('defaults to the cycling tab for a cycling profile', () => {
    render(<RacePredictor profile={cyclist} ctl={50} />)
    expect(screen.getByText('40K TT')).toBeInTheDocument()
    expect(screen.getByText('100K')).toBeInTheDocument()
  })

  it('defaults to the swimming tab for a swimmer profile', () => {
    render(<RacePredictor profile={swimmer} ctl={30} />)
    expect(screen.getByText('400m')).toBeInTheDocument()
    expect(screen.getByText('1500m')).toBeInTheDocument()
  })

  it('defaults to the triathlon tab for a triathlete profile', () => {
    render(<RacePredictor profile={triathlete} ctl={60} />)
    expect(screen.getByText('Sprint')).toBeInTheDocument()
    expect(screen.getByText('Olympic')).toBeInTheDocument()
    expect(screen.getByText('Ironman 70.3')).toBeInTheDocument()
    expect(screen.getByText('Ironman')).toBeInTheDocument()
  })

  it('switches to cycling tab when clicked', async () => {
    // triathlete has FTP so cycling rows will render
    render(<RacePredictor profile={triathlete} ctl={40} />)
    await userEvent.click(screen.getByRole('button', { name: /cycling/i }))
    await waitFor(() => expect(screen.getByText('40K TT')).toBeInTheDocument())
  })

  it('switches to triathlon tab when clicked', async () => {
    // triathlete has all values so tri rows render
    render(<RacePredictor profile={triathlete} ctl={40} />)
    await userEvent.click(screen.getByRole('button', { name: /running/i }))
    await waitFor(() => screen.getByText('5K'))
    await userEvent.click(screen.getByRole('button', { name: /triathlon/i }))
    await waitFor(() => expect(screen.getByText('Sprint')).toBeInTheDocument())
  })
})

describe('RacePredictor — running predictions', () => {
  it('renders 4 race distance rows', () => {
    render(<RacePredictor profile={runner} ctl={40} />)
    const rows = ['5K', '10K', 'Half Marathon', 'Marathon']
    rows.forEach(r => expect(screen.getByText(r)).toBeInTheDocument())
  })

  it('shows missing data message when run_pace is not set', () => {
    const noRunPace = { ...runner, run_pace: '' }
    render(<RacePredictor profile={noRunPace} ctl={40} />)
    expect(screen.getByText(/threshold pace/i)).toBeInTheDocument()
  })
})

describe('RacePredictor — cycling predictions', () => {
  it('renders 3 distance rows', async () => {
    render(<RacePredictor profile={cyclist} ctl={50} />)
    expect(screen.getByText('40K TT')).toBeInTheDocument()
    expect(screen.getByText('100K')).toBeInTheDocument()
    expect(screen.getByText('Gran Fondo (160K)')).toBeInTheDocument()
  })

  it('shows missing data message when FTP is 0', async () => {
    const noFtp = { ...cyclist, ftp: 0 }
    render(<RacePredictor profile={noFtp} ctl={50} />)
    expect(screen.getByText(/ftp/i)).toBeInTheDocument()
  })
})

describe('RacePredictor — swimming predictions', () => {
  it('renders 4 distance rows', () => {
    render(<RacePredictor profile={swimmer} ctl={30} />)
    expect(screen.getByText('400m')).toBeInTheDocument()
    expect(screen.getByText('1500m')).toBeInTheDocument()
    expect(screen.getByText(/1900m/i)).toBeInTheDocument()
    expect(screen.getByText(/3800m/i)).toBeInTheDocument()
  })

  it('shows missing data message when CSS is not set', () => {
    const noCss = { ...swimmer, css: '' }
    render(<RacePredictor profile={noCss} ctl={30} />)
    expect(screen.getByText(/css/i)).toBeInTheDocument()
  })
})

describe('RacePredictor — triathlon predictions', () => {
  it('renders 4 race formats', () => {
    render(<RacePredictor profile={triathlete} ctl={60} />)
    expect(screen.getByText('Sprint')).toBeInTheDocument()
    expect(screen.getByText('Olympic')).toBeInTheDocument()
    expect(screen.getByText('Ironman 70.3')).toBeInTheDocument()
    expect(screen.getByText('Ironman')).toBeInTheDocument()
  })

  it('shows split bar labels (Swim/T1/Bike/T2/Run) for each race', () => {
    render(<RacePredictor profile={triathlete} ctl={60} />)
    expect(screen.getAllByText('Swim').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bike').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Run').length).toBeGreaterThan(0)
  })
})

describe('RacePredictor — CTL warning', () => {
  it('shows low CTL warning when ctl < 10', () => {
    render(<RacePredictor profile={runner} ctl={5} />)
    expect(screen.getByText(/log more workouts/i)).toBeInTheDocument()
  })

  it('does not show CTL warning when ctl >= 10', () => {
    render(<RacePredictor profile={runner} ctl={40} />)
    expect(screen.queryByText(/log more workouts/i)).not.toBeInTheDocument()
  })
})

// ─── Formula correctness ────────────────────────────────────────────────────
//
// The tab-rendering tests above only prove a label appears — none of them
// checked a predicted time value. These exact expected values were computed
// independently outside this file (same Riegel/FTP-cube/CSS-IF formulas,
// hand-verified against the documented model in CLAUDE.md), not by re-running
// calcRunRows/calcBikeRows/etc. themselves — so a sign error, unit mixup, or
// wrong exponent in the real function would actually fail these.

describe('parsePace / fmtTime / fmtPace / fmtPace100m', () => {
  it('parses M:SS into total seconds', () => {
    expect(parsePace('4:30')).toBe(270)
    expect(parsePace('1:05')).toBe(65)
  })

  it('returns null for a malformed pace string', () => {
    expect(parsePace('bad')).toBeNull()
    expect(parsePace('1:2:3')).toBeNull()
  })

  it('formats seconds as h:mm:ss or m:ss', () => {
    expect(fmtTime(90)).toBe('1:30')
    expect(fmtTime(3661)).toBe('1:01:01')
  })

  it('does not roll a rounded value over to ":60" (regression: independent floor/round per unit)', () => {
    // 239.99999999999997 is what 240 * 21.0975 / 21.0975 actually evaluates
    // to in floating point — rounding minutes and seconds independently
    // produced "3:60" instead of "4:00" here before the fix.
    expect(fmtTime(239.99999999999997)).toBe('4:00')
    expect(fmtPace(239.99999999999997)).toBe('4:00/km')
    expect(fmtPace100m(239.99999999999997)).toBe('4:00/100m')
  })

  it('formats pace with /km and /100m suffixes', () => {
    expect(fmtPace(220)).toBe('3:40/km')
    expect(fmtPace100m(96)).toBe('1:36/100m')
  })
})

describe('calcRunRows — Riegel formula, exact values', () => {
  it('produces the exact hand-computed times at ctl=30 (neutral CTL factor)', () => {
    const rows = calcRunRows('4:00', 30)
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))

    expect(fmtTime(byName['5K'].totalSeconds)).toBe('18:21')
    expect(fmtTime(byName['10K'].totalSeconds)).toBe('38:15')
    expect(fmtTime(byName['Half Marathon'].totalSeconds)).toBe('1:24:23')
    expect(fmtTime(byName['Marathon'].totalSeconds)).toBe('2:55:57')
  })

  it('the Half Marathon row round-trips to exactly the input threshold pace', () => {
    // HM is the Riegel anchor distance (T1) — its predicted pace must equal
    // the athlete's raw threshold pace, not just "close to" it.
    const rows = calcRunRows('4:00', 30)
    const hm = rows.find(r => r.name === 'Half Marathon')!
    expect(fmtPace(hm.paceSecondsPerKm)).toBe('4:00/km')
  })

  it('predicts a slower marathon pace than 5K pace (Riegel fatigue exponent)', () => {
    const rows = calcRunRows('4:00', 30)
    const fiveK = rows.find(r => r.name === '5K')!
    const marathon = rows.find(r => r.name === 'Marathon')!
    expect(marathon.paceSecondsPerKm).toBeGreaterThan(fiveK.paceSecondsPerKm)
  })

  it('caps the CTL adjustment at +5% for very low CTL', () => {
    const rows = calcRunRows('4:00', -1000)
    expect(fmtTime(rows.find(r => r.name === 'Half Marathon')!.totalSeconds)).toBe('1:28:37')
  })

  it('caps the CTL adjustment at -5% for very high CTL', () => {
    const rows = calcRunRows('4:00', 1000)
    expect(fmtTime(rows.find(r => r.name === 'Half Marathon')!.totalSeconds)).toBe('1:20:10')
  })

  it('returns an empty array for an unset/malformed pace', () => {
    expect(calcRunRows('', 30)).toEqual([])
    expect(calcRunRows('not-a-pace', 30)).toEqual([])
  })
})

describe('bikeSpeedKmh / calcBikeRows — FTP cube-root speed model, exact values', () => {
  it('computes the exact hand-verified speed for a given power', () => {
    expect(bikeSpeedKmh(263)).toBeCloseTo(37.166, 2)
  })

  it('produces the exact hand-computed times/power/speed at ctl=30 (neutral factor)', () => {
    const rows = calcBikeRows(250, 30)
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))

    expect(byName['40K TT'].avgPowerW).toBe(263)
    expect(fmtTime(byName['40K TT'].totalSeconds)).toBe('1:04:34')

    expect(byName['100K'].avgPowerW).toBe(205)
    expect(fmtTime(byName['100K'].totalSeconds)).toBe('2:55:25')

    expect(byName['Gran Fondo (160K)'].avgPowerW).toBe(188)
    expect(fmtTime(byName['Gran Fondo (160K)'].totalSeconds)).toBe('4:48:53')
  })

  it('predicts higher average power for the shorter, higher-intensity distance', () => {
    const rows = calcBikeRows(250, 30)
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))
    expect(byName['40K TT'].avgPowerW).toBeGreaterThan(byName['100K'].avgPowerW)
    expect(byName['100K'].avgPowerW).toBeGreaterThan(byName['Gran Fondo (160K)'].avgPowerW)
  })
})

describe('calcSwimRows — CSS/IF model, exact values', () => {
  it('produces the exact hand-computed times at css=1:30', () => {
    const rows = calcSwimRows('1:30')
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))

    expect(fmtTime(byName['400m'].totalSeconds)).toBe('5:43')
    expect(fmtTime(byName['1500m'].totalSeconds)).toBe('23:12')
    expect(fmtTime(byName['1900m (70.3 swim)'].totalSeconds)).toBe('30:19')
    expect(fmtTime(byName['3800m (Ironman swim)'].totalSeconds)).toBe('1:03:20')
  })

  it('returns an empty array for an unset/malformed CSS', () => {
    expect(calcSwimRows('')).toEqual([])
    expect(calcSwimRows('nope')).toEqual([])
  })
})

describe('calcTriRows — composite model, exact values', () => {
  it('produces the exact hand-computed splits and total at ctl=30', () => {
    const rows = calcTriRows(250, '1:30', '4:00', 30)!
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))

    expect(fmtTime(byName['Sprint'].totalSec)).toBe('1:08:15')
    expect(fmtTime(byName['Olympic'].totalSec)).toBe('2:15:37')
    expect(fmtTime(byName['Ironman 70.3'].totalSec)).toBe('4:48:09')
    expect(fmtTime(byName['Ironman'].totalSec)).toBe('10:04:07')
  })

  it('total equals the sum of swim + t1 + bike + t2 + run for every race', () => {
    const rows = calcTriRows(250, '1:30', '4:00', 30)!
    for (const r of rows) {
      expect(r.totalSec).toBeCloseTo(r.swimSec + r.t1Sec + r.bikeSec + r.t2Sec + r.runSec, 6)
    }
  })

  it('returns null when any required input is missing', () => {
    expect(calcTriRows(0, '1:30', '4:00', 30)).toBeNull()
    expect(calcTriRows(250, '', '4:00', 30)).toBeNull()
    expect(calcTriRows(250, '1:30', '', 30)).toBeNull()
  })
})

describe('metricsDrift', () => {
  const cached = { narrative: '', generatedAt: Date.now(), ctl: 50, ftp: 250, runPace: '4:00', css: '1:30' }

  it('is false when nothing has changed', () => {
    expect(metricsDrift(cached, 50, 250, '4:00', '1:30')).toBe(false)
  })

  it('is true when CTL drifts by more than 5%', () => {
    expect(metricsDrift(cached, 53, 250, '4:00', '1:30')).toBe(true)
  })

  it('is false when CTL drifts by less than 5%', () => {
    expect(metricsDrift(cached, 52, 250, '4:00', '1:30')).toBe(false)
  })

  it('is true when run pace or CSS changes at all (no tolerance)', () => {
    expect(metricsDrift(cached, 50, 250, '3:59', '1:30')).toBe(true)
    expect(metricsDrift(cached, 50, 250, '4:00', '1:29')).toBe(true)
  })
})
