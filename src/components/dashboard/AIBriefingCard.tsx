import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '../../lib/colors'
import { supabase } from '../../lib/supabase'

interface BriefingData {
  briefing: string
  generated_at: string
  cached: boolean
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function AIBriefingCard() {
  const [data, setData] = useState<BriefingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChecked, setHasChecked] = useState(false)

  // On mount, check if there's a cached briefing in the last 24h from Supabase directly
  // so we can show it without hitting the edge function
  useEffect(() => {
    async function checkCache() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: cached } = await supabase
        .from('ai_briefings')
        .select('briefing, generated_at')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (cached) {
        const age = Date.now() - new Date(cached.generated_at).getTime()
        if (age < 24 * 60 * 60 * 1000) {
          setData({ briefing: cached.briefing, generated_at: cached.generated_at, cached: true })
        }
      }
      setHasChecked(true)
    }
    checkCache()
  }, [])

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/ai-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate briefing')
      setData(json as BriefingData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div style={{
      background: COLORS.card,
      borderTop: `1px solid ${COLORS.border}`,
      borderRight: `1px solid ${COLORS.border}`,
      borderBottom: `1px solid ${COLORS.border}`,
      borderLeft: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: '20px 24px',
      marginBottom: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Cyan gradient top border glow */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${COLORS.accent}, ${COLORS.accent}80, transparent)`,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              AI Coach
            </div>
            {data && (
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 1 }}>
                Generated {formatAge(data.generated_at)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data && (
            <button
              onClick={generate}
              disabled={loading}
              title="Refresh briefing"
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                color: COLORS.muted,
                fontSize: 13,
                padding: '4px 8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: loading ? 0.5 : 1,
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.color = COLORS.text;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.accent
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = COLORS.muted;
                (e.currentTarget as HTMLButtonElement).style.borderColor = COLORS.border
              }}
            >
              ↻ Refresh
            </button>
          )}

          {!data && hasChecked && (
            <button
              onClick={generate}
              disabled={loading}
              style={{
                background: loading ? COLORS.accentDim : COLORS.accent + '15',
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 8,
                color: COLORS.accent,
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 16px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.15s',
                letterSpacing: '0.04em',
              }}
            >
              {loading ? 'Generating…' : 'Generate Weekly Briefing'}
            </button>
          )}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ marginTop: 16 }}>
          {[100, 90, 75].map((w, i) => (
            <div key={i} style={{
              height: 13,
              borderRadius: 6,
              background: COLORS.subtle,
              width: `${w}%`,
              marginBottom: 10,
              animation: 'pulse 1.5s ease-in-out infinite',
              opacity: 0.6,
            }} />
          ))}
        </div>
      )}

      {/* Loading overlay when refreshing existing briefing */}
      {loading && data && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: COLORS.muted, fontSize: 12 }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
          Generating new briefing…
        </div>
      )}

      {/* Briefing text */}
      {data && !loading && (
        <p style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.7,
          color: COLORS.text,
          fontStyle: 'italic',
          opacity: 0.92,
        }}>
          {data.briefing}
        </p>
      )}

      {/* Empty state (checked, no cache, not loading) */}
      {!data && !loading && hasChecked && !error && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: COLORS.muted }}>
          Get a personalised training recommendation based on your current fitness, fatigue, and upcoming workouts.
        </p>
      )}

      {/* Error state */}
      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: COLORS.orange }}>
          {error}
        </div>
      )}
    </div>
  )
}
