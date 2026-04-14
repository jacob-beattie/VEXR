export type WorkoutType = 'run' | 'ride' | 'swim' | 'strength' | 'rest'

export type BlockType = 'warmup' | 'interval' | 'rest' | 'cooldown'

export interface WorkoutBlock {
  id: string
  blockType: BlockType
  durationMinutes: number
  reps: number       // 1 = single, 3 = "3×"
  intensity: string  // "70" = 70% FTP/CSS for ride/swim, "5:00" = pace/km for run
  notes?: string
}

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
  structure?: WorkoutBlock[] | null
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

export interface FitnessBenchmark {
  id: string
  user_id: string
  metric: 'ftp' | 'pace' | 'css'
  value: string
  recorded_at: string
}

export interface TrainingZone {
  id: string
  user_id: string
  sport: 'cycling' | 'running' | 'swimming'
  zone_number: number
  zone_name: string
  min_value: string | null
  max_value: string | null
  updated_at: string
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
