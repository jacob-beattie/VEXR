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
  lib/           — supabase client, color constants, calculateMetrics (PMC engine)
  types/         — all TypeScript interfaces (index.ts)
  hooks/         — useAuth, useIsMobile
  contexts/      — WorkoutsContext (workouts + derived fitness metrics)
  pages/         — Dashboard, Calendar, Analytics, AICoach, Plans, Library, Login, Signup
  components/
    layout/      — Sidebar, TopBar
    ui/          — Button, Badge
    dashboard/   — StatCard, WeeklyLoadChart, FitnessChart, UpcomingWorkouts
    calendar/    — CalendarGrid, CalendarDay, WeeklySummary
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
| `ai_briefings` | user_id, briefing (text), generated_at; max 9 per user, pruned on insert |

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
- Calendar: month and week view toggle; month view shows all workouts in day cells; week view shows full-width 7-column layout with larger workout cards (title, duration, TSS, distance); WeeklySummary strip appears above calendar in both views — row 1: activity stats (workouts/duration/TSS/distance/elevation/calories + per-sport breakdowns), row 2: CTL/ATL/TSB displayed large with coloured top-border cards (cyan/orange/green-or-red)
- Workout detail: view, inline edit, delete
- Dashboard (daily driver): full-width greeting (time-based + week/race subtitle + high-fatigue badge if TSB < -20); 4 stat cards (CTL/ATL/TSB/Race Goal with coloured top borders + contextual sub-text); two-column layout — left 60%: fitness area chart (CTL/ATL/TSB, 8 weeks, recharts AreaChart with gradient fills) + weekly load (TSS progress bar + day dot row); right 40%: coming up (next 4 planned), AI coach teaser (briefing preview + link), season goals (CRUD backed by `goals` table). No TopBar on /dashboard — greeting section replaces it (hamburger injected inline on mobile via `vexr:openMenu` custom event)
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
- CTL/ATL/TSB calculation: canonical PMC engine in `src/lib/calculateMetrics.ts` (`calculatePMC`); used by dashboard, analytics, and calendar WeeklySummary — all three always in sync. Excludes planned workouts from TSS. Warms up from earliest actual workout. Uses ms-based day iteration (no setDate bugs). `buildTssByDay` + `runPMC` are exported for reuse.
- Full mobile responsiveness (390px / iPhone 15): sidebar hamburger + slide-in overlay, bottom nav bar (5 tabs, z-index 100), stat cards 2×2 grid, scrollable WeeklySummary strip, calendar month view with dot layout + DayBottomSheet, calendar week view vertical stacking with horizontal workout cards, full-screen modals (LogWorkout/WorkoutDetail/ProfileSettings), analytics 2-col grids + mobile X-axis tick density, Library FAB + scrollable filter strip — all via `useIsMobile` hook (`src/hooks/useIsMobile.ts`)
- AI Coach page (`/ai-coach`): metrics row (CTL/ATL/TSB/race countdown), weekly briefing card (cyan left border + gradient top glow), race predictor section, quick stats row (training phase/weekly compliance/TSS comparison/CTL trend), briefing history accordion (last 8). Edge function `supabase/functions/ai-briefing` calls Claude API (claude-sonnet-4-6), 24h cache with `force` override, accumulates history up to 9 entries. Requires `ANTHROPIC_API_KEY` Supabase secret and `ai_briefings` table. Dashboard has subtle ✦ banner linking to /ai-coach.
- Race Predictor (`src/components/ai/RacePredictor.tsx`): rendered inside AI Coach between weekly briefing and quick stats. Sport tabs (running/cycling/swimming/triathlon) default to user's primary sport. Running: Riegel formula (T2 = T1 × (D2/D1)^1.06) anchored at HM (threshold pace × 21.1km = T1); distances 5K/10K/HM/Marathon. Cycling: adjFTP × IF → power → speed via cube-root model → time; distances 40K/100K/160K. Swimming: CSS / IF per distance; distances 400m/1500m/1900m/3800m. Triathlon: all three sports with triathlon-specific IFs + transition times + brick run factor; Sprint/Olympic/70.3/Ironman. CTL adjustment capped at ±5% in all sports. AI narrative calls edge function with `mode: 'race_predictor'`, cached in localStorage under `vexr_race_predictor_<userId>`, regenerates when any metric drifts >5% or cache is >7 days old. Edge function `race_predictor` mode returns `{ narrative }` directly without saving to `ai_briefings`.
- Log Workout button moved from TopBar to Sidebar (desktop) and a mobile FAB (bottom: 80px, right: 16px, hidden on /library). TopBar now accepts optional `titleIcon`/`titleIconColor` props for per-page icon decoration.
- First-time user onboarding flow (`/onboarding`): 3-step full-screen flow shown to new users after signup. Step 1: name + sport pill selector. Step 2: FTP/run pace/CSS (conditional on sport)/race goal/race date with `?` tooltips. Step 3: Strava connect (orange) or skip. Progress bar + step dots at top, fade transitions between steps, back/skip on steps 2+3. Signup redirects to /onboarding; AppShell redirects to /onboarding if `profile.onboarding_completed === false`; completing or skipping step 3 sets `onboarding_completed = true` in profiles. Skipping Strava shows a welcome banner on Dashboard via `sessionStorage.onboardingWelcome`. Connecting Strava sets flag then redirects through existing OAuth flow. Requires `onboarding_completed boolean default false` column on `profiles` table — run `ALTER TABLE profiles ADD COLUMN onboarding_completed boolean default false;` then manually set `true` for any existing users.
- Calendar improvements: clicking any empty day (month or week view) opens Log Workout modal with date pre-filled; empty cells show a `+` that brightens on hover. Planned workouts render with dashed border + 0.75 opacity + PLANNED badge; completed workouts keep solid sport-colour left border at full opacity. Month view mobile dots: hollow ring = planned, solid = completed. Weekly summary strip totals count completed only; planned count shown as `+N planned` sub-label on Workouts and TSS.
- Season Goals: `goals` table (id, user_id, text, completed, created_at) with RLS. CRUD panel on dashboard right column — add via text input + Enter/+, toggle complete with checkbox, delete with ×, incomplete first then completed greyed/strikethrough, completion ratio shown in header.
- Month/Week toggle buttons: no wrapper border — each button has its own `borderRadius: 6` and full border (`COLORS.border` inactive, `COLORS.accent` active), separated by 4px gap. No double-border or overflow clipping.
- Bundle code splitting: all pages lazy-loaded with `React.lazy()` + `Suspense`; `vite.config.ts` `manualChunks` splits vendor-react / vendor-supabase / vendor-charts. Main bundle reduced from 962KB to 33KB.
- Weekly summary strip redesigned: single dark panel (`COLORS.surface` background) with label+value text pairs and 1px dividers between stats (no individual card boxes). Left section: Workouts/Duration/TSS/Distance/Elevation/Calories + sport rows (emoji + coloured duration + muted distance). Right section: `COLORS.card` panel with CTL/ATL/TSB at 24px bold coloured values. Scrolls horizontally on mobile.

## Page roles (important — don't overlap these)

- **Dashboard** = daily driver. Today's workout, this week's load, near-term upcoming. No multi-week charts.
- **Analytics** = deep dive. All multi-week trend charts, fitness history, zone distribution, volume trends.
- **AI Coach** = personalised coaching. Weekly briefing from Claude, fitness metrics, training phase, briefing history.

## Rules

- Always use the existing COLORS object — never hardcode colors
- Never use hardcoded mock data — all data comes from Supabase
- Inline styles only — no Tailwind, no CSS modules. Exception: `index.css` has `.no-spinner` (strip number input arrows) and `.spinning` (keyframe spin animation) utility classes
- Supabase edge functions: always deploy with `--no-verify-jwt` flag; always call via raw `fetch` with explicit `Authorization` + `apikey` headers (not `supabase.functions.invoke`)
- Keep components focused; extract subcomponents only when reused
- Mobile responsiveness: use `useIsMobile` hook from `src/hooks/useIsMobile.ts` (`useState(() => window.innerWidth < 768)` + resize listener). All responsive logic is JS-driven inline styles — no media queries, no Tailwind.
- Mobile modal pattern: `position: fixed, inset: 0, height: 100dvh, borderRadius: 0` — full screen, no overlay, no click-outside close
- React border warning: never mix `border` shorthand with `borderLeft`/`borderRight`/etc. in the same style object — always expand to all four sides (`borderTop`, `borderRight`, `borderBottom`, `borderLeft`)
- Modal pattern: fixed overlay (rgba 0.7–0.78) + centered card, click-outside closes (desktop only)
- Form inputs: background COLORS.surface or COLORS.bg, border COLORS.border, borderRadius 8
