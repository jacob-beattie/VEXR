import { useState, useRef, useEffect } from 'react'
import { COLORS } from '../../lib/colors'
import type { TrainingPlan } from '../../types'
import { supabase } from '../../lib/supabase'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:   { bg: '#00e5ff20', color: '#00e5ff', label: 'Active' },
    complete: { bg: '#00e5ff18', color: '#00e5ff', label: 'Completed' },
    archived: { bg: '#ffffff0d', color: COLORS.muted, label: 'Archived' },
    upcoming: { bg: COLORS.subtle, color: COLORS.muted, label: 'Upcoming' },
  }
  const s = map[status] || map.archived
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 20,
      fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      fontFamily: 'DM Mono, monospace',
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

interface PlanCardProps {
  plan: TrainingPlan
  onRefresh: () => void
  onToast: (message: string) => void
}

function deriveCurrentWeek(plan: TrainingPlan): number {
  if (plan.status === 'complete') return plan.total_weeks
  if (!plan.start_date) return plan.current_week
  const daysSinceStart = (Date.now() - new Date(plan.start_date + 'T00:00:00Z').getTime()) / 86400000
  if (daysSinceStart < 0) return 0
  return Math.min(Math.floor(daysSinceStart / 7) + 1, plan.total_weeks)
}

export function PlanCard({ plan, onRefresh, onToast }: PlanCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentWeek = deriveCurrentWeek(plan)
  const pct = plan.total_weeks > 0 ? Math.round((currentWeek / plan.total_weeks) * 100) : 0
  const isComplete = plan.status === 'complete'
  const isArchived = plan.status === 'archived'

  // Close dropdown on outside click — must exclude both the trigger button and the dropdown itself
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insideButton = buttonRef.current?.contains(target)
      const insideMenu = menuRef.current?.contains(target)
      if (!insideButton && !insideMenu) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const openMenu = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setShowMenu(v => !v)
  }

  const setStatus = async (status: TrainingPlan['status']) => {
    setShowMenu(false)
    await supabase.from('training_plans').update({ status }).eq('id', plan.id)
    onRefresh()
  }

  const handleDeleteConfirm = async () => {
    setDeleting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Collect scheduled dates from this plan's sessions so we can remove calendar
      // entries that were imported without a plan_id (pre-migration imports).
      const { data: sessions } = await supabase
        .from('training_sessions')
        .select('scheduled_date')
        .eq('plan_id', plan.id)
        .not('scheduled_date', 'is', null)

      const dates = (sessions ?? []).map(s => (s as { scheduled_date: string }).scheduled_date).filter(Boolean)

      if (dates.length > 0) {
        await supabase
          .from('workouts')
          .delete()
          .eq('user_id', user.id)
          .eq('planned', true)
          .in('date', dates)
      }

      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', plan.id)
        .eq('user_id', user.id)

      if (error) throw error

      setShowDeleteConfirm(false)
      onRefresh()
      onToast('Plan deleted. All sessions have been removed from your calendar.')
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
        : 'Delete failed. Please try again.'
      onToast(`Error: ${msg}`)
    } finally {
      setDeleting(false)
    }
  }

  const accentBarStyle = plan.status === 'active'
    ? { background: COLORS.accent, opacity: 0.8 }
    : isComplete
      ? { background: COLORS.green, opacity: 0.8 }
      : { background: COLORS.subtle, opacity: 0.8 }

  const progressFillStyle = plan.status === 'active'
    ? { background: COLORS.accent, boxShadow: `0 0 8px ${COLORS.accent}90` }
    : isComplete
      ? { background: COLORS.green }
      : { background: isArchived ? COLORS.muted : COLORS.subtle }

  const menuItems: Array<{ label: string; action: () => void; danger?: boolean } | null> = [
    plan.status !== 'active'   ? { label: 'Set Active',    action: () => setStatus('active') }   : null,
    plan.status === 'active'   ? { label: 'Mark Complete', action: () => setStatus('complete') } : null,
    plan.status !== 'archived' ? { label: 'Archive',       action: () => setStatus('archived') } : null,
    null,
    { label: 'Delete', action: () => { setShowMenu(false); setShowDeleteConfirm(true) }, danger: true },
  ]

  const sessionCount = plan.total_sessions ?? 0

  return (
    <>
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: '22px 24px',
        position: 'relative',
        overflow: 'hidden',
        animation: 'fadeSlideUp 0.3s ease',
      }}>
        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          ...accentBarStyle,
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{plan.name}</span>
              <StatusBadge status={plan.status} />
            </div>

            {(plan.race_name || plan.race_date) && (
              <div style={{
                fontSize: 12, color: COLORS.amber, fontWeight: 600,
                marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ opacity: 0.7 }}>⬡</span>
                {[plan.race_name, plan.race_date].filter(Boolean).join(' · ')}
              </div>
            )}

            <div style={{ maxWidth: 320, marginBottom: 6 }}>
              <div style={{ background: COLORS.subtle, borderRadius: 4, height: 5, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  borderRadius: 4,
                  transition: 'width 0.4s ease',
                  ...progressFillStyle,
                }} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
              Week {currentWeek} of {plan.total_weeks} · {pct}% complete
            </div>
          </div>

          <button
            ref={buttonRef}
            onClick={openMenu}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: showMenu ? COLORS.text : COLORS.muted,
              padding: '4px 8px', borderRadius: 6,
              fontSize: 18, lineHeight: 1, flexShrink: 0,
            }}
          >⋯</button>
        </div>
      </div>

      {/* Dropdown */}
      {showMenu && (
        <div ref={menuRef} style={{
          position: 'fixed',
          top: menuPos.top,
          right: menuPos.right,
          zIndex: 400,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          padding: '6px 0',
          minWidth: 160,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'fadeSlideUp 0.15s ease',
        }}>
          {menuItems.map((item, i) =>
            item === null ? (
              <div key={i} style={{ height: 1, background: COLORS.border, margin: '4px 0' }} />
            ) : (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'block', width: '100%',
                  padding: '9px 16px',
                  background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500,
                  color: item.danger ? COLORS.orange : COLORS.text,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => e.target === e.currentTarget && !deleting && setShowDeleteConfirm(false)}
        >
          <div style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: '28px 32px',
            width: 420,
            maxWidth: 'calc(100vw - 40px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            animation: 'fadeSlideUp 0.2s ease',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text, marginBottom: 12 }}>
              Delete this plan?
            </div>
            <div style={{ fontSize: 13, color: COLORS.muted, lineHeight: 1.6, marginBottom: 28 }}>
              This will remove{' '}
              <span style={{ color: COLORS.text, fontWeight: 600 }}>
                all {sessionCount} imported session{sessionCount !== 1 ? 's' : ''}
              </span>{' '}
              from your calendar. This can't be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  padding: '10px 20px',
                  background: 'none',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  color: COLORS.muted,
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  padding: '10px 20px',
                  background: COLORS.orange,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13, fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
