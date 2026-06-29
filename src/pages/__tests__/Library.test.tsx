import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Library } from '../Library'

// Mock the child component to keep tests focused on Library's data-fetching logic
vi.mock('../../components/library/LibraryPage', () => ({
  LibraryPage: ({ items }: { items: { name: string }[] }) => (
    <div data-testid="library-page">
      {items.map(i => <div key={i.name}>{i.name}</div>)}
    </div>
  ),
}))

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function makeChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Library page', () => {
  it('shows loading state initially', () => {
    mockFrom.mockReturnValue(makeChain([], null))
    render(<Library />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders LibraryPage with fetched items', async () => {
    mockFrom.mockReturnValue(makeChain([{ name: 'Easy Run', type: 'run' }]))
    render(<Library />)
    await waitFor(() => expect(screen.getByTestId('library-page')).toBeInTheDocument())
    expect(screen.getByText('Easy Run')).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    mockFrom.mockReturnValue(makeChain(null, new Error('DB error')))
    render(<Library />)
    await waitFor(() => expect(screen.getByText('DB error')).toBeInTheDocument())
    expect(screen.queryByTestId('library-page')).not.toBeInTheDocument()
  })

  it('passes items as empty array when no data returned', async () => {
    mockFrom.mockReturnValue(makeChain(null, null))
    render(<Library />)
    await waitFor(() => expect(screen.getByTestId('library-page')).toBeInTheDocument())
  })
})
