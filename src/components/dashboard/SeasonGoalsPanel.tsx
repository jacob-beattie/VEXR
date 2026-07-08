import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import { useGoals } from '../../hooks/useGoals'

export function SeasonGoalsPanel() {
  const { goals, loading: loadingGoals, saving, addGoal, toggleGoal, deleteGoal } = useGoals()
  const [inputText, setInputText] = useState('')

  const handleAdd = async () => {
    const ok = await addGoal(inputText)
    if (ok) setInputText('')
  }

  const incomplete = goals.filter(g => !g.completed)
  const completed = goals.filter(g => g.completed)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Season Goals
        </div>
        {goals.length > 0 && (
          <span style={{ fontSize: 11, color: COLORS.green, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
            {completed.length}/{goals.length}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add a goal…"
          style={{
            flex: 1, padding: '8px 11px', borderRadius: 8,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg, color: COLORS.text,
            fontSize: 12, fontFamily: 'inherit', outline: 'none',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = COLORS.accent + '70')}
          onBlur={e => (e.currentTarget.style.borderColor = COLORS.border)}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !inputText.trim()}
          style={{
            padding: '8px 13px', borderRadius: 8,
            border: `1px solid ${COLORS.accent}`,
            background: COLORS.accent + '15', color: COLORS.accent,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            opacity: saving || !inputText.trim() ? 0.45 : 1, transition: 'opacity 0.15s',
          }}
        >+</button>
      </div>

      {loadingGoals ? (
        <div style={{ color: COLORS.muted, fontSize: 12, padding: '4px 0' }}>Loading…</div>
      ) : goals.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 12, textAlign: 'center', padding: '10px 0' }}>No goals yet — set your first!</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[...incomplete, ...completed].map(goal => (
            <div key={goal.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 9,
              padding: '8px 10px', borderRadius: 8,
              background: COLORS.bg,
              border: `1px solid ${goal.completed ? COLORS.green + '25' : COLORS.border}`,
              opacity: goal.completed ? 0.6 : 1, transition: 'opacity 0.2s',
            }}>
              <button
                onClick={() => toggleGoal(goal)}
                style={{
                  flexShrink: 0, marginTop: 1, width: 17, height: 17, borderRadius: 4,
                  border: `1px solid ${goal.completed ? COLORS.green : COLORS.muted}`,
                  background: goal.completed ? COLORS.green + '20' : 'transparent',
                  cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: COLORS.green, fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >{goal.completed ? '✓' : ''}</button>
              <span style={{
                flex: 1, fontSize: 12,
                color: goal.completed ? COLORS.muted : COLORS.text,
                textDecoration: goal.completed ? 'line-through' : 'none',
                lineHeight: 1.4,
              }}>{goal.text}</span>
              <button
                onClick={() => deleteGoal(goal.id)}
                style={{
                  flexShrink: 0, background: 'none', border: 'none',
                  color: COLORS.muted, fontSize: 15, cursor: 'pointer',
                  padding: '0 2px', lineHeight: 1, opacity: 0.5,
                  fontFamily: 'inherit', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
