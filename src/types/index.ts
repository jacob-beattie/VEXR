export type WorkoutType = 'run' | 'ride' | 'swim' | 'strength' | 'rest'

export interface Workout {
  id: string
  user_id: string
  title: string
  type: WorkoutType
  date: string
  duration_minutes: number
  tss: number
  zone?: string
  notes?: string
  planned: boolean
  created_at: string
}

export interface Profile {
  id: string
  name: string
  sport: string
  ftp: number
  run_pace: string
  css: string
  race_goal?: string
  race_date?: string
}

export interface TrainingPlan {
  id: string
  user_id: string
  name: string
  sport: string
  total_weeks: number
  current_week: number
  status: 'active' | 'complete' | 'upcoming'
}

export interface WorkoutLibraryItem {
  id: string
  user_id: string
  name: string
  type: WorkoutType
  duration_minutes: number
  tss: number
  description: string
}
