import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Signup } from '../Signup'

const mockNavigate = vi.fn()
const mockSignUp = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn: vi.fn(),
    signUp: mockSignUp,
    signOut: vi.fn(),
  }),
}))

function renderSignup() {
  return render(<MemoryRouter><Signup /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Signup page', () => {
  it('renders name, email, and password fields', () => {
    renderSignup()
    expect(screen.getByPlaceholderText(/jake davis/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/min\. 6 characters/i)).toBeInTheDocument()
  })

  it('renders the create account button', () => {
    renderSignup()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('calls signUp with name, email, and password', async () => {
    mockSignUp.mockResolvedValue(undefined)
    renderSignup()

    await userEvent.type(screen.getByPlaceholderText(/jake davis/i), 'Jacob')
    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'jacob@example.com')
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('jacob@example.com', 'password123', 'Jacob'))
  })

  it('shows success screen after signup', async () => {
    mockSignUp.mockResolvedValue(undefined)
    renderSignup()

    await userEvent.type(screen.getByPlaceholderText(/jake davis/i), 'Jacob')
    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'jacob@example.com')
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(screen.getByText('Account created!')).toBeInTheDocument())
  })

  it('redirects to /onboarding after the success delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSignUp.mockResolvedValue(undefined)
    renderSignup()

    await userEvent.type(screen.getByPlaceholderText(/jake davis/i), 'Jacob')
    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'jacob@example.com')
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(screen.getByText('Account created!')).toBeInTheDocument())

    await act(async () => { vi.advanceTimersByTime(1600) })
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding')

    vi.useRealTimers()
  })

  it('shows error when password is too short (client-side validation)', async () => {
    renderSignup()

    await userEvent.type(screen.getByPlaceholderText(/jake davis/i), 'Jacob')
    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'jacob@example.com')
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), 'abc')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('shows error when signUp throws', async () => {
    mockSignUp.mockRejectedValue(new Error('Email already in use'))
    renderSignup()

    await userEvent.type(screen.getByPlaceholderText(/jake davis/i), 'Jacob')
    await userEvent.type(screen.getByPlaceholderText(/you@example\.com/i), 'taken@example.com')
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(screen.getByText('Email already in use')).toBeInTheDocument())
  })

  it('has a link to the login page', () => {
    renderSignup()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})
