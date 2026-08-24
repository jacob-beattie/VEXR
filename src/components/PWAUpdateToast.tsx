import { COLORS } from '../lib/colors'
import { RADIUS, SHADOW } from '../lib/designTokens'
import { usePWAUpdate } from '../hooks/usePWAUpdate'
import { Button } from './ui/Button'

export function PWAUpdateToast() {
  const { needRefresh, update, dismiss } = usePWAUpdate()

  if (!needRefresh) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.card,
        boxShadow: SHADOW.dropdown,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 600 }}>
        A new version of Vexr is available.
      </span>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button variant="secondary" onClick={dismiss}>Later</Button>
        <Button variant="primary" onClick={update}>Refresh</Button>
      </div>
    </div>
  )
}
