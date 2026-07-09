import { useState, useEffect } from 'react'
import { COLORS } from '../../lib/colors'
import { supabase } from '../../lib/supabase'
import { localDateKey } from './utils'

const DEFAULT_TARGETS = { calorie_target: 2800, protein_target: 175, carbs_target: 320, fat_target: 85 }

export function NutritionSummaryCard({ onNavigate }: { onNavigate: () => void }) {
  const [totals, setTotals] = useState({ cal: 0, protein: 0, carbs: 0, fat: 0 })
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [hasData, setHasData] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const today = localDateKey(new Date())
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoaded(true); return }
      const [logsRes, targetsRes] = await Promise.all([
        supabase.from('nutrition_logs').select('calories,protein,carbs,fat').eq('user_id', user.id).eq('date', today),
        supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
      ])
      if (logsRes.error || targetsRes.error) {
        setError(true)
        setLoaded(true)
        return
      }
      const rows = logsRes.data ?? []
      if (rows.length > 0) {
        setTotals(rows.reduce((s, r) => ({ cal: s.cal + r.calories, protein: s.protein + r.protein, carbs: s.carbs + r.carbs, fat: s.fat + r.fat }), { cal: 0, protein: 0, carbs: 0, fat: 0 }))
        setHasData(true)
      }
      if (targetsRes.data) {
        const t = targetsRes.data
        setTargets({
          calorie_target: t.calorie_target ?? DEFAULT_TARGETS.calorie_target,
          protein_target: t.protein_target ?? DEFAULT_TARGETS.protein_target,
          carbs_target: t.carbs_target ?? DEFAULT_TARGETS.carbs_target,
          fat_target: t.fat_target ?? DEFAULT_TARGETS.fat_target,
        })
      }
      setLoaded(true)
    }
    fetch()
  }, [])

  const r = 52
  const circ = 2 * Math.PI * r
  const calPct = hasData ? Math.min(totals.cal / targets.calorie_target, 1) : 0
  const dash = circ * calPct
  const over = totals.cal > targets.calorie_target
  const ringColor = over ? COLORS.orange : calPct >= 0.85 ? COLORS.green : COLORS.accent
  const proteinPct = totals.cal > 0 ? Math.round(totals.protein * 4 / totals.cal * 100) : 0
  const carbsPct   = totals.cal > 0 ? Math.round(totals.carbs   * 4 / totals.cal * 100) : 0
  const fatPct     = totals.cal > 0 ? Math.round(totals.fat     * 9 / totals.cal * 100) : 0

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginTop: 14, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.orange}, ${COLORS.purple})` }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Nutrition Today</div>
        <button
          onClick={onNavigate}
          style={{ background: 'none', border: 'none', color: COLORS.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4, transition: 'gap 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.gap = '7px')}
          onMouseLeave={e => (e.currentTarget.style.gap = '4px')}
        >View <span style={{ fontSize: 13 }}>→</span></button>
      </div>

      {!loaded ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 12 }}>Loading…</div>
      ) : error ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.orange, fontSize: 12, textAlign: 'center', padding: '0 12px' }}>
          Couldn't load today's nutrition data.
        </div>
      ) : !hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0 4px' }}>
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r={r} fill="none" stroke={COLORS.subtle} strokeWidth={9} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted }}>No data</span>
            </div>
          </div>
          <button
            onClick={onNavigate}
            style={{ background: COLORS.accent + '15', border: `1px solid ${COLORS.accent}55`, borderRadius: 8, padding: '8px 16px', color: COLORS.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = COLORS.accent + '25')}
            onMouseLeave={e => (e.currentTarget.style.background = COLORS.accent + '15')}
          >+ Log Nutrition</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Calorie ring */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 120, height: 120 }}>
                <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r={r} fill="none" stroke={COLORS.subtle} strokeWidth={9} />
                  <circle cx="60" cy="60" r={r} fill="none" stroke={ringColor} strokeWidth={9}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.55s ease, stroke 0.3s' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                    {totals.cal.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: COLORS.muted, letterSpacing: '0.04em' }}>kcal eaten</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ringColor, marginTop: 1 }}>
                    {over ? `+${(totals.cal - targets.calorie_target).toLocaleString()} over` : `${(targets.calorie_target - totals.cal).toLocaleString()} left`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 5, fontSize: 10, color: COLORS.muted }}>
                <span><span style={{ color: COLORS.text, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{targets.calorie_target.toLocaleString()}</span> target</span>
                <span style={{ fontWeight: 700 }}>{Math.round(calPct * 100)}%</span>
              </div>
            </div>

            {/* Macro bars */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 4 }}>
              {[
                { label: 'Protein', consumed: totals.protein, target: targets.protein_target, color: COLORS.green },
                { label: 'Carbs',   consumed: totals.carbs,   target: targets.carbs_target,   color: COLORS.orange },
                { label: 'Fat',     consumed: totals.fat,     target: targets.fat_target,     color: COLORS.purple },
              ].map(({ label, consumed, target, color }) => {
                const barPct = Math.min(consumed / target, 1)
                const isOver = consumed > target
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                        <span style={{ color: isOver ? COLORS.orange : COLORS.text, fontWeight: 700 }}>{consumed}g</span>
                        <span style={{ color: COLORS.muted }}> / {target}g</span>
                      </span>
                    </div>
                    <div style={{ height: 4, background: COLORS.subtle, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${barPct * 100}%`, background: isOver ? COLORS.orange : color, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Macro split */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 7 }}>Macro Split</div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
              <div style={{ width: `${proteinPct}%`, background: COLORS.green,  transition: 'width 0.5s ease' }} />
              <div style={{ width: `${carbsPct}%`,   background: COLORS.orange, transition: 'width 0.5s ease' }} />
              <div style={{ width: `${fatPct}%`,     background: COLORS.purple, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {[
                { l: 'Protein', p: proteinPct, c: COLORS.green  },
                { l: 'Carbs',   p: carbsPct,   c: COLORS.orange },
                { l: 'Fat',     p: fatPct,     c: COLORS.purple },
              ].map(({ l, p, c }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: COLORS.muted }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: c, flexShrink: 0 }} />
                  {l} <span style={{ color: COLORS.text, fontWeight: 700 }}>{p}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
