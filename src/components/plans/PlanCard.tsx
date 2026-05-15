import { useState, useRef, useEffect } from 'react'
import { COLORS } from '../../lib/colors'
import type { TrainingPlan } from '../../types'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

const SPORT_COLORS: Record<string, string> = {
  swim:  '#0369a1',
  bike:  '#6d28d9',
  run:   '#15803d',
  sc:    '#b45309',
  brick: '#d97706',
  other: COLORS.muted,
}

const SPORT_LABELS: Record<string, string> = {
  swim: 'Swim', bike: 'Bike', run: 'Run',
  sc: 'S&C', brick: 'Brick', other: 'Other',
}

const SPORT_TABS = [
  { key: 'all',   label: 'All' },
  { key: 'swim',  label: 'Swim' },
  { key: 'bike',  label: 'Bike' },
  { key: 'run',   label: 'Run' },
  { key: 'sc',    label: 'S&C' },
  { key: 'brick', label: 'Brick' },
]

interface TrainingSession {
  id: string
  week_number: number
  sport: string
  title: string
  scheduled_date: string | null
  duration_min: number | null
  target_metric: string | null
  status: string
}

function formatDuration(min: number | null): string {
  if (!min) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:   { bg: COLORS.accentDim, color: COLORS.accent, label: 'Active' },
    complete: { bg: COLORS.accentDim, color: COLORS.accent, label: 'Completed' },
    archived: { bg: COLORS.subtle, color: COLORS.muted, label: 'Archived' },
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

function PlanSessionsView({ planId, isMobile }: { planId: string; isMobile: boolean }) {
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [sportFilter, setSportFilter] = useState('all')
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({})

  useEffect(() => {
    supabase
      .from('training_sessions')
      .select('id, week_number, sport, title, scheduled_date, duration_min, target_metric, status')
      .eq('plan_id', planId)
      .order('week_number', { ascending: true })
      .then(({ data }) => {
        const rows = (data || []) as TrainingSession[]
        setSessions(rows)
        const weeks = [...new Set(rows.map(s => s.week_number))].sort((a, b) => a - b)
        // Open first week by default
        if (weeks.length > 0) setOpenWeeks({ [weeks[0]]: true })
        setLoading(false)
      })
  }, [planId])

  const filtered = sportFilter === 'all' ? sessions : sessions.filter(s => s.sport === sportFilter)
  const weeks = [...new Set(sessions.map(s => s.week_number))].sort((a, b) => a - b)

  const toggleWeek = (w: number) => setOpenWeeks(prev => ({ ...prev, [w]: !prev[w] }))

  if (loading) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>
        Loading sessions…
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '16px 0', textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>
        No sessions found.
      </div>
    )
  }

  const presentSportTabs = SPORT_TABS.filter(t => t.key === 'all' || sessions.some(s => s.sport === t.key))

  return (
    <div>
      {/* Sport filter tabs */}
      {presentSportTabs.length > 2 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {presentSportTabs.map(t => {
            const isActive = sportFilter === t.key
            return (
              <button
                key={t.key}
                onClick={() => setSportFilter(t.key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 7,
                  border: `1px solid ${isActive ? `${COLORS.accent}40` : 'transparent'}`,
                  fontSize: 11, fontWeight: 600,
                  cursor: 'pointer',
                  background: isActive ? `${COLORS.accent}15` : 'transparent',
                  color: isActive ? COLORS.accent : COLORS.muted,
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.15s',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {t.key !== 'all' && (
                  <span style={{
                    display: 'inline-block', width: 6, height: 6,
                    borderRadius: '50%',
                    background: SPORT_COLORS[t.key] || COLORS.muted,
                    flexShrink: 0,
                  }} />
                )}
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Column headers — desktop only */}
      {!isMobile && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '82px 1fr 95px 55px 110px',
          gap: 10, padding: '0 10px 8px',
          fontSize: 10, fontWeight: 700, color: COLORS.muted,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: 'DM Mono, monospace',
        }}>
          <span>Sport</span>
          <span>Session</span>
          <span>Date</span>
          <span>Duration</span>
          <span>Target</span>
        </div>
      )}

      {/* Week rows */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {weeks.map(w => {
          const wSessions = filtered.filter(s => s.week_number === w)
          if (wSessions.length === 0) return null
          const isOpen = openWeeks[w] ?? false

          return (
            <div key={w} style={{ marginBottom: 6 }}>
              <div
                onClick={() => toggleWeek(w)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: COLORS.bg,
                  borderRadius: 7,
                  border: `1px solid ${COLORS.border}`,
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: isOpen ? 3 : 0,
                }}
              >
                <span style={{
                  fontSize: 9,
                  color: isOpen ? COLORS.accent : COLORS.muted,
                  display: 'inline-block',
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}>▶</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>Week {w}</span>
                <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                  {wSessions.length} session{wSessions.length !== 1 ? 's' : ''}
                </span>
              </div>

              {isOpen && wSessions.map(s => {
                const sportColor = SPORT_COLORS[s.sport] || COLORS.muted
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '82px 1fr 55px' : '82px 1fr 95px 55px 110px',
                      alignItems: 'center',
                      gap: 10,
                      padding: isMobile ? '7px 10px' : '8px 10px',
                      borderRadius: 6,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = COLORS.border + '40' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Sport */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: sportColor, flexShrink: 0,
                        boxShadow: `0 0 5px ${sportColor}80`,
                      }} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: sportColor,
                        fontFamily: 'DM Mono, monospace',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        {SPORT_LABELS[s.sport] || s.sport}
                      </span>
                    </div>

                    {/* Title */}
                    <span style={{
                      fontSize: 12, color: COLORS.text, fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {s.title}
                    </span>

                    {/* Date — desktop only */}
                    {!isMobile && (
                      <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                        {formatDate(s.scheduled_date)}
                      </span>
                    )}

                    {/* Duration */}
                    <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: 'DM Mono, monospace' }}>
                      {formatDuration(s.duration_min)}
                    </span>

                    {/* Target metric — desktop only */}
                    {!isMobile && s.target_metric && (
                      <span style={{
                        fontSize: 10, color: COLORS.accent, fontFamily: 'DM Mono, monospace',
                        background: `${COLORS.accent}10`, borderRadius: 4,
                        padding: '2px 6px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {s.target_metric}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
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
  const [showSessions, setShowSessions] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

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
    ? { background: COLORS.accent }
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

        {/* Sessions toggle */}
        <div style={{
          marginTop: 16,
          borderTop: `1px solid ${COLORS.border}`,
          paddingTop: 14,
        }}>
          <button
            onClick={() => setShowSessions(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: showSessions ? COLORS.accent : COLORS.muted,
              fontSize: 12, fontWeight: 600, padding: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color 0.15s',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <span style={{
              fontSize: 9,
              display: 'inline-block',
              transform: showSessions ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}>▶</span>
            {showSessions
              ? 'Hide sessions'
              : sessionCount > 0
                ? `View all ${sessionCount} sessions`
                : 'View sessions'}
          </button>

          {showSessions && (
            <div style={{ marginTop: 14 }}>
              <PlanSessionsView planId={plan.id} isMobile={isMobile} />
            </div>
          )}
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
