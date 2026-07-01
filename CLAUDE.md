# Vexr — Project Context

## What this is

A TrainingPeaks-style endurance training app for triathletes and endurance athletes.
Built as a solo project. Goal is to eventually monetise with free/pro/coach tiers.

## Tech Stack

- React + Vite + TypeScript
- Supabase (auth + database + realtime)
- Recharts (all charts)
- pdfjs-dist (PDF text extraction in Training Plans import)
- No Tailwind — all styles are inline using the COLORS object from `src/lib/colors.ts`
- Testing: Vitest + @testing-library/react, jsdom environment

## Supabase MCP

The project has a Supabase MCP server configured in `.mcp.json` (project ref: `fsskwaazmoidayqtsipy`). This gives Claude Code direct access to the live Supabase project without leaving the conversation.

**Available via MCP:**

- `execute_sql` — run any query (SELECT, INSERT, UPDATE, etc.)
- `apply_migration` — apply DDL changes (schema changes always go here, not `execute_sql`)
- `get_logs` — fetch logs from edge functions, auth, postgres, etc.
- `get_advisors` — security and performance recommendations
- `list_tables` — inspect schema
- `deploy_edge_function` — deploy edge functions directly

**Workflow rules:**

- DDL changes (CREATE TABLE, ALTER, CREATE POLICY, etc.) → always use `apply_migration` so changes are tracked in migration history
- Data operations (INSERT, UPDATE, SELECT) → use `execute_sql`
- All schema changes must also be reflected in `supabase-schema.sql` at the repo root
- The `.mcp.json` file is gitignored — do not commit it
- There is no separate dev/staging project — `apply_migration` and `execute_sql` act directly on the live project. Before running any migration that alters or drops existing columns/tables, or any `execute_sql` that updates/deletes existing rows, state what it will do and confirm before running it. Net-new additive changes (new table, new nullable column) don't need this — only changes that could affect existing data or break existing queries.

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
  contexts/      — ProfileContext, WorkoutsContext, StravaContext
  pages/         — Dashboard, Calendar, Analytics, AICoach, Plans, Library, Nutrition, Login, Signup, Onboarding, ResetPassword, Landing
  components/
    layout/      — Sidebar, TopBar
    ui/          — Button, Badge
    ai/          — RacePredictor
    dashboard/   — StatCard, WeeklyLoadChart, FitnessChart, UpcomingWorkouts
    calendar/    — CalendarGrid, CalendarDay, WeeklySummary
    analytics/   — AnalyticsPage
    plans/       — PlansPage, PlanCard, ImportModal, ImportReviewScreen
    library/     — LibraryPage
    LogWorkoutModal.tsx
    WorkoutDetailModal.tsx
    DayWorkoutsModal.tsx
    ProfileSettingsModal.tsx
  test/
    setup.ts                — global Vitest setup (jest-dom matchers, canvas mock)
    mocks/supabase.ts       — chainable Supabase query builder mock
    edge-helpers/           — unit tests for edge function shared logic (cors, aiBriefing, stravaSync)
supabase/functions/
  _shared/cors.ts           — shared CORS headers helper imported by all edge functions
  ai-briefing/              — weekly AI briefing + race predictor narrative (claude-sonnet-4-6)
  generate-plan/            — AI training plan generation from free-text prompt (claude-sonnet-4-6)
  parse-plan/               — PDF/HTML/text plan parsing for import pipeline (claude-sonnet-4-6)
  strava-auth/              — Strava OAuth token exchange
  strava-sync/              — import last 30 days of Strava activities
```

## Database (Supabase)

Tables (all with RLS enabled, users can only access their own rows):

| Table                    | Key columns                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`               | id (= auth user id), name, sport, ftp, run_pace, css, race_goal, race_date, max_hr, onboarding_completed                                                                                                                                                                                            |
| `workouts`               | user_id, title, type, date, duration_minutes, tss, zone, notes, planned, plan_id (FK→training_plans ON DELETE CASCADE), structure (jsonb), strava_activity_id, heart_rate_avg, heart_rate_max, distance_meters, calories, elevation_gain, avg_power, avg_pace                                       |
| `strava_connections`     | user_id, access_token, refresh_token, expires_at, athlete_id, athlete_name                                                                                                                                                                                                                          |
| `training_plans`         | user_id, name, sport, total_weeks, current_week, status, race_name, race_date, start_date, source ('manual'/'import'), raw_text                                                                                                                                                                     |
| `training_sessions`      | user_id, plan_id (FK→training_plans ON DELETE CASCADE), week_number, sport, title, scheduled_date, duration_min, target_metric, notes, status, has_conflict, created_at. sport check constraint: `('swim','bike','run','sc','brick','other')` — no 'rest'; normalise 'rest' → 'other' before insert |
| `workout_library`        | user_id, name, type, duration_minutes, tss, description                                                                                                                                                                                                                                             |
| `fitness_benchmarks`     | user_id, metric (ftp/pace/css), value (text), recorded_at                                                                                                                                                                                                                                           |
| `training_zones`         | user_id, sport (cycling/running/swimming), zone_number, zone_name, min_value, max_value, updated_at                                                                                                                                                                                                 |
| `ai_briefings`           | user_id, briefing (text), generated_at; max 9 per user, pruned on insert                                                                                                                                                                                                                            |
| `nutrition_logs`         | user_id, date, meal (breakfast/lunch/dinner/snacks), food_name, calories, protein, carbs, fat                                                                                                                                                                                                       |
| `nutrition_targets`      | user_id (PK), calorie_target, protein_target, carbs_target, fat_target                                                                                                                                                                                                                              |
| `hydration_logs`         | user_id + date (PK), liters                                                                                                                                                                                                                                                                         |
| `nutrition_custom_foods` | user_id, name, calories, protein, carbs, fat                                                                                                                                                                                                                                                        |
| `food_database`          | global shared table — name (unique), calories, protein, carbs, fat; read-only for all authenticated users                                                                                                                                                                                           |
| `goals`                  | id, user_id, text, completed, created_at; season goals CRUD on dashboard                                                                                                                                                                                                                            |
| `api_rate_limits`        | user_id, function_name, request_count, window_start; used by strava-auth (5/hr) and strava-sync (3/hr)                                                                                                                                                                                              |

Profile is auto-created on signup via `handle_new_user` trigger.

## Architecture

- `ProtectedLayout` in App.tsx handles auth guard, then mounts `ProfileProvider` → `WorkoutsProvider` → `StravaProvider` → `AppShell`
- `ProfileContext` (`src/contexts/ProfileContext.tsx`) — provides `profile` and `setProfile` to any component; fetches from `profiles` table on mount
- `WorkoutsContext` (`src/contexts/WorkoutsContext.tsx`) — provides workouts array + all derived metric helpers + `refetchWorkouts`
- `StravaContext` (`src/contexts/StravaContext.tsx`) — manages Strava OAuth connection, auto-sync once per session, toast notifications, `triggerSync` / `disconnect` / `refetchConnection`
- `AppShell` renders Sidebar + TopBar + Routes + modals; gets `profile`/`setProfile` from `useProfile()`, not props
- Real-time sync via Supabase channel on the workouts table
- Edge functions use raw `fetch` with explicit `Authorization: Bearer <jwt>` + `apikey` headers (not `supabase.functions.invoke`). All functions use `verify_jwt = false` in `config.toml` because Supabase's runtime verifier only supports HS256 and this project uses ES256 JWTs. Auth is enforced manually: each function checks for a `Bearer` token immediately (returns 401 if missing), then calls `supabase.auth.getUser()` to validate the token against Supabase's auth server (which does support ES256). This is the correct secure pattern for ES256 projects.

## CTL/ATL/TSB Calculation

Exponential weighted moving average (TrainingPeaks PMC model):

- CTL: 42-day time constant (1/42 decay)
- ATL: 7-day time constant (1/7 decay)
- TSB: CTL − ATL
- Canonical PMC engine: `src/lib/calculateMetrics.ts` — `calculatePMC`, `buildTssByDay`, `runPMC`
- `WorkoutsContext.tsx` calls the engine and exposes `calculateFitnessMetrics()` / `getFitnessHistory()` to consumers

## Features Shipped

- Auth: email/password, Supabase RLS
- Workout logging modal with all fields
- Calendar: month and week view toggle; month view shows all workouts in day cells; week view shows full-width 7-column layout with larger workout cards (title, duration, TSS, distance); WeeklySummary strip appears above calendar in both views — row 1: activity stats (workouts/duration/TSS/distance/elevation/calories + per-sport breakdowns), row 2: CTL/ATL/TSB displayed large with coloured top-border cards (cyan/orange/green-or-red)
- Workout detail: view, inline edit, delete
- Dashboard (daily driver): full-width greeting (time-based + week/race subtitle + high-fatigue badge if TSB < -20); 4 stat cards (CTL=purple, ATL=orange, TSB=always green, Race Goal=purple top borders + contextual sub-text); two-column layout — left 60%: fitness area chart (CTL/ATL/TSB, 8 weeks, recharts AreaChart with gradient fills) + weekly load (TSS progress bar + day dot row); right 40%: coming up (next 4 planned), AI coach teaser (briefing preview + link), season goals (CRUD backed by `goals` table). No TopBar on /dashboard — greeting section replaces it (hamburger injected inline on mobile via `vexr:openMenu` custom event)
- Analytics (deep dive): fitness/fatigue/form area chart, weekly TSS actual vs planned bar chart, training by sport breakdown, volume by sport stacked bar chart, zone distribution — all with 4W/8W/12W/6M range toggle. Plus three new sections: Power Curve (line chart, best avg power from rides ≥ each duration band — 5m/10m/20m/30m/60m — always non-increasing; purple; FTP reference line; requires avg_power on ride workouts), Pace Curve (bar chart, best pace per distance band — 5K/10K/15K/HM/Mar — faster=taller, calculated from distance+duration with 10 min/km walk filter; green; threshold pace reference line), Heart Rate Zones (donut + stacked bar + legend; zones Z1–Z5 from profile.max_hr; falls back to 220–35 estimate; shown Z5→Z1 top-to-bottom)
- Training Plans: full import pipeline — PDF/HTML/text upload, AI parsing via `parse-plan` edge function (claude-sonnet-4-6), conflict detection against existing workouts, 3-step modal (upload → animated parse → review screen with collapsible week rows + sport filter tabs). On confirm: writes to `training_plans`, `training_sessions`, and `workouts` (planned: true, plan_id set for cascade). Plan cards show status badge, race info in amber, cyan (accent) progress bar, three-dot menu (set active/complete/archive/delete), and a collapsible sessions list (sport filter tabs + week rows, same pattern as review screen, fetched on first expand from `training_sessions`). Delete shows confirmation dialog with session count; deletes matching planned workouts from calendar before removing plan. `workouts.plan_id` FK with ON DELETE CASCADE ensures calendar cleanup on future deletes. All Plans UI uses COLORS.accent (cyan) — no purple; `.purple-glow-btn` CSS class kept for compatibility but now renders cyan.
- Workout Library: save templates, filter, delete
- Real-time sync
- Profile Settings: edit name/sport/FTP/pace/CSS/race goal/max HR, benchmark history charts, training zones (cycling auto-calc from FTP; running auto-calc from threshold pace — Z1 ≥125%, Z2 110–125%, Z3 102–110%, Z4 97–102%, Z5 <97%; swimming auto-calc from CSS — Z1 ≥120%, Z2 105–120%, Z3 95–105%, Z4 <95%; heart rate auto-calc from max HR — Z1 <65%, Z2 65–75%, Z3 75–82%, Z4 82–89%, Z5 89–100%); all zones saved to `training_zones` table on save; max_hr saved to profiles table
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
- Bundle code splitting: all pages lazy-loaded with `React.lazy()` + `Suspense`; `vite.config.ts` `manualChunks` splits vendor-react / vendor-supabase / vendor-charts. Main bundle reduced from 962KB to 33KB. `pdfjs-dist` excluded from `optimizeDeps` (too large for Vite pre-bundler); worker loaded via `?url` import.
- Weekly summary strip (`src/components/calendar/WeeklySummary.tsx`): rendered above the week view calendar only (no `horizontal` prop — always the strip layout). Single dark panel (`COLORS.surface`) with label+value text pairs and 1px dividers. Left section: Workouts/Duration/TSS/Distance/Elevation/Calories + sport rows. Right section: `COLORS.card` panel with CTL/ATL/TSB at 24px. Each stat cell uses a fixed 3-row layout (label / value / subtitle with `minHeight: 1rem`) so all cells are the same height; dividers use `alignSelf: stretch` at the left-section level (not inside a padded wrapper) so they run full height.
- Nutrition page (`/nutrition`): date navigator; 4 stat cards (Calories/Protein/Carbohydrates/Fat vs per-user targets); SVG calorie ring (colour shifts accent→green→orange as you fill); macro progress bars + macro split segmented bar; meal log (Breakfast/Lunch/Dinner/Snacks) with collapsible sections, food item rows, remove button; Add Food modal with Browse/Create tabs — Browse searches merged `food_database` + `nutrition_custom_foods` with CUSTOM badge, Create saves to `nutrition_custom_foods`; Hydration card with 12-cup grid + ±250ml buttons; Workout Fuel Guide (Pre/During/Recovery phases); ⚙ Targets button opens `NutritionTargetsModal` to edit calorie/macro targets (upserted to `nutrition_targets`). Food database is DB-driven (no hardcoded list). All SQL in `supabase-schema.sql`.
- Typography: Inter (400–900) + DM Mono loaded via Google Fonts in `index.html`; `TopBar` title updated to `fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em'` — matches Nutrition page title style across all non-dashboard pages.
- Drag-and-drop calendar rescheduling: planned workouts are draggable in both month and week views (desktop only) via `@dnd-kit/core`. `DndContext` lives in `CalendarGrid`; `DraggableWeekCard` and `DraggableMonthItem` use `useDraggable` (disabled when `!workout.planned`); day cells/columns use `useDroppable`. Ghost `DragOverlay` follows cursor. Drop calls `updateWorkout(id, { date: newDate })`. 8px activation constraint preserves click behaviour. Mobile layout is unchanged.
- Production hardening: `src/components/ErrorBoundary.tsx` (class component) wraps the root render in `main.tsx` — catches unhandled render errors and shows a reload prompt instead of a blank screen. Password reset flow added to `Login.tsx` — "Forgot password?" toggles an inline form that calls `supabase.auth.resetPasswordForEmail` with `redirectTo: /reset-password`; `src/pages/ResetPassword.tsx` handles the reset link (validates session via `supabase.auth.getSession`, calls `supabase.auth.updateUser`). `Plans.tsx` and `Library.tsx` now have `loading` and `error` states. Edge functions: `strava-auth` and `strava-sync` have per-user rate limiting (5/hr and 3/hr) using the `api_rate_limits` table. All Anthropic API `fetch` calls have 30s `AbortController` timeouts. `generate-plan` max_tokens reduced from 16000 → 8000. `public/robots.txt` — landing page shipped at `/` (light-theme portfolio showcase, `src/pages/Landing.tsx`), so update robots.txt before public launch if SEO is desired.

## Testing

- Framework: Vitest + @testing-library/react, jsdom environment
- Commands: `npm test` (run once), `npm run test:watch` (watch mode), `npm run test -- --coverage` for coverage
- Setup: `src/test/setup.ts` — loads jest-dom matchers and mocks canvas
- Supabase mock: `src/test/mocks/supabase.ts` — `makeQueryBuilder()` returns a chainable Proxy (`.select().eq().order()` etc.) that resolves at `.single()` / `.maybeSingle()` or when awaited directly; `mockFrom` is the vi.fn() to configure per-test
- 27 test files, each co-located in `__tests__/` beside the file under test
- Edge function helpers tested in `src/test/edge-helpers/` (cors, aiBriefing, stravaSync)
- Do not mock the Supabase client at the module level across all tests — set up `mockFrom.mockReturnValue(chain)` per test for precise control

## Page roles (important — don't overlap these)

- **Dashboard** = daily driver. Today's workout, this week's load, near-term upcoming. No multi-week charts.
- **Analytics** = deep dive. All multi-week trend charts, fitness history, zone distribution, volume trends.
- **AI Coach** = personalised coaching. Weekly briefing from Claude, fitness metrics, training phase, briefing history.
- **Nutrition** = daily fuel tracking. Calories, macros, hydration, meal log, food database. No training load data here.
- **Training Plans** = import and manage structured training blocks. Sessions write to `training_sessions` (plan metadata) and `workouts` (planned: true, for calendar display).

## Code Quality Principles

Apply these continuously while writing or modifying code — not just when explicitly asked. They sit alongside the Rules below, which cover Vexr-specific conventions; these are the underlying engineering judgment that should guide how those rules get applied to new situations.

### DRY (Don't Repeat Yourself)

- Before adding new logic, check whether it already exists. `src/lib/calculateMetrics.ts` (`calculatePMC`, `buildTssByDay`, `runPMC`) is the **canonical** CTL/ATL/TSB engine — never reimplement fitness math elsewhere, even partially, even for a "quick" chart.
- Consume existing context (`ProfileContext`, `WorkoutsContext`, `StravaContext`) instead of querying Supabase directly from a new component — if a component needs profile, workout, or Strava data, it almost certainly already has access via context.
- If the same UI pattern shows up in two places (e.g. a stat cell, a sport filter tab row, a collapsible section), extract a shared component rather than copy-pasting and tweaking. The Plans review screen and Plans sessions list already share a pattern intentionally — follow that precedent rather than diverging.
- Don't duplicate zone/threshold math (FTP%, pace%, CSS%) — if it's not already in `lib/`, that's a sign it should be extracted there now rather than inlined a second time.
- Shared edge function logic goes in `supabase/functions/_shared/` (e.g. `cors.ts`) — check there before duplicating CORS headers, auth checks, or other cross-function logic in a new edge function.

### KISS (Keep It Simple)

- Match the existing pattern in the file/folder being edited (inline styles, existing modal structure, existing context shape) rather than introducing a new approach for the same kind of problem.
- Don't reach for a new dependency to solve something Recharts, the Supabase client, `@dnd-kit/core`, or existing `lib/` utilities already cover.
- Prefer a few extra lines of clear, linear code over a clever abstraction that saves lines but costs readability — especially in edge functions, where failures are harder to debug.

### YAGNI (You Aren't Gonna Need It)

- Don't add props, config flags, or abstraction layers for the future free/pro/coach tiers unless explicitly asked to build toward them now. Flag where a tier boundary _would_ naturally go if relevant, but don't pre-build the gating.
- Don't generalize a one-off component into a reusable system unless there's already a second real use case for it.

### Component & state design

- Keep components focused on one concern; extract subcomponents only when reused (already a stated Rule below — this is the reasoning behind it).
- Page-level data fetching belongs in context providers or the page component itself, not buried inside deeply nested children — this keeps the Dashboard/Analytics/AI Coach/Nutrition role separation (above) easy to maintain.
- Derived values (fitness metrics, zone calculations, TSS, power/pace curves) should be computed once in `lib/` or context, not recalculated slightly differently in multiple components — divergence here is how dashboard/analytics/calendar numbers quietly drift out of sync with each other.

### Edge functions

- One responsibility per function — don't fold unrelated behaviour into `ai-briefing`, `generate-plan`, `parse-plan`, `strava-auth`, or `strava-sync` instead of adding a focused new function.
- Validate the Bearer token and parse/validate input at the top of the handler before doing anything else, consistent with the existing auth pattern.
- Reuse `supabase/functions/_shared/cors.ts` rather than re-declaring CORS headers per function.
- Never log secrets, full JWTs, or the `ANTHROPIC_API_KEY` in anything that ends up in `get_logs` output.

### Tests

- New business logic — especially calculation/derived-metric logic in `lib/` and edge function shared helpers — should get a test, following the existing co-location pattern (`__tests__/` beside the file under test).
- Use the existing Supabase mock (`src/test/mocks/supabase.ts`); configure `mockFrom.mockReturnValue(chain)` per test rather than hand-rolling a new ad hoc mock.
- Don't write tests that just restate the implementation (asserting internal calls) — test behaviour and output.
- If a change touches `calculateMetrics.ts`, an edge function's shared logic, or a context's derived values, check whether existing tests in `__tests__/` need updating rather than leaving them passing on stale assumptions.

### Before finishing any change

- Run the tests touching the changed file (`npm test` or a targeted run) — especially for `lib/` calculation logic and edge function shared helpers.
- Review the diff for: duplicated logic, unused props/variables, hardcoded colors or values that should use `COLORS` or an existing constant, and any schema change not yet reflected in `supabase-schema.sql`.
- Confirm the change does only what was asked — no unrelated refactors bundled in silently.
- If a change touches RLS policies, auth logic, or the ES256/`verify_jwt` pattern, call out the security implication explicitly rather than assuming it's fine.

## Rules

- Always use the existing COLORS object — never hardcode colors
- Never use hardcoded mock data — all data comes from Supabase
- Inline styles only — no Tailwind, no CSS modules. Exception: `index.css` has `.no-spinner` (strip number input arrows), `.spinning` (keyframe spin animation), `.purple-glow-btn` (plans CTA with hover/active states), `.upload-tab` (plans import tab with `::after` underline), `.plans-field-input` (plans inputs with `:focus` state), and keyframes `fadeSlideUp` / `pulse-ring` / `msgAppear`
- Supabase edge functions: always deploy with `--no-verify-jwt` (required — Supabase runtime only supports HS256 but this project uses ES256); always call via raw `fetch` with explicit `Authorization` + `apikey` headers (not `supabase.functions.invoke`); auth is enforced inside each handler via Bearer token check + `supabase.auth.getUser()`
- Keep components focused; extract subcomponents only when reused
- Mobile responsiveness: use `useIsMobile` hook from `src/hooks/useIsMobile.ts` (`useState(() => window.innerWidth < 768)` + resize listener). All responsive logic is JS-driven inline styles — no media queries, no Tailwind.
- Mobile modal pattern: `position: fixed, inset: 0, height: 100dvh, borderRadius: 0` — full screen, no overlay, no click-outside close
- React border warning: never mix `border` shorthand with `borderLeft`/`borderRight`/etc. in the same style object — always expand to all four sides (`borderTop`, `borderRight`, `borderBottom`, `borderLeft`)
- Modal pattern: fixed overlay (rgba 0.7–0.78) + centered card, click-outside closes (desktop only)
- Form inputs: background COLORS.surface or COLORS.bg, border COLORS.border, borderRadius 8
- All SQL (table definitions, RLS policies, seed data, migrations) goes in `supabase-schema.sql` at the repo root — never in component files or inline comments
- Dropdown menus that escape `overflow: hidden` containers must use `position: fixed` positioned via `getBoundingClientRect()`. Outside-click handlers must exclude both the trigger element AND the dropdown div (use two refs) to avoid race conditions between `mousedown` and `click`.
