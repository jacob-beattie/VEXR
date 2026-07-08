import { useState, useEffect } from 'react'
import { COLORS } from '../../lib/colors'
import { supabase } from '../../lib/supabase'

export function AICoachTeaser({ onClick }: { onClick: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    supabase
      .from('ai_briefings')
      .select('briefing')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.briefing) {
          const idx = data.briefing.search(/[.!?](\s|$)/)
          const sentence = idx > 0 ? data.briefing.slice(0, idx + 1) : data.briefing
          setPreview(sentence.length > 150 ? sentence.slice(0, 150) + '…' : sentence)
        }
        setChecked(true)
      })
  }, [])

  return (
    <div style={{
      background: COLORS.card,
      borderTop: `1px solid ${COLORS.border}`,
      borderRight: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      borderLeft: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${COLORS.accent}90, transparent)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, color: COLORS.accent }}>✦</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          AI Coach
        </span>
      </div>
      {checked && !preview && (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: COLORS.muted, lineHeight: 1.6 }}>
          Get a personalised weekly briefing based on your current fitness and training load.
        </p>
      )}
      {preview && (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: COLORS.text, lineHeight: 1.65, fontStyle: 'italic', opacity: 0.88 }}>
          "{preview}"
        </p>
      )}
      <button
        onClick={onClick}
        style={{
          background: 'none', border: 'none', padding: 0,
          color: COLORS.accent, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'gap 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.gap = '8px')}
        onMouseLeave={e => (e.currentTarget.style.gap = '5px')}
      >
        Read Full Briefing <span style={{ fontSize: 15 }}>→</span>
      </button>
    </div>
  )
}
