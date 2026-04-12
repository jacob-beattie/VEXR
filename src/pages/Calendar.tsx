import { useState } from 'react'
import { useWorkouts } from '../contexts/WorkoutsContext'
import { CalendarGrid } from '../components/calendar/CalendarGrid'
import { LogWorkoutModal } from '../components/LogWorkoutModal'
import { WorkoutDetailModal } from '../components/WorkoutDetailModal'
import { DayWorkoutsModal } from '../components/DayWorkoutsModal'
import type { Workout } from '../types'

export function Calendar() {
  const { workouts, addWorkout, updateWorkout, deleteWorkout } = useWorkouts()

  // Which modal is open
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dayWorkouts, setDayWorkouts] = useState<Workout[]>([])
  const [detailWorkout, setDetailWorkout] = useState<Workout | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)

  const handleDayClick = (date: Date, clicked: Workout[]) => {
    if (clicked.length === 0) {
      // Empty day → log modal
      setSelectedDate(date)
      setShowLogModal(true)
    } else if (clicked.length === 1) {
      // Single workout → go straight to detail
      setDetailWorkout(clicked[0])
    } else {
      // Multiple workouts → show day list first
      setSelectedDate(date)
      setDayWorkouts(clicked)
    }
  }

  const closeAll = () => {
    setDayWorkouts([])
    setDetailWorkout(null)
    setSelectedDate(null)
    setShowLogModal(false)
  }

  const logDate = selectedDate?.toISOString().split('T')[0]

  return (
    <>
      <CalendarGrid workouts={workouts} onDayClick={handleDayClick} />

      {/* Multi-workout day list */}
      {dayWorkouts.length > 1 && !detailWorkout && (
        <DayWorkoutsModal
          date={selectedDate!}
          workouts={dayWorkouts}
          onSelectWorkout={w => setDetailWorkout(w)}
          onAddWorkout={() => {
            setDayWorkouts([])
            setShowLogModal(true)
          }}
          onClose={closeAll}
        />
      )}

      {/* Single workout detail / edit */}
      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          onClose={closeAll}
          onDelete={async (id) => {
            await deleteWorkout(id)
            closeAll()
          }}
          onUpdate={async (id, updates) => {
            await updateWorkout(id, updates)
            closeAll()
          }}
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
