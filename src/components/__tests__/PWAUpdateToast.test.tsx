import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PWAUpdateToast } from '../PWAUpdateToast'

const mockSetNeedRefresh = vi.fn()
const mockUpdateServiceWorker = vi.fn()
let mockNeedRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [mockNeedRefresh, mockSetNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: mockUpdateServiceWorker,
  }),
}))

beforeEach(() => {
  mockNeedRefresh = false
  mockSetNeedRefresh.mockClear()
  mockUpdateServiceWorker.mockClear()
})

describe('PWAUpdateToast', () => {
  it('renders nothing when no update is available', () => {
    const { container } = render(<PWAUpdateToast />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the toast when an update is available', () => {
    mockNeedRefresh = true
    render(<PWAUpdateToast />)
    expect(screen.getByText(/new version of Vexr/i)).toBeInTheDocument()
  })

  it('calls updateServiceWorker when "Refresh" is clicked', async () => {
    mockNeedRefresh = true
    const user = userEvent.setup()
    render(<PWAUpdateToast />)
    await user.click(screen.getByRole('button', { name: /refresh/i }))
    expect(mockUpdateServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('dismisses without updating when "Later" is clicked', async () => {
    mockNeedRefresh = true
    const user = userEvent.setup()
    render(<PWAUpdateToast />)
    await user.click(screen.getByRole('button', { name: /later/i }))
    expect(mockSetNeedRefresh).toHaveBeenCalledWith(false)
    expect(mockUpdateServiceWorker).not.toHaveBeenCalled()
  })
})
