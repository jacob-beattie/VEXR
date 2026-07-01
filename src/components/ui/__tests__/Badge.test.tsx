import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, workoutTypes } from '../Badge'
import type { WorkoutType } from '../../../types'

const types: WorkoutType[] = ['run', 'ride', 'swim', 'strength', 'rest']

describe('Badge', () => {
  it.each(types)('renders the correct label for %s', (type) => {
    render(<Badge type={type} />)
    expect(screen.getByText(workoutTypes[type].label)).toBeInTheDocument()
  })

  it.each(types)('applies the correct text color for %s', (type) => {
    render(<Badge type={type} />)
    expect(screen.getByText(workoutTypes[type].label)).toHaveStyle({ color: workoutTypes[type].color })
  })

  it('renders as an inline span element', () => {
    const { container } = render(<Badge type="run" />)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })
})
