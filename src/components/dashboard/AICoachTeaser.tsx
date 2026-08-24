import { useState, useEffect } from 'react'
import { COLORS } from '../../lib/colors'
import { RADIUS } from '../../lib/designTokens'
import { supabase } from '../../lib/supabase'

export function AICoachTeaser({ onClick }: { onClick: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase
      .from('ai_briefings')
      .select('briefing')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error: fetchError }) => {
        // PGRST116 = no rows found, which is expected for a user with no briefing yet —
        // not a failure worth surfacing. Any other error means the fetch itself failed.
        if (fetchError && fetchError.code !== 'PGRST116') {
          setError(true)
        } else if (data?.briefing) {
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
      border: `1px solid ${COLORS.border}`,
      borderRadius: RADIUS.card,
      padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
        AI Coach Note
      </div>
      {error ? (
        <p style={{ margin: '0 0 14px', fontSize: 13, color: COLORS.danger, lineHeight: 1.6 }}>
          Couldn't load your latest briefing preview.
        </p>
      ) : checked && !preview && (
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
