import { useState } from 'react'
import { COLORS } from '../../lib/colors'
import { CalendarDay } from './CalendarDay'
import type { Workout } from '../../types'

interface CalendarGridProps {
  workouts: Workout[]
  onDayClick?: (date: Date, workouts: Workout[]) => void
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function CalendarGrid({ workouts, onDayClick }: CalendarGridProps) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const firstDay = new Date(year, month, 1).getDay()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const calDays: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calDays.length % 7 !== 0) calDays.push(null)

  // Support multiple workouts per day — group by day number
  const workoutsByDay = workouts.reduce<Record<number, Workout[]>>((acc, w) => {
    const d = new Date(w.date + 'T00:00:00')
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!acc[day]) acc[day] = []
      acc[day].push(w)
    }
    return acc
  }, {})

  const isToday = (day: number) =>
    day === now.getDate() && month === now.getMonth() && year === now.getFullYear()

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>
          {MONTHS[month]} {year}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={prevMonth}
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
          >
            ← Prev
          </button>
          <button
            onClick={nextMonth}
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
          >
            Next →
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {DAYS.map(d => (
          <div key={d} style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, textAlign: 'center', letterSpacing: '0.1em', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {calDays.map((day, i) => {
          const dayWorkouts = day ? (workoutsByDay[day] ?? []) : []
          return (
            <CalendarDay
              key={i}
              day={day}
              workouts={dayWorkouts}
              isToday={day !== null && isToday(day)}
              onClick={() => {
                if (day && onDayClick) {
                  onDayClick(new Date(year, month, day), dayWorkouts)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
