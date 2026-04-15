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
| `workouts` | user_id, title, type, date, duration_minutes, tss, zone, notes, planned, structure (jsonb), strava_activity_id, heart_rate_avg, heart_rate_max, distance_meters, calories, elevation_gain, avg_power, avg_pace |
| `strava_connections` | user_id, access_token, refresh_token, expires_at, athlete_id, athlete_name |
| `training_plans` | user_id, name, sport, total_weeks, current_week, status |
| `workout_library` | user_id, name, type, duration_minutes, tss, description |
| `fitness_benchmarks` | user_id, metric (ftp/pace/css), value (text), recorded_at |
| `training_zones` | user_id, sport (cycling/running/swimming), zone_number, zone_name, min_value, max_value, updated_at |

Profile is auto-created on signup via `handle_new_user` trigger.

## Architecture

- `ProtectedLayout` in App.tsx handles auth guard, then mounts `ProfileProvider` → `WorkoutsProvider` → `StravaProvider` → `AppShell`
- `ProfileContext` (`src/contexts/ProfileContext.tsx`) — provides `profile` and `setProfile` to any component; fetches from `profiles` table on mount
- `WorkoutsContext` (`src/contexts/WorkoutsContext.tsx`) — provides workouts array + all derived metric helpers + `refetchWorkouts`
- `StravaContext` (`src/contexts/StravaContext.tsx`) — manages Strava OAuth connection, auto-sync once per session, toast notifications, `triggerSync` / `disconnect` / `refetchConnection`
- `AppShell` renders Sidebar + TopBar + Routes + modals; gets `profile`/`setProfile` from `useProfile()`, not props
- Real-time sync via Supabase channel on the workouts table
- Edge functions use raw `fetch` with explicit `Authorization: Bearer <jwt>` + `apikey` headers (Supabase project uses ES256 JWTs which the infrastructure JWT verifier doesn't support — all functions deployed with `--no-verify-jwt`)

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
- Dashboard (daily driver): today's planned workout + mark complete button, CTL/ATL/TSB stat cards, race countdown, weekly load progress bar with day breakdown, upcoming 4 days
- Analytics (deep dive): fitness/fatigue/form area chart, weekly TSS actual vs planned bar chart, training by sport breakdown, volume by sport stacked bar chart, zone distribution — all with 4W/8W/12W/6M range toggle
- Training Plans: create, start, complete, delete
- Workout Library: save templates, filter, delete
- Real-time sync
- Profile Settings: edit name/sport/FTP/pace/CSS/race goal, benchmark history charts, training zones (cycling auto-calc, running/swimming manual)
- Log Workout modal: auto-calculates TSS from type-specific inputs (run=avg pace vs threshold, ride=avg power vs FTP, swim=distance vs CSS, strength/rest=RPE); TSS field is read-only with Edit/Auto override; Session Focus pill selector (Recovery/Endurance/Tempo/Threshold/Intervals/Race/Long) replaces free-text zone field
- Structured workout builder: Simple/Structured toggle on run/ride/swim; drag-to-reorder blocks (Warmup/Interval/Rest/Cooldown) with duration, reps, intensity, optional per-block notes; intensity is % FTP for ride (watts hint), pace min/km for run (% of threshold hint), % CSS for swim (pace/100m hint); TSS and duration auto-calculated from all blocks; saved as JSONB in `workouts.structure`; WorkoutDetailModal shows full block breakdown
- Strava OAuth integration: connect/disconnect in Profile Settings, auto-sync once per session, manual "Sync Now" button, toast notifications; edge functions `strava-auth` (token exchange) and `strava-sync` (import last 30 days); imports title, type, date, duration, TSS, HR, distance, elevation, power, pace, calories; deduplicates by strava_activity_id
- Workout detail modal: rich stat grid (only shows cards with data), Session Focus badge, structured block breakdown, notes, "View on Strava" link for imported activities
- Analytics page: YTD summary stats row (workouts/hours/distance/TSS), Training Monotony score card (avg TSS ÷ stddev, colour-coded), Best Performances section (longest run/ride, highest TSS, best TSS week, YTD sport counts), zone empty state with "Open Profile Settings" button
- CTL/ATL fix: decay constants now use correct exponential formula (1 - e^(-1/42) and 1 - e^(-1/7)); warmup now starts from earliest workout in DB rather than fixed 90-day window — fixes underestimated CTL causing overly negative TSB

## Page roles (important — don't overlap these)

- **Dashboard** = daily driver. Today's workout, this week's load, near-term upcoming. No multi-week charts.
- **Analytics** = deep dive. All multi-week trend charts, fitness history, zone distribution, volume trends.

## Rules

- Always use the existing COLORS object — never hardcode colors
- Never use hardcoded mock data — all data comes from Supabase
- Inline styles only — no Tailwind, no CSS modules. Exception: `index.css` has `.no-spinner` (strip number input arrows) and `.spinning` (keyframe spin animation) utility classes
- Supabase edge functions: always deploy with `--no-verify-jwt` flag; always call via raw `fetch` with explicit `Authorization` + `apikey` headers (not `supabase.functions.invoke`)
- Keep components focused; extract subcomponents only when reused
- Modal pattern: fixed overlay (rgba 0.7–0.78) + centered card, click-outside closes
- Form inputs: background COLORS.surface or COLORS.bg, border COLORS.border, borderRadius 8
