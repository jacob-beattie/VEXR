import { useState, useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { COLORS } from '../../lib/colors'
import type { ParsedSession, SessionSport } from '../../types'
import { ImportReviewScreen } from './ImportReviewScreen'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ── Helpers ──────────────────────────────────────────────────────────────────

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' ')
    )
  }
  return pages.join('\n')
}

function extractHtmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.innerText
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

const VALID_SPORTS: SessionSport[] = ['swim', 'bike', 'run', 'sc', 'brick', 'other', 'rest']

function toSessionSport(s: string): SessionSport {
  return VALID_SPORTS.includes(s as SessionSport) ? (s as SessionSport) : 'other'
}

interface EdgeSession {
  week: number
  day_of_week: string
  sport: string
  title: string
  duration_minutes: number | null
  target_metric: string
  scheduled_date: string | null
  has_conflict: boolean
}

function mapEdgeSessions(raw: EdgeSession[]): ParsedSession[] {
  return raw.map((s, i) => ({
    id: i + 1,
    week: s.week,
    sport: toSessionSport(s.sport),
    title: s.title,
    date: s.scheduled_date ? formatDisplayDate(s.scheduled_date) : `Wk ${s.week} ${s.day_of_week ?? ''}`,
    dur: s.duration_minutes != null ? `${s.duration_minutes} min` : '',
    metric: s.target_metric ?? '',
    conflict: s.has_conflict,
    scheduledDate: s.scheduled_date ?? null,
  }))
}

function getErrorMessage(code: string): string {
  if (code === 'parse_failed') return 'Parsing failed. Try again or use the text paste option.'
  if (code === 'content_too_large') return 'This document is too large. Try pasting the text directly instead.'
  return 'Something went wrong. Check your connection and try again.'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PARSE_MESSAGES = [
  'Reading your plan...',
  'Extracting sessions...',
  'Mapping training zones...',
]

// ── Component ─────────────────────────────────────────────────────────────────

interface ImportModalProps {
  onClose: () => void
  onImportSuccess?: (message: string) => void
}

export function ImportModal({ onClose, onImportSuccess }: ImportModalProps) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [uploadTab, setUploadTab] = useState<'pdf' | 'html' | 'text'>('pdf')
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({ startDate: '', raceDate: '', planName: '' })
  const [pastedText, setPastedText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseMessages, setParseMessages] = useState<string[]>([])
  const [parsedSessions, setParsedSessions] = useState<ParsedSession[]>([])
  const [parsedPlanName, setParsedPlanName] = useState('')
  const [parsedRaceName, setParsedRaceName] = useState('')
  const [sportFilter, setSportFilter] = useState('all')
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({})
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingParseRef = useRef<Promise<ParsedSession[]> | null>(null)

  // Sync openWeeks when sessions change
  useEffect(() => {
    const weeks = Array.from(new Set(parsedSessions.map(s => s.week)))
    setOpenWeeks(Object.fromEntries(weeks.map(w => [w, true])))
  }, [parsedSessions])

  // ── Step 2: animation + await API ──────────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return

    let cancelled = false
    setParseMessages([])

    // Animation
    let msgIdx = 0
    const msgTimers: ReturnType<typeof setTimeout>[] = []
    const showMsg = () => {
      if (cancelled) return
      if (msgIdx < PARSE_MESSAGES.length) {
        const msg = PARSE_MESSAGES[msgIdx]
        setParseMessages(prev => [...prev, msg])
        msgIdx++
        msgTimers.push(setTimeout(showMsg, 900))
      }
    }
    msgTimers.push(setTimeout(showMsg, 300))

    // Wait for both animation and API
    const animDone = new Promise<void>(resolve => setTimeout(resolve, 3200))
    const apiCall = pendingParseRef.current ?? Promise.reject('No parse call initiated')

    Promise.all([animDone, apiCall])
      .then(([, sessions]) => {
        if (!cancelled) {
          setParsedSessions(sessions)
          setStep(3)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = typeof err === 'string' ? err : 'Something went wrong. Check your connection and try again.'
          setParseError(msg)
          setStep(1)
        }
      })

    return () => {
      cancelled = true
      msgTimers.forEach(clearTimeout)
    }
  }, [step])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFileSelect = (file: File) => {
    setUploadedFile(file)
    setParseError(null)
  }

  const handleParse = async () => {
    setParseError(null)
    setExtracting(true)
    try {
      let content = ''

      if (uploadTab === 'text') {
        content = pastedText.trim()
      } else if (uploadedFile) {
        if (uploadTab === 'pdf') {
          content = await extractPdfText(uploadedFile)
        } else {
          const raw = await uploadedFile.text()
          content = extractHtmlText(raw)
        }
      }

      if (!content) {
        setParseError(
          uploadTab === 'text'
            ? 'Please paste your training plan text.'
            : 'Please upload a file first.'
        )
        return
      }

      // Kick off API call before transitioning (runs concurrently with animation)
      pendingParseRef.current = callParseApi(
        content,
        uploadTab,
        formData.startDate,
        formData.raceDate,
        formData.planName,
      )

      setStep(2)
    } catch {
      setParseError('Could not read the file. Try again or use the text paste option.')
    } finally {
      setExtracting(false)
    }
  }

  const callParseApi = async (
    content: string,
    contentType: 'pdf' | 'html' | 'text',
    startDate: string,
    raceDate: string,
    planName: string,
  ): Promise<ParsedSession[]> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw 'Something went wrong. Check your connection and try again.'

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

    let res: Response
    try {
      res = await fetch(`${supabaseUrl}/functions/v1/parse-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ content, contentType, startDate, raceDate, planName }),
      })
    } catch {
      throw 'Something went wrong. Check your connection and try again.'
    }

    const data = await res.json()

    if (!res.ok) {
      throw getErrorMessage(data.error ?? '')
    }

    if (data.plan_name) setParsedPlanName(data.plan_name)
    if (data.race_name) setParsedRaceName(data.race_name)

    const sessions: ParsedSession[] = mapEdgeSessions(data.sessions ?? [])

    if (sessions.length === 0) {
      throw 'No sessions were found. Check the format and try again.'
    }

    return sessions
  }

  const toggleWeek = (w: number) => setOpenWeeks(prev => ({ ...prev, [w]: !prev[w] }))

  const handleImport = async () => {
    setImportError(null)
    setImporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const maxWeek = parsedSessions.length > 0 ? Math.max(...parsedSessions.map(s => s.week)) : 1

      const { data: plan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: user.id,
          name: parsedPlanName || formData.planName || 'Imported Plan',
          sport: 'triathlon',
          total_weeks: maxWeek,
          current_week: 0,
          status: 'upcoming',
          race_name: parsedRaceName || null,
          race_date: formData.raceDate || null,
          start_date: formData.startDate || null,
          source: 'import',
        })
        .select()
        .single()

      if (planError) throw planError

      const { error: sessionsError } = await supabase.from('training_sessions').insert(
        parsedSessions.map(s => ({
          user_id: user.id,
          plan_id: plan.id,
          week_number: s.week,
          sport: s.sport === 'rest' ? 'other' : s.sport,
          title: s.title,
          scheduled_date: s.scheduledDate ?? null,
          duration_min: parseInt(s.dur) || null,
          target_metric: s.metric || null,
          has_conflict: s.conflict,
          status: 'pending',
        }))
      )

      if (sessionsError) throw sessionsError

      // Also write to workouts table (planned: true) so sessions appear on the calendar.
      // Only sessions with a resolved date are written; rest days are skipped.
      const SPORT_TO_TYPE: Record<string, string> = {
        swim: 'swim', bike: 'ride', run: 'run',
        sc: 'strength', brick: 'ride', other: 'strength',
      }
      const calendarRows = parsedSessions
        .filter(s => s.scheduledDate && s.sport !== 'rest')
        .map(s => ({
          user_id: user.id,
          plan_id: plan.id,
          title: s.title,
          type: SPORT_TO_TYPE[s.sport] ?? 'run',
          date: s.scheduledDate!,
          duration_minutes: parseInt(s.dur) || 0,
          tss: 0,
          planned: true,
          notes: s.metric || null,
        }))

      if (calendarRows.length > 0) {
        const { error: workoutsError } = await supabase.from('workouts').insert(calendarRows)
        if (workoutsError) throw workoutsError
      }

      onImportSuccess?.(`Plan imported. ${parsedSessions.length} sessions added to your calendar.`)
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
        : 'Import failed. Please try again.'
      setImportError(msg || 'Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const labelStyle = {
    display: 'block' as const,
    fontSize: 11, fontWeight: 700, color: COLORS.muted,
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    marginBottom: 7, fontFamily: 'DM Mono, monospace',
  }

  const modalWidth = isMobile ? '100%' : step === 3 ? 820 : 680

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        zIndex: 200,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
      onClick={e => !isMobile && e.target === e.currentTarget && onClose()}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={uploadTab === 'pdf' ? '.pdf' : '.html,.htm'}
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFileSelect(file)
          e.target.value = ''
        }}
      />

      <div style={{
        background: COLORS.surface,
        border: isMobile ? 'none' : `1px solid ${COLORS.border}`,
        borderRadius: isMobile ? '18px 18px 0 0' : 18,
        width: modalWidth,
        maxWidth: isMobile ? '100%' : undefined,
        height: isMobile ? '95dvh' : '88vh',
        maxHeight: isMobile ? '95dvh' : '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(14,165,233,0.12)',
        animation: 'fadeSlideUp 0.25s ease',
      }}>

        {/* ── Step 1 — Upload ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{
              padding: isMobile ? '20px 20px 16px' : '22px 28px 20px',
              borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>Import Training Plan</div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>Step 1 of 3 — Upload your plan</div>
              </div>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: COLORS.muted,
                fontSize: 22, cursor: 'pointer', padding: '4px 8px', lineHeight: 1, borderRadius: 6,
              }}>×</button>
            </div>

            {/* Body */}
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: isMobile ? '20px' : '24px 28px',
              display: 'flex', flexDirection: 'column', gap: 20,
            }}>
              {/* Error banner */}
              {parseError && (
                <div style={{
                  background: `${COLORS.orange}15`,
                  border: `1px solid ${COLORS.orange}40`,
                  borderRadius: 8, padding: '12px 14px',
                  fontSize: 13, color: COLORS.orange,
                }}>
                  {parseError}
                </div>
              )}

              {/* Upload type tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.border}` }}>
                {(['pdf', 'html', 'text'] as const).map(t => (
                  <button
                    key={t}
                    className={`upload-tab${uploadTab === t ? ' active' : ''}`}
                    onClick={() => { setUploadTab(t); setUploadedFile(null); setParseError(null) }}
                  >
                    {t === 'pdf' ? 'PDF' : t === 'html' ? 'HTML' : 'Text'}
                  </button>
                ))}
              </div>

              {/* Upload area or textarea */}
              {uploadTab !== 'text' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setIsDragging(false)
                    const file = e.dataTransfer.files?.[0]
                    if (file) handleFileSelect(file)
                  }}
                  onDragOver={e => e.preventDefault()}
                  style={{
                    border: `2px dashed ${isDragging ? COLORS.accent : COLORS.border}`,
                    borderRadius: 12,
                    padding: '40px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: isDragging ? COLORS.accentDim : 'transparent',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  {uploadedFile ? (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.7 }}>📄</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>
                        {uploadedFile.name}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>
                        Click to replace
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>⬆</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 6 }}>
                        Drop your {uploadTab.toUpperCase()} here
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 16 }}>
                        or click to browse your files
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
                        style={{
                          background: COLORS.accentDim, border: `1px solid ${COLORS.accent}40`,
                          color: COLORS.accent, borderRadius: 8, padding: '8px 18px',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'Inter, Helvetica Neue, sans-serif',
                        }}
                      >Browse files</button>
                      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 16, opacity: 0.7 }}>
                        {uploadTab === 'pdf' ? 'PDF up to 20MB' : 'HTML file up to 10MB'}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  className="plans-field-input"
                  placeholder="Paste your training plan here... Coach emails, spreadsheet data, or any structured text works great."
                  rows={10}
                  value={pastedText}
                  onChange={e => { setPastedText(e.target.value); setParseError(null) }}
                  style={{ resize: 'vertical', lineHeight: 1.6 }}
                />
              )}

              {/* Date inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Plan Start Date</label>
                  <input
                    type="date"
                    className="plans-field-input"
                    value={formData.startDate}
                    onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Race Date</label>
                  <input
                    type="date"
                    className="plans-field-input"
                    value={formData.raceDate}
                    onChange={e => setFormData(f => ({ ...f, raceDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* Plan name */}
              <div>
                <label style={labelStyle}>
                  Plan Name{' '}
                  <span style={{ color: COLORS.subtle, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  className="plans-field-input"
                  placeholder="e.g. Ironman 70.3 Build Phase"
                  value={formData.planName}
                  onChange={e => setFormData(f => ({ ...f, planName: e.target.value }))}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: isMobile ? '16px 20px' : '18px 28px', borderTop: `1px solid ${COLORS.border}` }}>
              <button
                className="purple-glow-btn"
                onClick={handleParse}
                disabled={extracting}
                style={{ width: '100%', padding: 14, fontSize: 14 }}
              >
                {extracting ? 'Reading file...' : 'Parse Plan →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 — Parsing ── */}
        {step === 2 && (
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px', gap: 0,
          }}>
            {/* Spinner */}
            <div style={{ position: 'relative', marginBottom: 36 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                border: `3px solid ${COLORS.accent}20`,
                borderTop: `3px solid ${COLORS.accent}`,
                animation: 'spin 0.9s linear infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>≡</div>
            </div>

            {/* Messages */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              minHeight: 120, alignSelf: 'center',
            }}>
              {parseMessages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  animation: 'msgAppear 0.35s ease',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: `${COLORS.accent}25`,
                    border: `1px solid ${COLORS.accent}60`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: COLORS.accent, flexShrink: 0,
                  }}>✓</div>
                  <span style={{
                    fontSize: 14,
                    color: i === parseMessages.length - 1 ? COLORS.text : COLORS.muted,
                    fontWeight: i === parseMessages.length - 1 ? 600 : 400,
                  }}>{msg}</span>
                </div>
              ))}

              {/* Pending next message preview */}
              {parseMessages.length < PARSE_MESSAGES.length && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: `${COLORS.accent}10`,
                    border: `1px solid ${COLORS.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: COLORS.muted, flexShrink: 0,
                    animation: 'pulse-ring 1.4s ease-in-out infinite',
                  }}>·</div>
                  <span style={{ fontSize: 14, color: COLORS.muted }}>
                    {PARSE_MESSAGES[parseMessages.length]}
                  </span>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div style={{
              width: 280, marginTop: 32,
              background: COLORS.subtle, borderRadius: 4, height: 3, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${(parseMessages.length / PARSE_MESSAGES.length) * 100}%`,
                background: COLORS.accent,
                borderRadius: 4,
                transition: 'width 0.5s ease',
                boxShadow: `0 0 8px ${COLORS.accent}`,
              }} />
            </div>
          </div>
        )}

        {/* ── Step 3 — Review ── */}
        {step === 3 && (
          <ImportReviewScreen
            parsedSessions={parsedSessions}
            formData={{ ...formData, planName: parsedPlanName || formData.planName }}
            sportFilter={sportFilter}
            setSportFilter={setSportFilter}
            openWeeks={openWeeks}
            toggleWeek={toggleWeek}
            onClose={onClose}
            onImport={handleImport}
            importing={importing}
            importError={importError}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  )
}
