import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RacePredictor } from '../RacePredictor'
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
