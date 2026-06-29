import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Login } from '../Login'

const mockNavigate = vi.fn()
const mockSignIn = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('../../lib/supabase', () => ({ supabase: { auth: mockAuth } }))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn: mockSignIn,
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}))

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null })
})

describe('Login page — sign in form', () => {
  it('renders email and password fields', () => {
    renderLogin()
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument()
  })

  it('renders the sign in button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls signIn with entered credentials and navigates on success', async () => {
    mockSignIn.mockResolvedValue(undefined)
    renderLogin()

    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'test@example.com')
    await userEvent.type(screen.getByPlaceholderText(/••••••••/), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('shows error message when signIn throws', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'))
    renderLogin()

    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'bad@example.com')
    await userEvent.type(screen.getByPlaceholderText(/••••••••/), 'wrongpassword')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('has a link to the signup page', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup')
  })
})

describe('Login page — forgot password', () => {
  it('shows the forgot password button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument()
  })

  it('toggles to reset password form when "Forgot password?" is clicked', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText('Reset password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('calls resetPasswordForEmail and shows success message', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))

    const emailInput = screen.getByPlaceholderText(/you@example\.com/i)
    await userEvent.type(emailInput, 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument())
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining('reset-password') })
    )
  })

  it('shows error when resetPasswordForEmail fails', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: new Error('User not found') })
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))

    const emailInput = screen.getByPlaceholderText(/you@example\.com/i)
    await userEvent.type(emailInput, 'nobody@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => expect(screen.getByText('User not found')).toBeInTheDocument())
  })

  it('"Back to sign in" returns to login form', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText('Reset password')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
  })
})
