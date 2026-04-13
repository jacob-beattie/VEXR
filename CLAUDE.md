# Vexr — Project Context

## What this is

A TrainingPeaks-style endurance training app for triathletes and endurance athletes.
Built as a solo project. Goal is to eventually monetise with free/pro/coach tiers.

## Tech Stack

- React + Vite + TypeScript
- Supabase (auth + database + realtime)
- Recharts (all charts)
- No Tailwind — all styles are inline using the COLORS object from `src/lib/colors.ts`

## Design System

- Dark theme only, no light mode
- Colors: `src/lib/colors.ts` — always import COLORS from here, never hardcode hex values
- Fonts: Inter for body, DM Mono for numbers/stats
- Border radius: 8–16px depending on context (cards = 12–16px, inputs = 8px, badges = 6px)
- All layout is inline styles — no Tailwind classes, no CSS modules

## File Structure

```
src/
  lib/           — supabase client, color constants
  types/         — all TypeScript interfaces (index.ts)
  hooks/         — useAuth
  contexts/      — WorkoutsContext (workouts + derived fitness metrics)
  pages/         — Dashboard, Calendar, Analytics, Plans, Library, Login, Signup
  components/
    layout/      — Sidebar, TopBar
    ui/          — Button, Badge
    dashboard/   — StatCard, WeeklyLoadChart, FitnessChart, UpcomingWorkouts
    calendar/    — CalendarGrid, CalendarDay
    analytics/   — AnalyticsPage
    plans/       — PlansPage
    library/     — LibraryPage
    LogWorkoutModal.tsx
    WorkoutDetailModal.tsx
    DayWorkoutsModal.tsx
    ProfileSettingsModal.tsx
```

## Database (Supabase)

Tables (all with RLS enabled, users can only access their own rows):

| Table | Key columns |
|---|---|
| `profiles` | id (= auth user id), name, sport, ftp, run_pace, css, race_goal, race_date |
| `workouts` | user_id, title, type, date, duration_minutes, tss, zone, notes, planned |
| `training_plans` | user_id, name, sport, total_weeks, current_week, status |
| `workout_library` | user_id, name, type, duration_minutes, tss, description |
| `fitness_benchmarks` | user_id, metric (ftp/pace/css), value (text), recorded_at |
| `training_zones` | user_id, sport (cycling/running/swimming), zone_number, zone_name, min_value, max_value, updated_at |

Profile is auto-created on signup via `handle_new_user` trigger.

## Architecture

- `ProtectedLayout` in App.tsx handles auth guard + profile fetch
- `WorkoutsProvider` wraps the app shell — provides workouts + derived metrics via context
- `AppShell` renders Sidebar + TopBar + Routes + modals
- Real-time sync via Supabase channel on the workouts table

## CTL/ATL/TSB Calculation

Exponential weighted moving average (TrainingPeaks PMC model):
- CTL: 42-day time constant (1/42 decay)
- ATL: 7-day time constant (1/7 decay)
- TSB: CTL − ATL
- Calculated in `WorkoutsContext.tsx` — `calculateFitnessMetrics()` and `getFitnessHistory()`

## Features Shipped

- Auth: email/password, Supabase RLS
- Workout logging modal with all fields
- Calendar: monthly view, multi-workout cells, day modal
- Workout detail: view, inline edit, delete
- Dashboard: CTL/ATL/TSB cards, weekly TSS bar chart, fitness/fatigue/form line chart, upcoming workouts
- Analytics: sport breakdown, fitness/fatigue area chart, TSS distribution
- Training Plans: create, start, complete, delete
- Workout Library: save templates, filter, delete
- Real-time sync
- Profile Settings: edit name/sport/FTP/pace/CSS/race goal, benchmark history charts, training zones (cycling auto-calc, running/swimming manual)

## Rules

- Always use the existing COLORS object — never hardcode colors
- Never use hardcoded mock data — all data comes from Supabase
- Inline styles only — no Tailwind, no CSS modules
- Keep components focused; extract subcomponents only when reused
- Modal pattern: fixed overlay (rgba 0.7–0.78) + centered card, click-outside closes
- Form inputs: background COLORS.surface or COLORS.bg, border COLORS.border, borderRadius 8
