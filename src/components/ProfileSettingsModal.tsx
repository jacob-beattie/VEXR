import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { COLORS } from '../lib/colors'
import { supabase } from '../lib/supabase'
import type { Profile, FitnessBenchmark } from '../types'
import { Button } from './ui/Button'
import { useStrava } from '../contexts/StravaContext'
import { useIsMobile } from '../hooks/useIsMobile'
import type { User } from '@supabase/supabase-js'


// ─── Zone constants ───────────────────────────────────────────────────────────


const CYCLING_ZONE_DEFS = [
  { zone_number: 1, zone_name: 'Active Recovery', minPct: 0,    maxPct: 0.55 },
  { zone_number: 2, zone_name: 'Endurance',        minPct: 0.56, maxPct: 0.75 },
  { zone_number: 3, zone_name: 'Tempo',             minPct: 0.76, maxPct: 0.90 },
  { zone_number: 4, zone_name: 'Threshold',         minPct: 0.91, maxPct: 1.05 },
  { zone_number: 5, zone_name: 'VO2 Max',           minPct: 1.06, maxPct: 1.20 },
  { zone_number: 6, zone_name: 'Anaerobic',         minPct: 1.21, maxPct: null  },
] as const


// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcCyclingZones(ftp: number) {
  return CYCLING_ZONE_DEFS.map(z => ({
    zone_number: z.zone_number,
    zone_name: z.zone_name,
    min_value: z.minPct === 0 ? '0' : String(Math.round(z.minPct * ftp)),
    max_value: z.maxPct !== null ? String(Math.floor(z.maxPct * ftp)) : null,
  }))
}

function calcHRZones(maxHrVal: number) {
  const z1Max = Math.round(maxHrVal * 0.65)
  const z2Max = Math.round(maxHrVal * 0.75)
  const z3Max = Math.round(maxHrVal * 0.82)
  const z4Max = Math.round(maxHrVal * 0.89)
  return [
    { zone_number: 1, zone_name: 'Recovery',  min_value: '0',              max_value: String(z1Max) },
    { zone_number: 2, zone_name: 'Aerobic',    min_value: String(z1Max + 1), max_value: String(z2Max) },
    { zone_number: 3, zone_name: 'Tempo',      min_value: String(z2Max + 1), max_value: String(z3Max) },
    { zone_number: 4, zone_name: 'Threshold',  min_value: String(z3Max + 1), max_value: String(z4Max) },
    { zone_number: 5, zone_name: 'Max',        min_value: String(z4Max + 1), max_value: '' },
  ]
}

function paceToSeconds(pace: string): number | null {
  if (!pace || !pace.includes(':')) return null
  const [min, sec] = pace.split(':').map(Number)
  if (isNaN(min) || isNaN(sec)) return null
  return min * 60 + sec
}

function secondsToPace(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

function calcRunningZones(runPace: string) {
  const T = paceToSeconds(runPace)
  if (!T) return null
  return [
    { zone_number: 1, zone_name: 'Recovery',  min_value: secondsToPace(T * 1.25), max_value: '' },
    { zone_number: 2, zone_name: 'Aerobic',   min_value: secondsToPace(T * 1.10), max_value: secondsToPace(T * 1.25) },
    { zone_number: 3, zone_name: 'Tempo',     min_value: secondsToPace(T * 1.02), max_value: secondsToPace(T * 1.10) },
    { zone_number: 4, zone_name: 'Threshold', min_value: secondsToPace(T * 0.97), max_value: secondsToPace(T * 1.02) },
    { zone_number: 5, zone_name: 'VO2 Max',   min_value: '',                      max_value: secondsToPace(T * 0.97) },
  ]
}

function calcSwimmingZones(css: string) {
  const T = paceToSeconds(css)
  if (!T) return null
  return [
    { zone_number: 1, zone_name: 'Recovery',  min_value: secondsToPace(T * 1.20), max_value: '' },
    { zone_number: 2, zone_name: 'Aerobic',   min_value: secondsToPace(T * 1.05), max_value: secondsToPace(T * 1.20) },
    { zone_number: 3, zone_name: 'Threshold', min_value: secondsToPace(T * 0.95), max_value: secondsToPace(T * 1.05) },
    { zone_number: 4, zone_name: 'Speed',     min_value: '',                      max_value: secondsToPace(T * 0.95) },
  ]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BenchmarkSparkline({
  label,
  unit,
  color,
  data,
  currentValue,
  higherIsBetter,
}: {
  label: string
  unit: string
  color: string
  data: Array<{ date: string; value: number; paceLabel?: string }>
  currentValue: string
  higherIsBetter: boolean
}) {
  const hasChart = data.length >= 2

  return (
    <div style={{
      background: COLORS.bg,
      borderRadius: 10,
      padding: '16px',
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
          {currentValue || '—'}
        </div>
      </div>

      {hasChart ? (
        <ResponsiveContainer width="100%" height={70}>
          <LineChart data={data}>
            <XAxis dataKey="date" hide />
            <YAxis hide reversed={!higherIsBetter} domain={['auto', 'auto']} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as { date: string; paceLabel?: string; value: number }
                return (
                  <div style={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 11,
                  }}>
                    <div style={{ color: COLORS.muted, marginBottom: 2 }}>{point.date}</div>
                    <div style={{ color, fontWeight: 700 }}>
                      {point.paceLabel ?? point.value} {!point.paceLabel && unit}
                    </div>
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 3, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{
          height: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center', lineHeight: 1.5 }}>
            {data.length === 0
              ? 'No history yet\nUpdate to start tracking'
              : 'One more update to\nsee your trend'}
          </div>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 10, color: COLORS.muted }}>
        {data.length} record{data.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}


// ─── Main component ───────────────────────────────────────────────────────────

interface ProfileSettingsModalProps {
  profile: Profile
  user: User
  onClose: () => void
  onSave: (updatedProfile: Profile) => void
}

export function ProfileSettingsModal({ profile, user, onClose, onSave }: ProfileSettingsModalProps) {
  const { connection, syncing, triggerSync, disconnect } = useStrava()
  const isMobile = useIsMobile()

  const [form, setForm] = useState({
    name: profile.name || '',
    sport: profile.sport || '',
    ftp: String(profile.ftp || ''),
    run_pace: profile.run_pace || '',
    css: profile.css || '',
    race_goal: profile.race_goal || '',
    race_date: profile.race_date || '',
    max_hr: profile.max_hr ? String(profile.max_hr) : '',
  })

  const [benchmarks, setBenchmarks] = useState<FitnessBenchmark[]>([])
  const [activeZoneTab, setActiveZoneTab] = useState<'cycling' | 'running' | 'swimming' | 'heart_rate'>('cycling')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingData, setLoadingData] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url ?? null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarHovered, setAvatarHovered] = useState(false)
  const [viewingAvatar, setViewingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoadingData(true)

    const [{ data: bData }, { data: zData }] = await Promise.all([
      supabase
        .from('fitness_benchmarks')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('training_zones')
        .select('*')
        .eq('user_id', user.id),
    ])

    if (bData) setBenchmarks(bData as FitnessBenchmark[])



    setLoadingData(false)
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true)
    setError('')
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadErr) throw uploadErr
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const urlWithBust = `${publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: urlWithBust }).eq('id', user.id)
      setAvatarUrl(urlWithBust)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed')
      setAvatarPreview(null)
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    try {
      const ftpNum = parseInt(form.ftp) || 0
      const now = new Date().toISOString()

      // Record new benchmarks for any changed metric
      const benchmarkInserts: Array<{ user_id: string; metric: string; value: string; recorded_at: string }> = []

      if (ftpNum !== (profile.ftp || 0) && form.ftp !== '') {
        benchmarkInserts.push({ user_id: user.id, metric: 'ftp', value: form.ftp, recorded_at: now })
      }
      if (form.run_pace !== (profile.run_pace || '') && form.run_pace !== '') {
        benchmarkInserts.push({ user_id: user.id, metric: 'pace', value: form.run_pace, recorded_at: now })
      }
      if (form.css !== (profile.css || '') && form.css !== '') {
        benchmarkInserts.push({ user_id: user.id, metric: 'css', value: form.css, recorded_at: now })
      }

      if (benchmarkInserts.length > 0) {
        const { error: bErr } = await supabase.from('fitness_benchmarks').insert(benchmarkInserts)
        if (bErr) throw bErr
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: form.name,
          sport: form.sport,
          ftp: ftpNum,
          run_pace: form.run_pace,
          css: form.css,
          race_goal: form.race_goal || null,
          race_date: form.race_date || null,
          max_hr: parseInt(form.max_hr) || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      // Save all training zones — delete + re-insert
      await supabase.from('training_zones').delete().eq('user_id', user.id)

      const cyclingZones = calcCyclingZones(ftpNum)
      const runZones = calcRunningZones(form.run_pace) ?? []
      const swimZones = calcSwimmingZones(form.css) ?? []
      const zoneInserts = [
        ...cyclingZones.map(z => ({
          user_id: user.id,
          sport: 'cycling',
          zone_number: z.zone_number,
          zone_name: z.zone_name,
          min_value: z.min_value,
          max_value: z.max_value,
          updated_at: now,
        })),
        ...runZones.map(z => ({
          user_id: user.id,
          sport: 'running',
          zone_number: z.zone_number,
          zone_name: z.zone_name,
          min_value: z.min_value || null,
          max_value: z.max_value || null,
          updated_at: now,
        })),
        ...swimZones.map(z => ({
          user_id: user.id,
          sport: 'swimming',
          zone_number: z.zone_number,
          zone_name: z.zone_name,
          min_value: z.min_value || null,
          max_value: z.max_value || null,
          updated_at: now,
        })),
      ]

      const { error: zErr } = await supabase.from('training_zones').insert(zoneInserts)
      if (zErr) throw zErr

      onSave({
        ...profile,
        name: form.name,
        sport: form.sport,
        ftp: ftpNum,
        run_pace: form.run_pace,
        css: form.css,
        race_goal: form.race_goal || undefined,
        race_date: form.race_date || undefined,
        max_hr: parseInt(form.max_hr) || null,
        avatar_url: avatarUrl,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
      setSaving(false)
    }
  }

  // ─── Chart data ───────────────────────────────────────────────────────────

  const ftpChartData = benchmarks
    .filter(b => b.metric === 'ftp')
    .map(b => ({
      date: new Date(b.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      value: parseFloat(b.value) || 0,
    }))

  const paceChartData = benchmarks
    .filter(b => b.metric === 'pace')
    .map(b => ({
      date: new Date(b.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      value: paceToSeconds(b.value) ?? 0,
      paceLabel: b.value,
    }))

  const cssChartData = benchmarks
    .filter(b => b.metric === 'css')
    .map(b => ({
      date: new Date(b.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      value: paceToSeconds(b.value) ?? 0,
      paceLabel: b.value,
    }))

  const ftpNum = parseInt(form.ftp) || 0
  const cyclingZones = calcCyclingZones(ftpNum)

  // ─── Shared styles ────────────────────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: COLORS.muted, fontWeight: 600,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    display: 'block', marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: COLORS.text,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  }

  const sectionStyle: React.CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: isMobile ? '16px 14px' : '22px 24px',
    marginBottom: 20,
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: COLORS.muted,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 18,
  }

  return (
    <>
    {viewingAvatar && (avatarPreview || avatarUrl) && (
      <div
        onClick={() => setViewingAvatar(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
        }}
      >
        <img
          src={avatarPreview ?? avatarUrl!}
          alt="Profile photo"
          style={{
            maxWidth: '90vw', maxHeight: '90vh',
            borderRadius: 12, objectFit: 'contain',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}
          onClick={e => e.stopPropagation()}
        />
        <button
          onClick={() => setViewingAvatar(false)}
          style={{
            position: 'absolute', top: 20, right: 24,
            background: 'none', border: 'none', color: '#fff',
            fontSize: 28, cursor: 'pointer', lineHeight: 1, padding: 4,
          }}
        >
          ×
        </button>
      </div>
    )}
    <div
      onClick={isMobile ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: isMobile ? COLORS.surface : 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: isMobile ? 0 : '28px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.surface,
          border: isMobile ? 'none' : `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 16,
          padding: isMobile ? '20px 16px' : '32px 36px',
          width: '100%',
          maxWidth: isMobile ? undefined : 880,
          marginBottom: isMobile ? 0 : 28,
          minHeight: isMobile ? '100dvh' : undefined,
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>Profile Settings</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
              Manage your profile, fitness benchmarks and training zones
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: COLORS.muted,
              fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Section 1: Athlete Profile ── */}
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>Athlete Profile</div>

          {/* Avatar upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
            <div
              onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
              onMouseEnter={() => setAvatarHovered(true)}
              onMouseLeave={() => setAvatarHovered(false)}
              style={{
                position: 'relative', width: 72, height: 72, borderRadius: '50%',
                flexShrink: 0, cursor: uploadingAvatar ? 'default' : 'pointer',
                overflow: 'hidden',
              }}
            >
              {(avatarPreview || avatarUrl) ? (
                <img
                  src={avatarPreview ?? avatarUrl!}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.purple})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 700, color: '#000',
                }}>
                  {form.name ? form.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                </div>
              )}
              {/* Hover / uploading overlay */}
              {(avatarHovered || uploadingAvatar) && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: uploadingAvatar ? 11 : 18, color: '#fff',
                }}>
                  {uploadingAvatar ? '...' : '✎'}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Profile Photo</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>JPG, PNG or WebP · max 5 MB</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => !uploadingAvatar && fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                style={{
                  background: 'none', border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, padding: '5px 12px', color: COLORS.muted,
                  fontSize: 11, cursor: uploadingAvatar ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {uploadingAvatar ? 'Uploading…' : 'Upload photo'}
              </button>
              {(avatarUrl || avatarPreview) && !uploadingAvatar && (
                <button
                  onClick={() => setViewingAvatar(true)}
                  style={{
                    background: 'none', border: `1px solid ${COLORS.border}`,
                    borderRadius: 6, padding: '5px 12px', color: COLORS.muted,
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  View
                </button>
              )}
              </div>
              {avatarUrl && !uploadingAvatar && (
                <button
                  onClick={async () => {
                    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
                    setAvatarUrl(null)
                    setAvatarPreview(null)
                  }}
                  style={{
                    background: 'none', border: 'none', color: COLORS.muted,
                    fontSize: 11, cursor: 'pointer', marginLeft: 8, padding: '5px 0',
                    fontFamily: 'inherit', textDecoration: 'underline',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return }
                handleAvatarUpload(file)
                e.target.value = ''
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
              />
            </div>
            <div>
              <label style={labelStyle}>Primary Sport</label>
              <input
                style={inputStyle}
                value={form.sport}
                onChange={e => setForm(f => ({ ...f, sport: e.target.value }))}
                placeholder="e.g. triathlon"
              />
            </div>
            <div>
              <label style={labelStyle}>FTP (watts)</label>
              <input
                type="number"
                style={inputStyle}
                value={form.ftp}
                onChange={e => setForm(f => ({ ...f, ftp: e.target.value }))}
                placeholder="e.g. 290"
                min={0}
              />
            </div>
            <div>
              <label style={labelStyle}>Run Pace (min/km)</label>
              <input
                style={inputStyle}
                value={form.run_pace}
                onChange={e => setForm(f => ({ ...f, run_pace: e.target.value }))}
                placeholder="e.g. 4:30"
              />
            </div>
            <div style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
              <label style={labelStyle}>CSS (min/100m)</label>
              <input
                style={inputStyle}
                value={form.css}
                onChange={e => setForm(f => ({ ...f, css: e.target.value }))}
                placeholder="e.g. 1:45"
              />
            </div>
            {!isMobile && <div />}
            <div>
              <label style={labelStyle}>Race Goal</label>
              <input
                style={inputStyle}
                value={form.race_goal}
                onChange={e => setForm(f => ({ ...f, race_goal: e.target.value }))}
                placeholder="e.g. Ironman Melbourne"
              />
            </div>
            <div>
              <label style={labelStyle}>Race Date</label>
              <input
                type="date"
                style={{ ...inputStyle, colorScheme: 'dark' }}
                value={form.race_date}
                onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* ── Section 2: Benchmark History ── */}
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>Benchmark History</div>
          {loadingData ? (
            <div style={{ color: COLORS.muted, fontSize: 13, padding: '16px 0' }}>Loading…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16 }}>
              <BenchmarkSparkline
                label="FTP"
                unit="w"
                color={COLORS.purple}
                data={ftpChartData}
                currentValue={form.ftp ? `${form.ftp}w` : ''}
                higherIsBetter
              />
              <BenchmarkSparkline
                label="Run Pace"
                unit="min/km"
                color={COLORS.green}
                data={paceChartData}
                currentValue={form.run_pace}
                higherIsBetter={false}
              />
              <BenchmarkSparkline
                label="CSS"
                unit="min/100m"
                color={COLORS.accent}
                data={cssChartData}
                currentValue={form.css}
                higherIsBetter={false}
              />
            </div>
          )}
        </div>

        {/* ── Section 3: Training Zones ── */}
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>Training Zones</div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
            {([
              { key: 'cycling',    label: 'Cycling' },
              { key: 'running',    label: 'Running' },
              { key: 'swimming',   label: 'Swimming' },
              { key: 'heart_rate', label: 'Heart Rate' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveZoneTab(tab.key)}
                style={{
                  padding: '7px 18px',
                  borderRadius: 8,
                  border: `1px solid ${activeZoneTab === tab.key ? COLORS.accent : COLORS.border}`,
                  background: activeZoneTab === tab.key ? COLORS.accentDim : 'transparent',
                  color: activeZoneTab === tab.key ? COLORS.accent : COLORS.muted,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.12s',
                  fontFamily: 'inherit',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Cycling — auto from FTP */}
          {activeZoneTab === 'cycling' && (
            <div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>
                {ftpNum > 0
                  ? `Auto-calculated from FTP of ${ftpNum}w. Update FTP above and save to recalculate.`
                  : 'Enter your FTP above to auto-calculate cycling zones.'}
              </div>
              {ftpNum > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cyclingZones.map(zone => (
                    <div key={zone.zone_number} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px',
                      background: COLORS.bg,
                      borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        background: COLORS.purple + '18',
                        border: `1px solid ${COLORS.purple}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: COLORS.purple,
                      }}>
                        Z{zone.zone_number}
                      </div>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                        {zone.zone_name}
                      </div>
                      <div style={{
                        fontSize: 13, fontFamily: "'DM Mono', monospace",
                        color: COLORS.muted, letterSpacing: '0.02em',
                      }}>
                        {zone.max_value !== null
                          ? `${zone.min_value} – ${zone.max_value}w`
                          : `${zone.min_value}w+`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '24px',
                  background: COLORS.bg,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  textAlign: 'center',
                  color: COLORS.muted,
                  fontSize: 13,
                }}>
                  Enter your FTP in the profile section above
                </div>
              )}
            </div>
          )}

          {/* Running — auto from threshold pace */}
          {activeZoneTab === 'running' && (() => {
            const runZones = calcRunningZones(form.run_pace)
            return (
              <div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>
                  {form.run_pace
                    ? `Auto-calculated from threshold pace of ${form.run_pace} min/km. Update pace above and save to recalculate.`
                    : 'Enter your threshold pace above to auto-calculate running zones.'}
                </div>
                {runZones ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {runZones.map(zone => (
                      <div key={zone.zone_number} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px',
                        background: COLORS.bg,
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: COLORS.green + '18',
                          border: `1px solid ${COLORS.green}35`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: COLORS.green,
                        }}>
                          Z{zone.zone_number}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                          {zone.zone_name}
                        </div>
                        <div style={{
                          fontSize: 13, fontFamily: "'DM Mono', monospace",
                          color: COLORS.muted, letterSpacing: '0.02em',
                        }}>
                          {zone.min_value === ''
                            ? `< ${zone.max_value} min/km`
                            : zone.max_value === ''
                              ? `${zone.min_value}+ min/km`
                              : `${zone.min_value} – ${zone.max_value} min/km`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '24px',
                    background: COLORS.bg,
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    textAlign: 'center',
                    color: COLORS.muted,
                    fontSize: 13,
                  }}>
                    Enter your threshold pace in the profile section above
                  </div>
                )}
              </div>
            )
          })()}

          {/* Swimming — auto from CSS */}
          {activeZoneTab === 'swimming' && (() => {
            const swimZones = calcSwimmingZones(form.css)
            return (
              <div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>
                  {form.css
                    ? `Auto-calculated from CSS of ${form.css} min/100m. Update CSS above and save to recalculate.`
                    : 'Enter your CSS above to auto-calculate swimming zones.'}
                </div>
                {swimZones ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {swimZones.map(zone => (
                      <div key={zone.zone_number} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px',
                        background: COLORS.bg,
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: COLORS.accent + '18',
                          border: `1px solid ${COLORS.accent}35`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: COLORS.accent,
                        }}>
                          Z{zone.zone_number}
                        </div>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                          {zone.zone_name}
                        </div>
                        <div style={{
                          fontSize: 13, fontFamily: "'DM Mono', monospace",
                          color: COLORS.muted, letterSpacing: '0.02em',
                        }}>
                          {zone.min_value === ''
                            ? `< ${zone.max_value} min/100m`
                            : zone.max_value === ''
                              ? `${zone.min_value}+ min/100m`
                              : `${zone.min_value} – ${zone.max_value} min/100m`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '24px',
                    background: COLORS.bg,
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    textAlign: 'center',
                    color: COLORS.muted,
                    fontSize: 13,
                  }}>
                    Enter your CSS in the profile section above
                  </div>
                )}
              </div>
            )
          })()}

          {/* Heart Rate — auto from max HR */}
          {activeZoneTab === 'heart_rate' && (() => {
            const maxHrNum = parseInt(form.max_hr) || 0
            const hrZones = maxHrNum > 0 ? calcHRZones(maxHrNum) : []
            const zoneColors = ['#4a9eff', COLORS.green, '#ffdd00', COLORS.orange, '#ff4757']
            return (
              <div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 16 }}>
                  Auto-calculated from your max heart rate. Common estimate: 220 − age.
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Max Heart Rate (bpm)</label>
                  <input
                    type="number"
                    className="no-spinner"
                    style={{ ...inputStyle, width: isMobile ? '100%' : 160 }}
                    value={form.max_hr}
                    onChange={e => setForm(f => ({ ...f, max_hr: e.target.value }))}
                    placeholder="e.g. 185"
                    min={100}
                    max={230}
                  />
                </div>
                {maxHrNum > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {hrZones.map((zone, i) => {
                      const color = zoneColors[i]
                      return (
                        <div key={zone.zone_number} style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px',
                          background: COLORS.bg,
                          borderRadius: 8,
                          border: `1px solid ${COLORS.border}`,
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                            background: color + '18',
                            border: `1px solid ${color}35`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, color,
                          }}>
                            Z{zone.zone_number}
                          </div>
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                            {zone.zone_name}
                          </div>
                          <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: COLORS.muted }}>
                            {zone.max_value
                              ? `${zone.min_value} – ${zone.max_value} bpm`
                              : `${zone.min_value}+ bpm`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: 24, background: COLORS.bg, borderRadius: 8,
                    border: `1px solid ${COLORS.border}`, textAlign: 'center',
                    color: COLORS.muted, fontSize: 13,
                  }}>
                    Enter your max heart rate above
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Section 4: Strava Integration ── */}
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>Strava Integration</div>

          {connection ? (
            /* Connected state */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: COLORS.green, flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
                    Strava Connected
                  </div>
                  {connection.athlete_name && (
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                      {connection.athlete_name}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={triggerSync}
                  disabled={syncing}
                  style={{
                    background: COLORS.strava + '18',
                    border: `1px solid ${COLORS.strava}60`,
                    borderRadius: 8,
                    color: syncing ? COLORS.muted : COLORS.strava,
                    fontSize: 12, fontWeight: 700,
                    padding: '8px 16px', cursor: syncing ? 'default' : 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span className={syncing ? 'spinning' : ''} style={{ display: 'inline-block', fontSize: 13 }}>⟳</span>
                  {syncing ? 'Syncing…' : 'Sync Now'}
                </button>
                <button
                  onClick={disconnect}
                  style={{
                    background: 'none',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    color: COLORS.muted,
                    fontSize: 12, fontWeight: 600,
                    padding: '8px 16px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = COLORS.orange; e.currentTarget.style.borderColor = COLORS.orange + '60' }}
                  onMouseLeave={e => { e.currentTarget.style.color = COLORS.muted; e.currentTarget.style.borderColor = COLORS.border }}
                >
                  Disconnect
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: COLORS.muted }}>
                Syncs the last 30 days of activities automatically on login.
              </div>
            </div>
          ) : (
            /* Not connected state */
            <div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 16, lineHeight: 1.5 }}>
                Connect Strava to automatically import your workouts. Activities sync in the background every time you log in.
              </div>
              <a
                href={`https://www.strava.com/oauth/authorize?client_id=${import.meta.env.VITE_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(import.meta.env.VITE_STRAVA_REDIRECT_URI)}&response_type=code&scope=activity:read_all`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: COLORS.strava,
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13, fontWeight: 700,
                  padding: '10px 20px',
                  textDecoration: 'none',
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                Connect Strava
              </a>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            color: COLORS.orange, fontSize: 13,
            padding: '10px 14px',
            background: COLORS.orange + '15',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
    </>
  )
}
