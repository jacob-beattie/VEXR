import { useState } from 'react'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { CalendarGrid } from '../components/calendar/CalendarGrid'
import { WeeklySummary } from '../components/calendar/WeeklySummary'
import { DayBottomSheet } from '../components/calendar/DayBottomSheet'
import { LogWorkoutModal } from '../components/LogWorkoutModal'
import { WorkoutDetailModal } from '../components/WorkoutDetailModal'
import { DayWorkoutsModal } from '../components/DayWorkoutsModal'
import type { Workout } from '../types'

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

export function Calendar() {
  const { workouts, addWorkout, updateWorkout, deleteWorkout } = useWorkouts()
  const isMobile = useIsMobile()
  const now = new Date()

  // ── Navigation state ────────────────────────────────────────────────────────
  const [view, setView] = useState<'month' | 'week'>('week')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [weekStart, setWeekStart] = useState<Date>(getMondayOfWeek(now))

  // ── Modal / sheet state ─────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dayWorkouts, setDayWorkouts] = useState<Workout[]>([])
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showBottomSheet, setShowBottomSheet] = useState(false)

  // ── Navigation handlers ─────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }
  const prevWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }
  const nextWeek = () => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  const handleViewChange = (v: 'month' | 'week') => {
    if (v === 'week') {
      const base = month === now.getMonth() && year === now.getFullYear()
        ? now
        : new Date(year, month, 1)
      setWeekStart(getMondayOfWeek(base))
    }
    setView(v)
  }

  // ── Day click ───────────────────────────────────────────────────────────────
  const handleDayClick = (date: Date, clicked: Workout[]) => {
    if (clicked.length === 0) {
      setSelectedDate(date)
      setShowLogModal(true)
      return
    }

    setSelectedDate(date)
    setDayWorkouts(clicked)

    if (isMobile) {
      // Mobile: always use bottom sheet for any day with workouts
      setShowBottomSheet(true)
    } else {
      // Desktop: single workout → detail modal, multiple → list modal
      if (clicked.length === 1) {
        setDetailWorkout(clicked[0])
      }
      // multiple: dayWorkouts state already set, DayWorkoutsModal will render
    }
  }

  const closeAll = () => {
    setDayWorkouts([])
    setDetailWorkout(null)
    setSelectedDate(null)
    setShowLogModal(false)
    setShowBottomSheet(false)
  }

  const logDate = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : undefined

  const summaryWeekStart = view === 'week' ? weekStart : getMondayOfWeek(now)

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <WeeklySummary workouts={workouts} weekStart={summaryWeekStart} />
        <CalendarGrid
          workouts={workouts}
          view={view}
          year={year}
          month={month}
          weekStart={weekStart}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onPrevWeek={prevWeek}
          onNextWeek={nextWeek}
          onViewChange={handleViewChange}
          onDayClick={handleDayClick}
          onWorkoutClick={w => setDetailWorkout(w)}
        />
      </div>

      {/* Mobile: bottom sheet for day workouts */}
      {isMobile && showBottomSheet && selectedDate && !detailWorkout && (
        <DayBottomSheet
          date={selectedDate}
          workouts={dayWorkouts}
          onSelectWorkout={w => { setShowBottomSheet(false); setDetailWorkout(w) }}
          onAddWorkout={() => { setShowBottomSheet(false); setShowLogModal(true) }}
          onClose={closeAll}
        />
      )}

      {/* Desktop: multi-workout day list modal */}
      {!isMobile && dayWorkouts.length > 1 && !detailWorkout && (
        <DayWorkoutsModal
          date={selectedDate!}
          workouts={dayWorkouts}
          onSelectWorkout={w => setDetailWorkout(w)}
          onAddWorkout={() => { setDayWorkouts([]); setShowLogModal(true) }}
          onClose={closeAll}
        />
      )}

      {/* Workout detail */}
      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          onClose={closeAll}
          onDelete={async (id) => { await deleteWorkout(id); closeAll() }}
          onUpdate={async (id, updates) => { await updateWorkout(id, updates); closeAll() }}
        />
      )}

      {/* Log new workout */}
      {showLogModal && (
        <LogWorkoutModal
          onClose={closeAll}
          onSubmit={addWorkout}
          initialDate={logDate}
        />
      )}
    </>
  )
}
