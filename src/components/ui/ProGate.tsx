import { useNavigate } from 'react-router-dom'
import { COLORS } from '../../lib/colors'
import { useSubscription } from '../../hooks/useSubscription'
import type { ReactNode } from 'react'

interface ProGateProps {
  feature: string
  description: string
  children: ReactNode
}

export function ProGate({ feature, description, children }: ProGateProps) {
  const { isPro } = useSubscription()
  const navigate = useNavigate()

  if (isPro) return <>{children}</>

  return (
    <div style={{ position: 'relative' }}>
      {/* Blurred preview */}
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.4, maxHeight: '60vh', overflow: 'hidden' }}>
        {children}
      </div>

      {/* Lock overlay — fixed so it stays centered in the viewport regardless of page height */}
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        <div style={{
          pointerEvents: 'auto',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: '32px 40px',
          textAlign: 'center',
          maxWidth: 360,
          boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>
            {feature}
          </div>
          <div style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.6, marginBottom: 24 }}>
            {description}
          </div>
          <button
            onClick={() => navigate('/upgrade')}
            style={{
              padding: '12px 28px',
              background: COLORS.accent,
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#0284c7')}
            onMouseLeave={e => (e.currentTarget.style.background = COLORS.accent)}
          >
            Upgrade to Pro
          </button>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 12 }}>
            Unlock all features for $9/mo
          </div>
        </div>
      </div>
    </div>
  )
}
