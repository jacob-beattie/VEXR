import { Component, type ErrorInfo, type ReactNode } from 'react'
import { COLORS } from '../lib/colors'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: COLORS.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 40,
            maxWidth: 400,
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 28, lineHeight: 1.5 }}>
              An unexpected error occurred. Your data is safe — reload the page to continue.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: COLORS.accent,
                color: '#000',
                border: 'none',
                borderRadius: 8,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
