import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ResetPassword } from '../ResetPassword'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({ supabase: { auth: mockAuth } }))

function renderPage() {
  return render(<MemoryRouter><ResetPassword /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockAuth.updateUser.mockResolvedValue({ data: {}, error: null })
})

describe('ResetPassword page', () => {
  it('shows invalid link message when no session exists', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } })
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
    )
  })

  it('shows the password form when a valid session exists', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
    )
  })

  it('shows error when password is too short', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /update password/i }))

    const [pwInput] = screen.getAllByPlaceholderText(/••••••••/)
    await userEvent.type(pwInput, 'abc')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument()
    expect(mockAuth.updateUser).not.toHaveBeenCalled()
  })

  it('shows error when passwords do not match', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /update password/i }))

    const [pwInput, confirmInput] = screen.getAllByPlaceholderText(/••••••••/)
    await userEvent.type(pwInput, 'password123')
    await userEvent.type(confirmInput, 'differentpass')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
    expect(mockAuth.updateUser).not.toHaveBeenCalled()
  })

  it('calls updateUser with new password and shows success message', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /update password/i }))

    const [pwInput, confirmInput] = screen.getAllByPlaceholderText(/••••••••/)
    await userEvent.type(pwInput, 'newpassword123')
    await userEvent.type(confirmInput, 'newpassword123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() =>
      expect(screen.getByText(/password updated/i)).toBeInTheDocument()
    )
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
  })

  it('redirects to /login after success delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /update password/i }))

    const [pwInput, confirmInput] = screen.getAllByPlaceholderText(/••••••••/)
    await userEvent.type(pwInput, 'newpassword123')
    await userEvent.type(confirmInput, 'newpassword123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => screen.getByText(/password updated/i))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(mockNavigate).toHaveBeenCalledWith('/login')

    vi.useRealTimers()
  })

  it('shows error when updateUser fails', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: new Error('Token expired') })
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /update password/i }))

    const [pwInput, confirmInput] = screen.getAllByPlaceholderText(/••••••••/)
    await userEvent.type(pwInput, 'newpassword123')
    await userEvent.type(confirmInput, 'newpassword123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(screen.getByText('Token expired')).toBeInTheDocument())
  })
})
