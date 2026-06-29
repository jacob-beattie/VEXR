import { useState, useEffect, useRef } from 'react'
import { COLORS } from '../lib/colors'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodEntry {
  id: string
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface FoodDbItem {
  name: string
  cal: number
  protein: number
  carbs: number
  fat: number
  source?: 'custom'
}

interface NutritionTargets {
  calorie_target: number
  protein_target: number
  carbs_target: number
  fat_target: number
}

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
type Meals = Record<MealKey, FoodEntry[]>

const MEAL_META: Record<MealKey, { label: string; icon: string; color: string }> = {
  breakfast: { label: 'Breakfast', icon: '☀',  color: COLORS.orange },
  lunch:     { label: 'Lunch',     icon: '◑',  color: COLORS.green  },
  dinner:    { label: 'Dinner',    icon: '☽',  color: COLORS.purple },
  snacks:    { label: 'Snacks',    icon: '⊙',  color: COLORS.accent },
}

const DEFAULT_TARGETS: NutritionTargets = {
  calorie_target: 2800,
  protein_target: 175,
  carbs_target: 320,
  fat_target: 85,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateFromOffset(offset: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Calorie Ring ─────────────────────────────────────────────────────────────

function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const pct = Math.min(consumed / target, 1)
  const r = 66
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  const over = consumed > target
  const ringColor = over ? COLORS.orange : pct >= 0.85 ? COLORS.green : COLORS.accent
  const remaining = Math.max(0, target - consumed)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <div style={{ position: 'relative', width: 164, height: 164 }}>
        <svg width="164" height="164" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="82" cy="82" r={r} fill="none" stroke={COLORS.subtle} strokeWidth={11} />
          <circle
            cx="82" cy="82" r={r} fill="none" stroke={ringColor} strokeWidth={11}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.55s ease, stroke 0.3s' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
            {consumed.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.04em' }}>kcal eaten</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: ringColor, marginTop: 2 }}>
            {over ? `+${(consumed - target).toLocaleString()} over` : `${remaining.toLocaleString()} left`}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 6, fontSize: 11, color: COLORS.muted, paddingInline: 4 }}>
        <span>
          <span style={{ color: COLORS.text, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{target.toLocaleString()}</span> target
        </span>
        <span style={{ fontWeight: 700 }}>{Math.round(pct * 100)}%</span>
      </div>
    </div>
  )
}

// ─── Macro Bar ────────────────────────────────────────────────────────────────

function MacroBar({ label, consumed, target, color }: { label: string; consumed: number; target: number; color: string }) {
  const pct = Math.min(consumed / target, 1)
  const over = consumed > target
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
          <span style={{ color: over ? COLORS.orange : COLORS.text, fontWeight: 700 }}>{consumed}g</span>
          <span style={{ color: COLORS.muted }}> / {target}g</span>
        </span>
      </div>
      <div style={{ height: 5, background: COLORS.subtle, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${pct * 100}%`, background: over ? COLORS.orange : color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function NutritionStatCard({ label, value, unit, sub, color }: {
  label: string
  value: string | number
  unit?: string
  sub: string
  color: string
}) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.9 }} />
      <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 7 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: COLORS.text, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: COLORS.muted, fontWeight: 500 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 12, color, fontWeight: 600 }}>{sub}</div>
    </div>
  )
}

// ─── Hydration Card ───────────────────────────────────────────────────────────

function HydrationCard({ hydration, onSetHydration }: { hydration: number; onSetHydration: (v: number) => void }) {
  const target = 3.0
  const pct = Math.min(hydration / target, 1)
  const cups = Math.round(hydration / 0.25)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.accent, opacity: 0.7 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Hydration</div>
        <div style={{ fontSize: 12, color: COLORS.accent, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
          {hydration.toFixed(2)}L <span style={{ color: COLORS.muted, fontWeight: 400 }}>/ {target}L</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const, marginBottom: 14 }}>
        {Array.from({ length: 12 }, (_, i) => {
          const filled = i < cups
          return (
            <button
              key={i}
              onClick={() => onSetHydration(parseFloat(((i + 1) * 0.25).toFixed(2)))}
              style={{
                width: 30, height: 34, borderRadius: 6, border: 'none',
                background: filled ? COLORS.accent + '20' : COLORS.subtle,
                outline: `1px solid ${filled ? COLORS.accent + '70' : COLORS.border}`,
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: filled ? COLORS.accent : COLORS.muted,
              }}
              onMouseEnter={e => {
                if (!filled) {
                  e.currentTarget.style.background = COLORS.accent + '10'
                  e.currentTarget.style.outline = `1px solid ${COLORS.accent}40`
                }
              }}
              onMouseLeave={e => {
                if (!filled) {
                  e.currentTarget.style.background = COLORS.subtle
                  e.currentTarget.style.outline = `1px solid ${COLORS.border}`
                }
              }}
            >◈</button>
          )
        })}
      </div>
      <div style={{ height: 5, background: COLORS.subtle, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${pct * 100}%`, background: COLORS.accent, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSetHydration(parseFloat(Math.max(0, hydration - 0.25).toFixed(2)))}
          style={{ flex: 1, padding: '7px 0', background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.muted; e.currentTarget.style.color = COLORS.text }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted }}
        >− 250ml</button>
        <button
          onClick={() => onSetHydration(parseFloat((hydration + 0.25).toFixed(2)))}
          style={{ flex: 1, padding: '7px 0', background: COLORS.accent + '15', border: `1px solid ${COLORS.accent}55`, borderRadius: 8, color: COLORS.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = COLORS.accent + '25' }}
          onMouseLeave={e => { e.currentTarget.style.background = COLORS.accent + '15' }}
        >+ 250ml</button>
      </div>
    </div>
  )
}

// ─── Add Food Modal ───────────────────────────────────────────────────────────

function AddFoodModal({ meal, builtinFoods, customFoods, onAdd, onSaveCustomFood, onClose }: {
  meal: MealKey
  builtinFoods: FoodDbItem[]
  customFoods: FoodDbItem[]
  onAdd: (meal: MealKey, food: FoodDbItem) => void
  onSaveCustomFood: (food: FoodDbItem) => Promise<void>
  onClose: () => void
}) {
  const [mode, setMode] = useState<'browse' | 'create'>('browse')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<FoodDbItem | null>(null)
  const [newName, setNewName] = useState('')
  const [newCal, setNewCal] = useState('')
  const [newProtein, setNewProtein] = useState('')
  const [newCarbs, setNewCarbs] = useState('')
  const [newFat, setNewFat] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => { inputRef.current?.focus() }, [mode])

  const allFoods = [...builtinFoods, ...customFoods]
  const filtered = allFoods.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 9)
  const { label, color } = MEAL_META[meal]
  const btnTextColor = '#fff'
  const canCreate = newName.trim() && newCal

  const handleCreate = async () => {
    if (!canCreate || saving) return
    setSaving(true)
    const food: FoodDbItem = {
      name: newName.trim(),
      cal: parseInt(newCal) || 0,
      protein: parseInt(newProtein) || 0,
      carbs: parseInt(newCarbs) || 0,
      fat: parseInt(newFat) || 0,
    }
    await onSaveCustomFood(food)
    onAdd(meal, food)
    onClose()
  }

  const cardStyle = isMobile
    ? { position: 'fixed' as const, inset: 0, zIndex: 400, background: COLORS.card, display: 'flex', flexDirection: 'column' as const, padding: 20 }
    : { position: 'fixed' as const, inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }

  const innerStyle = isMobile
    ? { display: 'flex', flexDirection: 'column' as const, height: '100%' }
    : { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24, width: 440, maxWidth: '92vw', maxHeight: '85vh', boxShadow: '0 12px 50px rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column' as const }

  return (
    <div style={cardStyle} onClick={e => !isMobile && e.target === e.currentTarget && onClose()}>
      <div style={innerStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>
            Add Food <span style={{ color }}>· {label}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: COLORS.bg, borderRadius: 9, padding: 3 }}>
          {(['browse', 'create'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
                background: mode === m ? COLORS.card : 'none',
                color: mode === m ? COLORS.text : COLORS.muted,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
                boxShadow: mode === m ? `0 1px 4px rgba(0,0,0,0.3)` : 'none',
              }}
            >{m === 'browse' ? 'Browse' : '+ Create Food'}</button>
          ))}
        </div>

        {mode === 'browse' ? (
          <>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="Search foods…"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 9,
                border: `1px solid ${COLORS.border}`, background: COLORS.bg,
                color: COLORS.text, fontSize: 13, fontFamily: 'inherit',
                marginBottom: 10, transition: 'border-color 0.15s', outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = COLORS.accent + '60')}
              onBlur={e => (e.currentTarget.style.borderColor = COLORS.border)}
            />
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
              {filtered.map((food, i) => {
                const isSel = selected?.name === food.name
                const isCustom = food.source === 'custom'
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(food)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 9, textAlign: 'left',
                      background: isSel ? COLORS.accentDim : COLORS.bg,
                      border: `1px solid ${isSel ? COLORS.accent + '55' : COLORS.border}`,
                      cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = COLORS.muted }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = COLORS.border }}
                  >
                    <span style={{ fontSize: 13, color: COLORS.text, fontWeight: isSel ? 600 : 400 }}>
                      {food.name}
                      {isCustom && <span style={{ fontSize: 9, color: COLORS.accent, fontWeight: 700, marginLeft: 6, letterSpacing: '0.06em' }}>CUSTOM</span>}
                    </span>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, flexShrink: 0, marginLeft: 10 }}>
                      <span style={{ color: COLORS.text, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{food.cal}</span>
                      <span style={{ color: COLORS.green }}>P{food.protein}</span>
                      <span style={{ color: COLORS.orange }}>C{food.carbs}</span>
                      <span style={{ color: COLORS.purple }}>F{food.fat}</span>
                    </div>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div style={{ color: COLORS.muted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                  No foods found —{' '}
                  <button onClick={() => { setMode('create'); setNewName(query) }} style={{ background: 'none', border: 'none', color: COLORS.accent, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 600 }}>create it?</button>
                </div>
              )}
            </div>
            {selected && (
              <div style={{ padding: '12px 14px', background: COLORS.bg, borderRadius: 9, border: `1px solid ${COLORS.accent}25`, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>{selected.name}</div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[
                    { v: String(selected.cal),     l: 'kcal',    c: COLORS.accent },
                    { v: `${selected.protein}g`,   l: 'protein', c: COLORS.green  },
                    { v: `${selected.carbs}g`,     l: 'carbs',   c: COLORS.orange },
                    { v: `${selected.fat}g`,       l: 'fat',     c: COLORS.purple },
                  ].map(({ v, l, c }) => (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ color: c, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15 }}>{v}</div>
                      <div style={{ color: COLORS.muted, fontSize: 10, marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => { if (selected) { onAdd(meal, selected); onClose() } }}
              disabled={!selected}
              style={{
                width: '100%', padding: 12, borderRadius: 10, border: 'none',
                background: selected ? color : COLORS.subtle,
                color: selected ? btnTextColor : COLORS.muted,
                fontSize: 13, fontWeight: 700,
                cursor: selected ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'all 0.15s',
                opacity: selected ? 1 : 0.5,
              }}
            >Add to {label}</button>
          </>
        ) : (
          <>
            {/* Create food form */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Food name</div>
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Chicken Thigh (200g)"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 9,
                    border: `1px solid ${COLORS.border}`, background: COLORS.bg,
                    color: COLORS.text, fontSize: 13, fontFamily: 'inherit',
                    outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = COLORS.accent + '60')}
                  onBlur={e => (e.currentTarget.style.borderColor = COLORS.border)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Calories', value: newCal, set: setNewCal, unit: 'kcal', color: COLORS.accent },
                  { label: 'Protein',  value: newProtein, set: setNewProtein, unit: 'g', color: COLORS.green },
                  { label: 'Carbs',    value: newCarbs,   set: setNewCarbs,   unit: 'g', color: COLORS.orange },
                  { label: 'Fat',      value: newFat,     set: setNewFat,     unit: 'g', color: COLORS.purple },
                ].map(({ label: lbl, value, set, unit, color: c }) => (
                  <div key={lbl}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{lbl}</span>
                      <span style={{ fontSize: 10, color: COLORS.muted }}>{unit}</span>
                    </div>
                    <input
                      type="number"
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="0"
                      className="no-spinner"
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 9,
                        border: `1px solid ${COLORS.border}`, background: COLORS.bg,
                        color: c, fontSize: 14, fontFamily: "'DM Mono', monospace",
                        fontWeight: 700, outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = c + '70')}
                      onBlur={e => (e.currentTarget.style.borderColor = COLORS.border)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!canCreate || saving}
              style={{
                width: '100%', padding: 12, borderRadius: 10, border: 'none',
                background: canCreate ? color : COLORS.subtle,
                color: canCreate ? btnTextColor : COLORS.muted,
                fontSize: 13, fontWeight: 700,
                cursor: canCreate ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'all 0.15s',
                opacity: canCreate ? 1 : 0.5, marginTop: 14,
              }}
            >{saving ? 'Saving…' : `Save & Add to ${label}`}</button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Meal Section ─────────────────────────────────────────────────────────────

function MealSection({ mealKey, items, onOpenAddModal, onRemove }: {
  mealKey: MealKey
  items: FoodEntry[]
  onOpenAddModal: (meal: MealKey) => void
  onRemove: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const { label, icon, color } = MEAL_META[mealKey]
  const totalCal = items.reduce((s, f) => s + f.calories, 0)

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 14px', background: COLORS.bg, border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13, color, width: 18, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, flex: 1 }}>{label}</span>
        {items.length > 0 && (
          <span style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'DM Mono', monospace" }}>{totalCal} kcal</span>
        )}
        <span style={{ fontSize: 9, color: COLORS.muted, marginLeft: 6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: COLORS.card }}>
          {items.length === 0 ? (
            <div style={{ padding: '9px 14px', fontSize: 12, color: COLORS.muted, fontStyle: 'italic' }}>Nothing logged yet</div>
          ) : items.map(food => (
            <div
              key={food.id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: `1px solid ${COLORS.border}` }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: COLORS.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{food.food_name}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, marginTop: 2 }}>
                  <span style={{ color: COLORS.green }}>P {food.protein}g</span>
                  <span style={{ color: COLORS.orange }}>C {food.carbs}g</span>
                  <span style={{ color: COLORS.purple }}>F {food.fat}g</span>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.text, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>{food.calories}</span>
              <span style={{ fontSize: 9, color: COLORS.muted, flexShrink: 0 }}>kcal</span>
              <button
                onClick={() => onRemove(food.id)}
                style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 17, cursor: 'pointer', padding: '0 2px', opacity: 0.45, transition: 'opacity 0.15s', lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}
              >×</button>
            </div>
          ))}
          <div style={{ padding: '10px 14px', borderTop: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => onOpenAddModal(mealKey)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', background: 'none', border: `1px dashed ${color}45`,
                borderRadius: 7, padding: '7px 12px', color, fontSize: 12,
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = color + '0e' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = color + '45'; e.currentTarget.style.background = 'none' }}
            >+ Add Food</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Targets Modal ───────────────────────────────────────────────────────────

function NutritionTargetsModal({ targets, onSave, onClose }: {
  targets: NutritionTargets
  onSave: (t: NutritionTargets) => void
  onClose: () => void
}) {
  const [cal, setCal] = useState(String(targets.calorie_target))
  const [protein, setProtein] = useState(String(targets.protein_target))
  const [carbs, setCarbs] = useState(String(targets.carbs_target))
  const [fat, setFat] = useState(String(targets.fat_target))
  const isMobile = useIsMobile()

  const fields = [
    { label: 'Calories', value: cal, set: setCal, unit: 'kcal', color: COLORS.accent },
    { label: 'Protein',  value: protein, set: setProtein, unit: 'g', color: COLORS.green },
    { label: 'Carbs',    value: carbs,   set: setCarbs,   unit: 'g', color: COLORS.orange },
    { label: 'Fat',      value: fat,     set: setFat,     unit: 'g', color: COLORS.purple },
  ]

  const handleSave = () => {
    onSave({
      calorie_target: parseInt(cal) || targets.calorie_target,
      protein_target: parseInt(protein) || targets.protein_target,
      carbs_target:   parseInt(carbs)   || targets.carbs_target,
      fat_target:     parseInt(fat)     || targets.fat_target,
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 450, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 24, width: isMobile ? '92vw' : 360, boxShadow: '0 12px 50px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>Edit Targets</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(({ label, value, set, unit, color }) => (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
                <span style={{ fontSize: 10, color: COLORS.muted }}>{unit}</span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  value={value}
                  onChange={e => set(e.target.value)}
                  className="no-spinner"
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 9,
                    border: `1px solid ${COLORS.border}`, background: COLORS.bg,
                    color: COLORS.text, fontSize: 15, fontFamily: "'DM Mono', monospace",
                    fontWeight: 700, outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = color + '80')}
                  onBlur={e => (e.currentTarget.style.borderColor = COLORS.border)}
                />
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, borderRadius: '0 9px 9px 0', background: color, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '11px 0', background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 10, color: COLORS.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.muted; e.currentTarget.style.color = COLORS.text }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.muted }}
          >Cancel</button>
          <button
            onClick={handleSave}
            style={{ flex: 1, padding: '11px 0', background: COLORS.accent, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#00c8e0')}
            onMouseLeave={e => (e.currentTarget.style.background = COLORS.accent)}
          >Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Workout Fuel Guide ───────────────────────────────────────────────────────

function WorkoutFuelCard() {
  const phases = [
    {
      label: 'Pre-Workout', time: '2–3h before', color: COLORS.orange,
      recs: ['Low fibre, moderate-high carbs', 'Rice + chicken or oats', 'Avoid fats and high fibre'],
    },
    {
      label: 'During', time: '> 60 min sessions', color: COLORS.accent,
      recs: ['30–60g carbs/hour', 'Gels, dates, or isotonic drinks', '500–750ml water per hour'],
    },
    {
      label: 'Recovery', time: 'Within 30 min', color: COLORS.green,
      recs: ['3:1 carb-to-protein ratio', 'Whey shake + banana', 'Rehydrate: 1.5× sweat loss'],
    },
  ]

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden', marginTop: 12 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.accent}, ${COLORS.green})` }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 16 }}>Workout Fuel Guide</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {phases.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 3, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.label}</span>
                <span style={{ fontSize: 10, color: COLORS.muted }}>{p.time}</span>
              </div>
              {p.recs.map((r, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLORS.muted, marginBottom: 3 }}>
                  <span style={{ color: p.color, fontSize: 7 }}>◆</span>{r}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Nutrition() {
  const isMobile = useIsMobile()
  const [dateOffset, setDateOffset] = useState(0)
  const [meals, setMeals] = useState<Meals>({ breakfast: [], lunch: [], dinner: [], snacks: [] })
  const [hydration, setHydration] = useState(0)
  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_TARGETS)
  const [builtinFoods, setBuiltinFoods] = useState<FoodDbItem[]>([])
  const [customFoods, setCustomFoods] = useState<FoodDbItem[]>([])
  const [addFoodModal, setAddFoodModal] = useState<MealKey | null>(null)
  const [showTargets, setShowTargets] = useState(false)
  const [loading, setLoading] = useState(false)

  const dateKey = toDateKey(dateFromOffset(dateOffset))

  // Fetch targets + custom foods once
  useEffect(() => {
    const fetchStatic = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [targetsRes, customRes, builtinRes] = await Promise.all([
        supabase.from('nutrition_targets').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('nutrition_custom_foods').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('food_database').select('*').order('name'),
      ])
      if (targetsRes.data) setTargets(targetsRes.data)
      if (customRes.data) {
        setCustomFoods(customRes.data.map(r => ({ name: r.name, cal: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, source: 'custom' as const })))
      }
      if (builtinRes.data) {
        setBuiltinFoods(builtinRes.data.map(r => ({ name: r.name, cal: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat })))
      }
    }
    fetchStatic()
  }, [])

  // Fetch logs + hydration when date changes
  useEffect(() => {
    const fetchDay = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const [logsRes, hydrRes] = await Promise.all([
        supabase.from('nutrition_logs').select('*').eq('user_id', user.id).eq('date', dateKey),
        supabase.from('hydration_logs').select('liters').eq('user_id', user.id).eq('date', dateKey).maybeSingle(),
      ])

      const rows = (logsRes.data ?? []) as (FoodEntry & { meal: MealKey })[]
      const newMeals: Meals = { breakfast: [], lunch: [], dinner: [], snacks: [] }
      for (const r of rows) {
        if (r.meal in newMeals) newMeals[r.meal].push(r)
      }
      setMeals(newMeals)
      setHydration(hydrRes.data?.liters ?? 0)
      setLoading(false)
    }
    fetchDay()
  }, [dateKey])

  const handleAddFood = async (meal: MealKey, food: FoodDbItem) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('nutrition_logs')
      .insert({ user_id: user.id, date: dateKey, meal, food_name: food.name, calories: food.cal, protein: food.protein, carbs: food.carbs, fat: food.fat })
      .select()
      .single()
    if (!error && data) setMeals(m => ({ ...m, [meal]: [...m[meal], data as FoodEntry] }))
  }

  const handleRemoveFood = async (id: string) => {
    await supabase.from('nutrition_logs').delete().eq('id', id)
    setMeals(m => {
      const updated = { ...m }
      for (const key of Object.keys(updated) as MealKey[]) {
        updated[key] = updated[key].filter(f => f.id !== id)
      }
      return updated
    })
  }

  const handleSetHydration = async (liters: number) => {
    setHydration(liters)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('hydration_logs').upsert({ user_id: user.id, date: dateKey, liters })
  }

  const handleSaveCustomFood = async (food: FoodDbItem) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('nutrition_custom_foods').insert({
      user_id: user.id, name: food.name, calories: food.cal,
      protein: food.protein, carbs: food.carbs, fat: food.fat,
    })
    setCustomFoods(prev => [...prev, { ...food, source: 'custom' as const }])
  }

  const handleSaveTargets = async (t: NutritionTargets) => {
    setTargets(t)
    setShowTargets(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('nutrition_targets').upsert({ user_id: user.id, ...t })
  }

  const allItems = Object.values(meals).flat()
  const totals = allItems.reduce(
    (s, f) => ({ cal: s.cal + f.calories, protein: s.protein + f.protein, carbs: s.carbs + f.carbs, fat: s.fat + f.fat }),
    { cal: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const proteinPct = totals.cal > 0 ? Math.round(totals.protein * 4 / totals.cal * 100) : 0
  const carbsPct   = totals.cal > 0 ? Math.round(totals.carbs   * 4 / totals.cal * 100) : 0
  const fatPct     = totals.cal > 0 ? Math.round(totals.fat     * 9 / totals.cal * 100) : 0

  const dateLabel = dateOffset === 0 ? 'Today' : dateOffset === -1 ? 'Yesterday' : dateOffset === 1 ? 'Tomorrow' : null
  const dateStr = dateFromOffset(dateOffset).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div>
      {/* Date navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <button
          onClick={() => setDateOffset(o => o - 1)}
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 13px', color: COLORS.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={e => (e.currentTarget.style.color = COLORS.muted)}
        >←</button>
        <div style={{ textAlign: 'center', minWidth: isMobile ? 130 : 160 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{dateLabel || dateStr}</div>
          {dateLabel && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>{dateStr}</div>}
        </div>
        <button
          onClick={() => setDateOffset(o => o + 1)}
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 13px', color: COLORS.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={e => (e.currentTarget.style.color = COLORS.muted)}
        >→</button>
        {dateOffset !== 0 && (
          <button
            onClick={() => setDateOffset(0)}
            style={{ background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 13px', color: COLORS.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = COLORS.accent + '60')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = COLORS.border)}
          >TODAY</button>
        )}
        {loading && <span style={{ fontSize: 11, color: COLORS.muted }}>…</span>}
        <button
          onClick={() => setShowTargets(true)}
          style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '7px 12px', color: COLORS.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}
          onMouseEnter={e => { e.currentTarget.style.color = COLORS.text; e.currentTarget.style.borderColor = COLORS.muted }}
          onMouseLeave={e => { e.currentTarget.style.color = COLORS.muted; e.currentTarget.style.borderColor = COLORS.border }}
        >⚙ Targets</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <NutritionStatCard
          label="Calories"
          value={totals.cal.toLocaleString()}
          unit="kcal"
          sub={totals.cal >= targets.calorie_target ? `+${(totals.cal - targets.calorie_target).toLocaleString()} over goal` : `${(targets.calorie_target - totals.cal).toLocaleString()} remaining`}
          color={COLORS.accent}
        />
        <NutritionStatCard
          label="Protein"
          value={totals.protein}
          unit="g"
          sub={totals.protein >= targets.protein_target ? 'Target reached' : `${targets.protein_target - totals.protein}g to go`}
          color={COLORS.green}
        />
        <NutritionStatCard
          label="Carbohydrates"
          value={totals.carbs}
          unit="g"
          sub={totals.carbs >= targets.carbs_target ? 'Target reached' : `${targets.carbs_target - totals.carbs}g to go`}
          color={COLORS.orange}
        />
        <NutritionStatCard
          label="Fat"
          value={totals.fat}
          unit="g"
          sub={totals.fat >= targets.fat_target ? 'Target reached' : `${targets.fat_target - totals.fat}g to go`}
          color={COLORS.purple}
        />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '56% 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Daily Summary */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: COLORS.accent, opacity: 0.65 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 18 }}>Daily Summary</div>
            <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: isMobile ? 'wrap' : 'nowrap' as const }}>
              <CalorieRing consumed={totals.cal} target={targets.calorie_target} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8, minWidth: isMobile ? '100%' : 0 }}>
                <MacroBar label="Protein" consumed={totals.protein} target={targets.protein_target} color={COLORS.green} />
                <MacroBar label="Carbs"   consumed={totals.carbs}   target={targets.carbs_target}   color={COLORS.orange} />
                <MacroBar label="Fat"     consumed={totals.fat}     target={targets.fat_target}     color={COLORS.purple} />
                {totals.cal > 0 && (
                  <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 13 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Macro Split</div>
                    <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                      <div style={{ width: `${proteinPct}%`, background: COLORS.green,  transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${carbsPct}%`,   background: COLORS.orange, transition: 'width 0.5s ease' }} />
                      <div style={{ width: `${fatPct}%`,     background: COLORS.purple, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 7 }}>
                      {[
                        { l: 'Protein', pct: proteinPct, c: COLORS.green  },
                        { l: 'Carbs',   pct: carbsPct,   c: COLORS.orange },
                        { l: 'Fat',     pct: fatPct,     c: COLORS.purple },
                      ].map(({ l, pct, c }) => (
                        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: COLORS.muted }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                          {l} <span style={{ color: COLORS.text, fontWeight: 700 }}>{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Hydration */}
          <HydrationCard hydration={hydration} onSetHydration={handleSetHydration} />
        </div>

        {/* Right column */}
        <div>
          {/* Meal Log */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${COLORS.orange}, ${COLORS.green}, ${COLORS.purple}, ${COLORS.accent})` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Meal Log</div>
              <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: "'DM Mono', monospace" }}>
                {allItems.length} items
              </div>
            </div>
            {(['breakfast', 'lunch', 'dinner', 'snacks'] as MealKey[]).map(key => (
              <MealSection
                key={key}
                mealKey={key}
                items={meals[key]}
                onOpenAddModal={setAddFoodModal}
                onRemove={handleRemoveFood}
              />
            ))}
          </div>

          {/* Fuel Guide */}
          <WorkoutFuelCard />
        </div>
      </div>

      {/* Add Food Modal */}
      {addFoodModal && (
        <AddFoodModal
          meal={addFoodModal}
          builtinFoods={builtinFoods}
          customFoods={customFoods}
          onAdd={handleAddFood}
          onSaveCustomFood={handleSaveCustomFood}
          onClose={() => setAddFoodModal(null)}
        />
      )}

      {/* Targets Modal */}
      {showTargets && (
        <NutritionTargetsModal
          targets={targets}
          onSave={handleSaveTargets}
          onClose={() => setShowTargets(false)}
        />
      )}
    </div>
  )
}
