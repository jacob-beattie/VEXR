import { useState, useRef } from 'react'
import { COLORS } from '../../lib/colors'
import type { TrainingPlan } from '../../types'
import { PlanCard } from './PlanCard'
import { ImportModal } from './ImportModal'
import { GeneratePlanModal } from './GeneratePlanModal'
import { useIsMobile } from '../../hooks/useIsMobile'

interface PlansPageProps {
  plans: TrainingPlan[]
  onRefresh: () => void
}

function EmptyState({ onImport, onGenerate }: { onImport: () => void; onGenerate: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 400, textAlign: 'center',
      animation: 'fadeSlideUp 0.4s ease',
    }}>
      {/* Pulsing double-ring icon */}
      <div style={{ position: 'relative', marginBottom: 28 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          border: `2px solid ${COLORS.accent}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse-ring 3s ease-in-out infinite',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: `${COLORS.accent}15`,
            border: `1px solid ${COLORS.accent}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
          }}>≡</div>
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>
        Your Training Plans
      </div>
      <div style={{
        fontSize: 14, color: COLORS.muted, marginBottom: 28,
        maxWidth: 280, lineHeight: 1.6,
      }}>
        Generate a personalised plan with AI, or import one from your coach.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="purple-glow-btn" onClick={onGenerate} style={{ padding: '13px 28px', fontSize: 14 }}>
          ✦ Generate Plan
        </button>
        <button
          onClick={onImport}
          style={{
            padding: '13px 28px', fontSize: 14, fontWeight: 700,
            background: 'transparent',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10, color: COLORS.muted, cursor: 'pointer',
            fontFamily: 'Inter, Helvetica Neue, sans-serif',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accent }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted }}
        >
          Import Plan
        </button>
      </div>
    </div>
  )
}

export function PlansPage({ plans, onRefresh }: PlansPageProps) {
  const [showImport, setShowImport] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  const handleImportSuccess = (message: string) => {
    onRefresh()
    showToast(message)
  }

  return (
    <div style={{ padding: isMobile ? '20px 16px' : '32px 36px' }}>
      {plans.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 28 }}>
          <button
            onClick={() => setShowImport(true)}
            style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              background: 'transparent', border: `1px solid ${COLORS.border}`,
              borderRadius: 8, color: COLORS.muted, cursor: 'pointer',
              fontFamily: 'Inter, Helvetica Neue, sans-serif', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.color = COLORS.accent }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted }}
          >
            Import Plan
          </button>
          <button
            className="purple-glow-btn"
            onClick={() => setShowGenerate(true)}
            style={{ padding: '10px 18px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            ✦ Generate Plan
          </button>
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState onImport={() => setShowImport(true)} onGenerate={() => setShowGenerate(true)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {plans.map(plan => (
            <PlanCard key={plan.id} plan={plan} onRefresh={onRefresh} onToast={showToast} />
          ))}
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImportSuccess={handleImportSuccess}
        />
      )}
      {showGenerate && (
        <GeneratePlanModal
          onClose={() => setShowGenerate(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {/* Success toast */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: 'fixed',
            bottom: isMobile ? 76 : 24,
            right: 24,
            zIndex: 300,
            background: COLORS.card,
            border: `1px solid ${COLORS.accent}60`,
            borderRadius: 10,
            padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            maxWidth: 360,
            animation: 'fadeSlideUp 0.25s ease',
          }}
        >
          <span style={{ fontSize: 14, color: COLORS.accent }}>✓</span>
          <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 600 }}>{toast}</span>
          <span style={{ fontSize: 16, color: COLORS.muted, marginLeft: 4 }}>×</span>
        </div>
      )}
    </div>
  )
}
