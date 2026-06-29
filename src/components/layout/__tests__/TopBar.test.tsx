import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopBar } from '../TopBar'

describe('TopBar', () => {
  it('renders the title', () => {
    render(<TopBar title="Analytics" />)
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<TopBar title="Dashboard" subtitle="This week" />)
    expect(screen.getByText('This week')).toBeInTheDocument()
  })

  it('does not render subtitle when not provided', () => {
    render(<TopBar title="Calendar" />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('renders titleIcon when provided', () => {
    render(<TopBar title="AI Coach" titleIcon="✦" />)
    expect(screen.getByText('✦')).toBeInTheDocument()
  })

  it('does not render titleIcon when not provided', () => {
    const { container } = render(<TopBar title="Plans" />)
    // No extra icon span rendered
    expect(container.querySelectorAll('span')).toHaveLength(0)
  })

  it('does not render hamburger menu button on desktop (isMobile=false)', () => {
    render(<TopBar title="Library" isMobile={false} />)
    expect(screen.queryByRole('button', { name: /open menu/i })).not.toBeInTheDocument()
  })

  it('renders hamburger menu button on mobile (isMobile=true)', () => {
    render(<TopBar title="Library" isMobile onMenuClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('calls onMenuClick when hamburger is clicked on mobile', async () => {
    const onMenuClick = vi.fn()
    render(<TopBar title="Library" isMobile onMenuClick={onMenuClick} />)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(onMenuClick).toHaveBeenCalledOnce()
  })
})
