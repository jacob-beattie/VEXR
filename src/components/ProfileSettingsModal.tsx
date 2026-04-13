import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { COLORS } from '../lib/colors'
import { supabase } from '../lib/supabase'
import type { Profile, FitnessBenchmark } from '../types'
import { Button } from './ui/Button'
import type { User } from '@supabase/supabase-js'

// ─── Zone constants ───────────────────────────────────────────────────────────

interface ZoneRow {
  zone_number: number
  zone_name: string
  min_value: string
  max_value: string
}

const CYCLING_ZONE_DEFS = [
  { zone_number: 1, zone_name: 'Active Recovery', minPct: 0,    maxPct: 0.55 },
  { zone_number: 2, zone_name: 'Endurance',        minPct: 0.56, maxPct: 0.75 },
  { zone_number: 3, zone_name: 'Tempo',             minPct: 0.76, maxPct: 0.90 },
  { zone_number: 4, zone_name: 'Threshold',         minPct: 0.91, maxPct: 1.05 },
  { zone_number: 5, zone_name: 'VO2 Max',           minPct: 1.06, maxPct: 1.20 },
  { zone_number: 6, zone_name: 'Anaerobic',         minPct: 1.21, maxPct: null  },
] as const

const DEFAULT_RUNNING_ZONES: ZoneRow[] = [
  { zone_number: 1, zone_name: 'Recovery',   min_value: '', max_value: '' },
  { zone_number: 2, zone_name: 'Aerobic',    min_value: '', max_value: '' },
  { zone_number: 3, zone_name: 'Tempo',      min_value: '', max_value: '' },
  { zone_number: 4, zone_name: 'Threshold',  min_value: '', max_value: '' },
  { zone_number: 5, zone_name: 'VO2 Max',    min_value: '', max_value: '' },
]

const DEFAULT_SWIMMING_ZONES: ZoneRow[] = [
  { zone_number: 1, zone_name: 'Recovery',   min_value: '', max_value: '' },
  { zone_number: 2, zone_name: 'Aerobic',    min_value: '', max_value: '' },
  { zone_number: 3, zone_name: 'Threshold',  min_value: '', max_value: '' },
  { zone_number: 4, zone_name: 'Speed',      min_value: '', max_value: '' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcCyclingZones(ftp: number) {
  return CYCLING_ZONE_DEFS.map(z => ({
    zone_number: z.zone_number,
    zone_name: z.zone_name,
    min_value: z.minPct === 0 ? '0' : String(Math.round(z.minPct * ftp)),
    max_value: z.maxPct !== null ? String(Math.floor(z.maxPct * ftp)) : null,
  }))
}

function paceToSeconds(pace: string): number | null {
  if (!pace || !pace.includes(':')) return null
  const [min, sec] = pace.split(':').map(Number)
  if (isNaN(min) || isNaN(sec)) return null
  return min * 60 + sec
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
        <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
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

function ZonesEditorTable({
  zones,
  onChange,
  color,
  unit,
}: {
  zones: ZoneRow[]
  onChange: (zones: ZoneRow[]) => void
  color: string
  unit: string
}) {
  const inputStyle: React.CSSProperties = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '6px 8px',
    color: COLORS.text,
    fontSize: 12,
    width: 80,
    outline: 'none',
    fontFamily: "'DM Mono', monospace",
    boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr 90px 90px',
        gap: 10,
        padding: '0 14px',
        marginBottom: 6,
      }}>
        <div />
        <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Zone</div>
        <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Min</div>
        <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Max</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {zones.map((zone, i) => (
          <div key={zone.zone_number} style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 90px 90px',
            gap: 10,
            alignItems: 'center',
            padding: '8px 14px',
            background: COLORS.bg,
            borderRadius: 8,
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: color + '18',
              border: `1px solid ${color}35`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color,
            }}>
              Z{zone.zone_number}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{zone.zone_name}</div>
            <input
              style={inputStyle}
              value={zone.min_value}
              placeholder={unit === 'min/km' ? '5:30' : '1:45'}
              onChange={e => {
                const updated = [...zones]
                updated[i] = { ...updated[i], min_value: e.target.value }
                onChange(updated)
              }}
            />
            <input
              style={inputStyle}
              value={zone.max_value}
              placeholder={unit === 'min/km' ? '6:00' : '2:00'}
              onChange={e => {
                const updated = [...zones]
                updated[i] = { ...updated[i], max_value: e.target.value }
                onChange(updated)
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: COLORS.muted }}>
        Pace format: {unit === 'min/km' ? 'min:sec per km (e.g. 5:30)' : 'min:sec per 100m (e.g. 1:45)'}
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
  const [form, setForm] = useState({
    name: profile.name || '',
    sport: profile.sport || '',
    ftp: String(profile.ftp || ''),
    run_pace: profile.run_pace || '',
    css: profile.css || '',
    race_goal: profile.race_goal || '',
    race_date: profile.race_date || '',
  })

  const [benchmarks, setBenchmarks] = useState<FitnessBenchmark[]>([])
  const [runningZones, setRunningZones] = useState<ZoneRow[]>(DEFAULT_RUNNING_ZONES)
  const [swimmingZones, setSwimmingZones] = useState<ZoneRow[]>(DEFAULT_SWIMMING_ZONES)
  const [activeZoneTab, setActiveZoneTab] = useState<'cycling' | 'running' | 'swimming'>('cycling')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadingData, setLoadingData] = useState(true)

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

    if (zData && zData.length > 0) {
      const running = zData
        .filter(z => z.sport === 'running')
        .sort((a, b) => a.zone_number - b.zone_number)
      const swimming = zData
        .filter(z => z.sport === 'swimming')
        .sort((a, b) => a.zone_number - b.zone_number)

      if (running.length > 0) {
        setRunningZones(running.map(z => ({
          zone_number: z.zone_number,
          zone_name: z.zone_name,
          min_value: z.min_value ?? '',
          max_value: z.max_value ?? '',
        })))
      }
      if (swimming.length > 0) {
        setSwimmingZones(swimming.map(z => ({
          zone_number: z.zone_number,
          zone_name: z.zone_name,
          min_value: z.min_value ?? '',
          max_value: z.max_value ?? '',
        })))
      }
    }

    setLoadingData(false)
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
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      // Save all training zones — delete + re-insert
      await supabase.from('training_zones').delete().eq('user_id', user.id)

      const cyclingZones = calcCyclingZones(ftpNum)
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
        ...runningZones.map(z => ({
          user_id: user.id,
          sport: 'running',
          zone_number: z.zone_number,
          zone_name: z.zone_name,
          min_value: z.min_value || null,
          max_value: z.max_value || null,
          updated_at: now,
        })),
        ...swimmingZones.map(z => ({
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
    padding: '22px 24px',
    marginBottom: 20,
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: COLORS.muted,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    marginBottom: 18,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '28px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          padding: '32px 36px',
          width: '100%',
          maxWidth: 880,
          marginBottom: 28,
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
            <div>
              <label style={labelStyle}>CSS (min/100m)</label>
              <input
                style={inputStyle}
                value={form.css}
                onChange={e => setForm(f => ({ ...f, css: e.target.value }))}
                placeholder="e.g. 1:45"
              />
            </div>
            <div />
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <BenchmarkSparkline
                label="FTP"
                unit="w"
                color={COLORS.accent}
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
                color={COLORS.purple}
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {(['cycling', 'running', 'swimming'] as const).map(sport => (
              <button
                key={sport}
                onClick={() => setActiveZoneTab(sport)}
                style={{
                  padding: '7px 18px',
                  borderRadius: 8,
                  border: `1px solid ${activeZoneTab === sport ? COLORS.accent : COLORS.border}`,
                  background: activeZoneTab === sport ? COLORS.accentDim : 'transparent',
                  color: activeZoneTab === sport ? COLORS.accent : COLORS.muted,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  textTransform: 'capitalize', transition: 'all 0.12s',
                  fontFamily: 'inherit',
                }}
              >
                {sport}
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

          {/* Running — manual */}
          {activeZoneTab === 'running' && (
            <div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>
                Set your running pace zones manually. Faster pace = lower value (e.g. 4:00 is faster than 5:00).
              </div>
              <ZonesEditorTable
                zones={runningZones}
                onChange={setRunningZones}
                color={COLORS.green}
                unit="min/km"
              />
            </div>
          )}

          {/* Swimming — manual */}
          {activeZoneTab === 'swimming' && (
            <div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 14 }}>
                Set your swimming pace zones manually. Faster pace = lower value (e.g. 1:30 is faster than 2:00).
              </div>
              <ZonesEditorTable
                zones={swimmingZones}
                onChange={setSwimmingZones}
                color={COLORS.purple}
                unit="min/100m"
              />
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
  )
}
