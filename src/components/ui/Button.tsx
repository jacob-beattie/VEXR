import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from '../../lib/colors'

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  style?: CSSProperties
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, style }: ButtonProps) {
  const base: CSSProperties = {
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 0.15s',
  }

  const variants: Record<string, CSSProperties> = {
    primary: { background: COLORS.accent, color: '#000' },
    secondary: {
      background: COLORS.surface,
      color: COLORS.text,
      border: `1px solid ${COLORS.border}`,
    },
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  )
}
