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
  strava_activity_id?: number | null
  heart_rate_avg?: number | null
  heart_rate_max?: number | null
  distance_meters?: number | null
  calories?: number | null
  elevation_gain?: number | null
  avg_power?: number | null
  avg_pace?: string | null
  created_at: string
}

export interface StravaConnection {
  athlete_id: number
  athlete_name: string | null
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
  onboarding_completed?: boolean
  max_hr?: number | null
  avatar_url?: string | null
}

export interface TrainingPlan {
  id: string
  user_id: string
  name: string
  sport: string
  total_weeks: number
  current_week: number
  status: 'active' | 'complete' | 'upcoming' | 'archived'
  race_name?: string | null
  race_date?: string | null
  start_date?: string | null
  source?: string | null
  total_sessions?: number
}

export type SessionSport = 'swim' | 'bike' | 'run' | 'sc' | 'brick' | 'other' | 'rest'

export interface ParsedSession {
  id: number
  week: number
  sport: SessionSport
  title: string
  date: string       // display string e.g. "Mon 6 Jan"
  dur: string        // display string e.g. "45 min"
  metric: string
  conflict: boolean
  scheduledDate?: string | null  // ISO date from edge function
}

export interface TrainingSession {
  id: string
  user_id: string
  plan_id: string
  week_number: number
  sport: SessionSport
  title: string
  scheduled_date?: string | null
  duration_min?: number | null
  target_metric?: string | null
  notes?: string | null
  status: 'pending' | 'completed' | 'skipped'
  has_conflict: boolean
  created_at: string
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
