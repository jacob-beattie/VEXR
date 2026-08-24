# Vexr — Project Context

## What this is

A TrainingPeaks-style endurance training app for triathletes and endurance athletes.
Built as a solo project. Goal is to eventually monetise with free/pro/coach tiers.

## Tech Stack

- React + Vite + TypeScript
- Supabase (auth + database + realtime)
- Recharts (all charts)
- pdfjs-dist (PDF text extraction in Training Plans import)
- No Tailwind — all styles are inline using the COLORS object from `src/lib/colors.ts`. (`tailwindcss`/`@tailwindcss/vite` are present in `package.json`/`vite.config.ts` from the initial project scaffold but unused — no `@import "tailwindcss"` in any CSS file and no Tailwind utility classes anywhere in `src/`. Don't add Tailwind classes; if cleaning up, these are safe to remove.)
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
- There is no separate dev/staging project — `apply_migration` and `execute_sql` act directly on the live project. Before running any migration that alters or drops existing columns/tables, or any `execute_sql` that updates/deletes existing rows, state what it will do and confirm before running it. Net-new additive changes (new table, new nullable column) don't need this — only changes that could affect existing data or break existing queries. For local dev/exploratory queries, prefer the local Supabase stack (`supabase start`, `.env.local`) over the live project — see `docs/ENVIRONMENT.md`.
- Any migration that `alter`s or `drop`s an existing column/table must include the reverse `alter` as a SQL comment at the top of the migration (there's no down-migration tooling — see `docs/ROLLBACK.md`). Purely additive migrations (new table, new nullable column) don't need this.

## Design System — "Splits"

Vexr's design language ("Splits") is instrument-panel precision — GPS watch/results-sheet clarity, not a borrowed SaaS or wellness skin. It replaced an earlier blue-accent system in the `feature/design-overhaul` branch; every categorical/ordinal chart color in it was run through colorblind-safety validation (OKLab ΔE under simulated protanopia/deuteranopia, plus a normal-vision separation floor) rather than picked by eye — see the dataviz skill if extending the palette further.

- Light theme only, no dark mode (has been since the initial commit — `COLORS.bg`/`surface`/`card`/`text` are all light values; no theme-switching logic exists anywhere in the app)
- Colors: `src/lib/colors.ts` — always import COLORS from here, never hardcode hex values. Canvas (`COLORS.bg`) is a cool near-white (`#f5f7f8`), not pure white or cream; cards (`COLORS.surface`/`card`) are pure white (`#ffffff`) sitting one step brighter than the canvas; text (`COLORS.text`) is cool near-black (`#14171a`), not warm charcoal
- **One reserved interactive accent** — signal green (`COLORS.accent`, `#0c8a3f`) — used only for links, focus rings, and active/selected nav states. Never a primary button fill (those are onyx-adjacent `COLORS.text`-on-white or the `Button` component's own styling), never reused for chart/data color. Page-title icons, decorative badges, and "make this card pop" treatments do **not** get the accent — if nothing there is actually clickable/selected, it's not accent-colored
- **Color must represent something.** A colored top-border, rail, or tint is only valid when it encodes real data (a sport, a zone, a status, a metric) — never used purely to visually differentiate one card from its neighbors. This was the specific bug that had to be caught and fixed repeatedly during the redesign: components reaching for `COLORS.green`/`orange`/`purple` decoratively, which drifted those keys away from their actual sport/PMC meaning
- Chart/semantic color sources — always import these rather than re-deriving: `PMC_COLORS` (CTL/ATL/TSB triad), `SPORT_COLORS` (per-sport identity, also used for zone-adjacent contexts), `HR_ZONE_RAMP` (ordinal Z1→Z5 light-to-dark ramp — zone order is meaningful, so this is one hue, not five arbitrary colors), `MACRO_COLORS` (protein/carbs/fat), `BLOCK_COLORS` (structured-workout warmup/interval/rest/cooldown). `COLORS.danger` is for real errors/destructive actions; `COLORS.conflictAmber` is for warnings/attention-needed states that aren't errors — these are deliberately distinct from any categorical/sport hue so a status color never impersonates a series
- Fonts: Inter for body/UI (upright, bold for headings — no serif anywhere), DM Mono promoted to the **hero face for every number** on a page (stats, splits, TSS, prices) — not just tucked into an isolated stat-card detail
- Shape tokens: `src/lib/designTokens.ts` — `RADIUS` (`card`/`input`/`button` all 8px, `chip` 6px, `avatar` `50%`) and `SHADOW` (`modal`/`dropdown` only — floating overlays that genuinely sit above dimmed content). Buttons are rounded rectangles, never pills
- **No shadows on in-flow content.** Cards, list rows, and hover states get definition from hairline `COLORS.border` and border-color darkening on hover — not `boxShadow`. The only legitimate shadow uses are real floating overlays (modals, dropdowns, a drag-ghost card, a popover) via the `SHADOW` tokens above
- **No decorative gradients.** A gradient background/border is not part of this system — flat fills only
- **Prefer one dividered panel over a grid of independently-bordered cards** for a row of related stats (e.g. CTL/ATL/TSB/Race, YTD summary numbers) — a single bordered container with internal `borderRight`/`borderTop` dividers between cells, not N separate white boxes each with their own border+radius. This is the single most common tell of a templated/generic layout; watch for it when adding new stat rows
- All layout is inline styles — no Tailwind classes, no CSS modules

## File Structure

```
src/
  lib/           — supabase client (fail-loud startup env var check), sentry.ts (optional frontend error tracking, no-op unless VITE_SENTRY_DSN is set), color constants, calculateMetrics (PMC engine), workoutSelectors.ts (pure reporting/analytics selectors — calculateFitnessMetrics/getDailyWeekLoad/getWeeklyLoadHistory/getFitnessHistory — extracted from WorkoutsContext so they're unit-testable without mounting the provider; context still owns memoization and calls these), dateUtils.ts (canonical `getWeekStart`/`getWeekEnd` Monday-week-boundary helpers, used by WorkoutsContext/Calendar/AnalyticsPage/WeeklyLoadCard), tss.ts (TSS/pace math), zones.ts (HR zone boundary math)
  types/         — all TypeScript interfaces (index.ts); database.types.ts (generated Supabase types, regenerate via mcp__supabase__generate_typescript_types)
  hooks/         — useAuth, useIsMobile, useAICoachData (AI Coach fetch/derived-metric logic), useGoals (Season Goals CRUD)
  contexts/      — ProfileContext, WorkoutsContext, StravaContext
  pages/         — Dashboard, Calendar, Analytics, AICoach, Plans, Library, Nutrition, Login, Signup, Onboarding, ResetPassword, Landing
  components/
    layout/      — Sidebar, TopBar
    ui/          — Button, Badge
    ai/          — RacePredictor, racePredictorMath.ts (pure prediction formulas, split out so exporting them doesn't trip react-refresh/only-export-components and so they're directly testable)
    dashboard/   — FitnessAreaChart, WeeklyLoadCard, ComingUpCard, AICoachTeaser, NutritionSummaryCard, SeasonGoalsPanel, StatCard, utils.ts (canonical `localDateKey`/`formatDuration` plus dashboard-specific date/format helpers — imported by any component needing these, not reimplemented)
    calendar/    — CalendarGrid, CalendarDay, WeeklySummary
    analytics/   — AnalyticsPage
    plans/       — PlansPage, PlanCard, ImportModal, GeneratePlanModal, ImportReviewScreen, SessionsList.tsx (sport-tab-row + collapsible week-list UI shared by ImportReviewScreen and PlanCard's session view, parameterized by `variant: 'review' | 'compact'`), shared.ts (`toSessionSport`/`formatDisplayDate`/`EdgeSession`/`mapEdgeSessions` shared by ImportModal and GeneratePlanModal; `SPORT_LABELS`/`SPORT_TABS` shared by SessionsList and PlanCard)
    library/     — LibraryPage
    LogWorkoutModal.tsx
    WorkoutDetailModal.tsx
    DayWorkoutsModal.tsx
    ProfileSettingsModal.tsx
  test/
    setup.ts                — global Vitest setup (jest-dom matchers, canvas mock)
    mocks/supabase.ts       — canonical chainable Supabase mock: in-memory table-backed query builder that actually applies `.eq`/`.match`/`.in`/etc. filters and enforces RLS (rows scoped to whatever `setMockCurrentUser()` id is set, regardless of the app's own filter — mirrors real Postgres RLS); `seedMockTable`/`getMockTable` seed and inspect table state, `resetMockSupabase` clears it. Used by all three context tests — always prefer this over a hand-rolled ad hoc mock.
    edge-helpers/           — unit tests for edge function shared logic: cors, aiBriefing (imports `_shared/calculatePMC` directly; only briefing-pruning math is still duplicated, since that isn't extracted), stravaSync (duplicated pure-math, Deno-global workaround), planScheduling, parsePlanValidation, generatePlanValidation, stravaAuth (these import the real `_shared` module directly, no duplication)
supabase/functions/
  _shared/cors.ts                    — shared CORS headers helper imported by all edge functions
  _shared/rateLimit.ts               — `checkRateLimit`/`releaseRateLimit`, shared by every edge function that rate-limits (ai-briefing, race-predictor, generate-plan, parse-plan, strava-auth, strava-sync)
  _shared/anthropic.ts               — `callClaude(prompt, maxTokens, context)`, the shared Anthropic `fetch` call (API key read, 30s timeout, headers, error handling) used by every function that talks to Claude (ai-briefing, race-predictor, generate-plan, parse-plan)
  _shared/calculatePMC.ts            — Deno-side copy of `src/lib/calculateMetrics.ts`'s pure PMC engine (`calculatePMC`/`buildTssByDay`), used by ai-briefing. Kept in sync by hand, same convention as `database.types.ts` below — not a live cross-repo import, since `deploy_edge_function` bundles each function from an explicit file list with no repo filesystem access.
  _shared/validatePlan.ts            — runtime shape validation for Claude's plan JSON (used by parse-plan and generate-plan)
  _shared/validation.ts              — tiny shared `isRecord`/`ValidationResult<T>` building blocks for the two request validators below
  _shared/planScheduling.ts          — Deno-global-free date/scheduling math shared by parse-plan and generate-plan: `resolveDate`, `resolveSessionDates`, `flagConflicts` (conflict detection), `computeTotalWeeks`, `computePlanPhases` (base/build/taper week split). Imported directly by Vitest tests, not duplicated.
  _shared/parsePlanValidation.ts     — parse-plan's request body validation (`validateParsePlanRequest`), extracted so it's testable
  _shared/generatePlanValidation.ts  — generate-plan's request body validation (`validateGeneratePlanRequest`), extracted so it's testable
  _shared/stravaAuth.ts              — strava-auth's `extractAuthCode`/`buildAthleteName` helpers, extracted so they're testable
  _shared/errorTracking.ts           — `captureError(err, context)`, optional Sentry reporting (Deno SDK via esm.sh), no-op unless the SENTRY_DSN secret is set; called from every function's catch block right after its existing console.error(...)
  _shared/database.types.ts          — copy of src/types/database.types.ts for Deno imports; keep both in sync when regenerating
  ai-briefing/              — weekly AI briefing (claude-sonnet-4-6)
  race-predictor/           — race predictor narrative (claude-sonnet-4-6); split out of ai-briefing to keep one responsibility per function — see "Architecture" below
  generate-plan/            — AI training plan generation from free-text prompt (claude-sonnet-4-6)
  parse-plan/               — PDF/HTML/text plan parsing for import pipeline (claude-sonnet-4-6)
  strava-auth/              — Strava OAuth token exchange
  strava-sync/              — import last 30 days of Strava activities
supabase/
  config.toml    — local Supabase stack config (`supabase start`); all 6 functions mirror their deployed `--no-verify-jwt` setting
  migrations/    — LOCAL STACK ONLY; not how the live project's schema is managed (that's still apply_migration + supabase-schema.sql). 20240101000000_initial_schema.sql is a hand-kept copy of /supabase-schema.sql — see the comment at the top of that file for the sync convention.
  seed.sql       — optional local-only seed data beyond what the initial_schema migration already inserts (food_database)
  functions/.env.example — template for local edge function secrets (ANTHROPIC_API_KEY, STRAVA_CLIENT_ID/SECRET), safe to commit (copy to supabase/functions/.env — NOT supabase/.env, which the CLI does not read)
  functions/.env — gitignored; the Supabase CLI auto-loads this specific path for the local edge-runtime container (`supabase start`/`supabase functions serve`) — without it, edge functions that require a secret return 500 locally. A container must be fully removed and recreated (not just restarted) to pick up a change here — `supabase stop` then `supabase start`, or `npm run dev:down && npm run dev:up`.
docs/
  ENVIRONMENT.md — every env var (Vercel frontend + Supabase edge secrets) in one place, with required/optional status
  ROLLBACK.md    — rollback/recovery plan for Vercel deploys, Supabase schema migrations, and destructive execute_sql
  review/        — the repo audit this and other hardening passes work through (docs/review/*.md)
.github/workflows/ci.yml — lint + typecheck + full test suite on every push/PR to main
.env.example   — frontend env var template, safe to commit (copy to .env.local)
design_handoff_health/, design_handoff_nutrition/, design_handoff_plans/, design_handoff_social/ — standalone static HTML/README design mockup pairs, not imported by the build or wired into the app in any way. `design_handoff_social/` (a "Social" feature) has no corresponding page/route in `src/` — either an unbuilt feature or a stale handoff kept for reference.
scripts/dev-up.sh, dev-down.sh — macOS-only convenience scripts (npm run dev:up / dev:down) that start/stop Docker Desktop + the local Supabase stack + the Vite dev server together. `dev-up.sh`'s Docker-readiness wait is bounded (~2 min, 5s per attempt via a background+kill pattern, since a single `docker info` call can itself hang indefinitely if Docker Desktop's backend VM is stuck rather than just slow to start) — it exits with an actionable message instead of hanging forever if Docker doesn't come up in time. `dev-down.sh`'s Docker quit is verified the same way (bounded `pgrep` wait, ~20s, escalating to `pkill -9 -f "Docker.app/Contents"` if the polite quit is ignored — confirmed in practice that it reliably is on at least one dev machine) rather than declaring "Done" the instant `osascript -e 'quit app "Docker"'` is fired. Its Vite-server kill also uses `lsof -ti tcp:5173 -sTCP:LISTEN` (not bare `-i:5173`, which matches any socket touching the port — a browser tab's client connection showed up alongside the real server in practice) and an unquoted `kill $VITE_PID` (quoting it would pass multiple PIDs as one invalid multi-line argument, which `kill` silently rejects). `dev-up.sh`'s `supabase start` also self-heals once on failure (`supabase stop` then retry) — a container left over from an interrupted previous stop can otherwise leave the CLI reporting "already running" for a container that's actually exited.
```

## Database (Supabase)

Tables (all with RLS enabled, users can only access their own rows):

| Table                    | Key columns                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`               | id (= auth user id), name, sport, ftp, run_pace, css, race_goal, race_date, max_hr, onboarding_completed, avatar_url                                                                                                                                                                                |
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
| `api_rate_limits`        | id, user_id, function_name, called_at; used by strava-auth (5/hr), strava-sync (3/hr), ai-briefing (5/hr), ai-briefing-predictor (10/hr), generate-plan (5/hr), parse-plan (5/hr). RLS enabled with **no policies** (deny-all for anon/authenticated) — a user must not be able to read/insert/delete rows that exist to constrain them. Every edge function's `checkRateLimit()` uses a dedicated service-role client scoped to only this table, called only after the caller's JWT is verified, so `user_id` always comes from the token, never the client |

Profile is auto-created on signup via `handle_new_user` trigger.

## Architecture

- `ProtectedLayout` in App.tsx handles auth guard, then mounts `ProfileProvider` → `WorkoutsProvider` → `StravaProvider` → `AppShell`
- `ProfileContext` (`src/contexts/ProfileContext.tsx`) — provides `profile`, `loading`, `error`, `setProfile`, `refetchProfile`; fetches from `profiles` table on mount, guards against out-of-order responses via a request-id ref
- `WorkoutsContext` (`src/contexts/WorkoutsContext.tsx`) — provides workouts array, `loading`, `error`, all derived metric helpers, and `refetchWorkouts`; reporting/analytics selectors (`calculateFitnessMetrics`, `getFitnessHistory`, `getWeeklyLoadHistory`, `getDailyWeekLoad`) delegate to pure functions in `src/lib/workoutSelectors.ts`, memoized in a ref-based cache keyed on `workouts` identity + today's date so repeated calls across renders skip recomputing `calculatePMC`; calendar-oriented selectors (`getWorkoutsForMonth`/`getWorkoutsForWeek`/`getTodaysWorkouts`/`getUpcomingWorkouts`) stay in the context itself since they're simple array filters, not reporting math. `fetchWorkouts` guards against out-of-order responses via a request-id ref. By default only fetches a trailing ~24-month window (`HISTORY_WINDOW_DAYS = 730`) rather than the user's entire history; `hasFullHistory`/`historyWindowStart`/`requestFullHistory()` upgrade the session to an unbounded fetch once — `Calendar.tsx` triggers it when the visible month/week is before the window, `Analytics.tsx` when the "All" range is selected
- `StravaContext` (`src/contexts/StravaContext.tsx`) — manages Strava OAuth connection, auto-sync once per session, toast notifications, `triggerSync` / `disconnect` / `refetchConnection`
- `AppShell` renders Sidebar + TopBar + Routes + modals; gets `profile`/`setProfile` from `useProfile()`, not props
- Real-time sync via Supabase channel on the workouts table
- Edge functions use raw `fetch` with explicit `Authorization: Bearer <jwt>` + `apikey` headers (not `supabase.functions.invoke`). All functions use `verify_jwt = false` in `config.toml` because Supabase's runtime verifier only supports HS256 and this project uses ES256 JWTs. Auth is enforced manually: each function checks for a `Bearer` token immediately (returns 401 if missing), then calls `supabase.auth.getUser()` to validate the token against Supabase's auth server (which does support ES256). This is the correct secure pattern for ES256 projects.
- `src/lib/supabase.ts` and every edge function's `createClient` call are typed with `createClient<Database>(...)` using the generated `database.types.ts`, so `.from()` queries are checked against the real schema. Hand-written app types (`Profile`, `Workout`, etc. in `src/types/index.ts`) narrow nullable/string DB columns into non-null values and literal unions — each fetch site converts the raw generated row into the app type via a small `mapXRow()` function (e.g. `mapWorkoutRow` in `WorkoutsContext.tsx`) rather than casting with `as`. Regenerate `database.types.ts` after schema changes via `mcp__supabase__generate_typescript_types` and copy it to `supabase/functions/_shared/database.types.ts`.

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
- Calendar: month and week view toggle; month view shows all workouts in day cells; week view shows full-width 7-column layout with larger workout cards (title, duration, TSS, distance); WeeklySummary strip appears above calendar in both views — row 1: activity stats (workouts/duration/TSS/distance/elevation/calories + per-sport breakdowns), row 2: CTL/ATL/TSB displayed large with coloured top-border cards (`PMC_COLORS` blue/amber, green-or-red for TSB)
- Workout detail: view, inline edit, delete
- Dashboard (daily driver): full-width greeting (time-based + week/race subtitle + high-fatigue badge if TSB < -20); 4 stat cards (CTL/ATL use `PMC_COLORS`, TSB=always green, Race Goal=neutral `COLORS.text` top borders + contextual sub-text) — intentionally kept as 4 separate cards rather than the dividered-panel treatment used elsewhere, per explicit decision during the design-overhaul branch; two-column layout — left 60%: fitness area chart (CTL/ATL/TSB, 8 weeks, recharts AreaChart with gradient fills) + weekly load (TSS progress bar + day dot row); right 40%: coming up (next 4 planned), AI coach teaser (briefing preview + link), season goals (CRUD backed by `goals` table). No TopBar on /dashboard — greeting section replaces it (hamburger injected inline on mobile via `vexr:openMenu` custom event)
- Analytics (deep dive): fitness/fatigue/form area chart, weekly TSS actual vs planned bar chart, training by sport breakdown, volume by sport stacked bar chart, zone distribution — all with 4W/8W/12W/6M range toggle. Plus three new sections: Power Curve (line chart, best avg power from rides ≥ each duration band — 5m/10m/20m/30m/60m — always non-increasing; purple; FTP reference line; requires avg_power on ride workouts), Pace Curve (bar chart, best pace per distance band — 5K/10K/15K/HM/Mar — faster=taller, calculated from distance+duration with 10 min/km walk filter; green; threshold pace reference line), Heart Rate Zones (donut + stacked bar + legend; zones Z1–Z5 from profile.max_hr; falls back to 220–35 estimate; shown Z5→Z1 top-to-bottom)
- Training Plans: full import pipeline — PDF/HTML/text upload, AI parsing via `parse-plan` edge function (claude-sonnet-4-6), conflict detection against existing workouts, 3-step modal (upload → animated parse → review screen with collapsible week rows + sport filter tabs). On confirm: writes to `training_plans`, `training_sessions`, and `workouts` (planned: true, plan_id set for cascade). Plan cards show status badge, race info in amber, accent-coloured progress bar, three-dot menu (set active/complete/archive/delete), and a collapsible sessions list (sport filter tabs + week rows, same pattern as review screen, fetched on first expand from `training_sessions`). Delete shows confirmation dialog with session count; deletes matching planned workouts from calendar before removing plan. `workouts.plan_id` FK with ON DELETE CASCADE ensures calendar cleanup on future deletes. All Plans buttons use the shared `Button` component (`.purple-glow-btn`/`.upload-tab` CSS classes were removed in the design-overhaul branch — the app's last CSS-class-based buttons, replaced with real components).
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
- AI Coach page (`/ai-coach`): metrics row and quick stats row (training phase/weekly compliance/TSS comparison/CTL trend) each render as one dividered panel rather than four separate cards; weekly briefing card is a plain bordered panel (no colored rail or gradient glow — that pattern read as a generic "AI callout" and was deliberately removed), race predictor section, briefing history accordion (last 8). Edge function `supabase/functions/ai-briefing` calls Claude API (claude-sonnet-4-6), 24h cache with `force` override, accumulates history up to 9 entries. Requires `ANTHROPIC_API_KEY` Supabase secret and `ai_briefings` table. Dashboard has subtle ✦ banner linking to /ai-coach.
- Race Predictor (`src/components/ai/RacePredictor.tsx`): rendered inside AI Coach between weekly briefing and quick stats. Sport tabs (running/cycling/swimming/triathlon) default to user's primary sport. Running: Riegel formula (T2 = T1 × (D2/D1)^1.06) anchored at HM (threshold pace × 21.1km = T1); distances 5K/10K/HM/Marathon. Cycling: adjFTP × IF → power → speed via cube-root model → time; distances 40K/100K/160K. Swimming: CSS / IF per distance; distances 400m/1500m/1900m/3800m. Triathlon: all three sports with triathlon-specific IFs + transition times + brick run factor; Sprint/Olympic/70.3/Ironman. CTL adjustment capped at ±5% in all sports. AI narrative calls the dedicated `race-predictor` edge function (split out of `ai-briefing` to keep one responsibility per function), cached in localStorage under `vexr_race_predictor_<userId>`, regenerates when any metric drifts >5% or cache is >7 days old. Returns `{ narrative }` directly without saving to `ai_briefings`. Rate-limited under the `ai-briefing-predictor` bucket name in `api_rate_limits` (kept from before the split, so existing quotas carry over).
- Log Workout button moved from TopBar to Sidebar (desktop) and a mobile FAB (bottom: 80px, right: 16px, hidden on /library). TopBar now accepts optional `titleIcon`/`titleIconColor` props for per-page icon decoration.
- First-time user onboarding flow (`/onboarding`): 3-step full-screen flow shown to new users after signup. Step 1: name + sport pill selector. Step 2: FTP/run pace/CSS (conditional on sport)/race goal/race date with `?` tooltips. Step 3: Strava connect (orange) or skip. Progress bar + step dots at top, fade transitions between steps, back/skip on steps 2+3. Signup redirects to /onboarding; AppShell redirects to /onboarding if `profile.onboarding_completed === false`; completing or skipping step 3 sets `onboarding_completed = true` in profiles. Skipping Strava shows a welcome banner on Dashboard via `sessionStorage.onboardingWelcome`. Connecting Strava sets flag then redirects through existing OAuth flow. Backed by `profiles.onboarding_completed boolean default false`.
- Calendar improvements: clicking any empty day (month or week view) opens Log Workout modal with date pre-filled; empty cells show a `+` that brightens on hover. Planned workouts render with dashed border + 0.75 opacity + PLANNED badge; completed workouts keep solid sport-colour left border at full opacity. Month view mobile dots: hollow ring = planned, solid = completed. Weekly summary strip totals count completed only; planned count shown as `+N planned` sub-label on Workouts and TSS.
- Season Goals: `goals` table (id, user_id, text, completed, created_at) with RLS. CRUD panel on dashboard right column — add via text input + Enter/+, toggle complete with checkbox, delete with ×, incomplete first then completed greyed/strikethrough, completion ratio shown in header.
- Month/Week toggle buttons: no wrapper border — each button has its own `borderRadius: 6` and full border (`COLORS.border` inactive, `COLORS.accent` active), separated by 4px gap. No double-border or overflow clipping.
- Bundle code splitting: all pages lazy-loaded with `React.lazy()` + `Suspense`; `vite.config.ts` `manualChunks` splits vendor-react / vendor-supabase / vendor-charts. Main bundle reduced from 962KB to 33KB. `pdfjs-dist` excluded from `optimizeDeps` (too large for Vite pre-bundler); worker loaded via `?url` import.
- Weekly summary strip (`src/components/calendar/WeeklySummary.tsx`): rendered above the week view calendar only (no `horizontal` prop — always the strip layout). Single dark panel (`COLORS.surface`) with label+value text pairs and 1px dividers. Left section: Workouts/Duration/TSS/Distance/Elevation/Calories + sport rows. Right section: `COLORS.card` panel with CTL/ATL/TSB at 24px. Each stat cell uses a fixed 3-row layout (label / value / subtitle with `minHeight: 1rem`) so all cells are the same height; dividers use `alignSelf: stretch` at the left-section level (not inside a padded wrapper) so they run full height.
- Nutrition page (`/nutrition`): date navigator; Daily Summary panel combining an SVG calorie ring (colour shifts accent→green→danger as you fill/go over) with protein/carbs/fat progress bars + macro split segmented bar in one panel — no separate stat-card row above it, since that duplicated the same four numbers (removed in the design-overhaul branch); meal log (Breakfast/Lunch/Dinner/Snacks) as one panel with rule-line-separated collapsible sections (not individually bordered boxes), food item rows, remove button; Add Food modal with Browse/Create tabs — Browse searches merged `food_database` + `nutrition_custom_foods` with CUSTOM badge, Create saves to `nutrition_custom_foods`; Hydration card with 12-cup grid + ±250ml buttons; Workout Fuel Guide (Pre/During/Recovery phases); ⚙ Targets button opens `NutritionTargetsModal` to edit calorie/macro targets (upserted to `nutrition_targets`). Food database is DB-driven (no hardcoded list). All SQL in `supabase-schema.sql`.
- Typography: Inter (400–900) + DM Mono loaded via Google Fonts in `index.html`; `TopBar` title updated to `fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em'` — matches Nutrition page title style across all non-dashboard pages.
- Drag-and-drop calendar rescheduling: planned workouts are draggable in both month and week views (desktop only) via `@dnd-kit/core`. `DndContext` lives in `CalendarGrid`; `DraggableWeekCard` and `DraggableMonthItem` use `useDraggable` (disabled when `!workout.planned`); day cells/columns use `useDroppable`. Ghost `DragOverlay` follows cursor. Drop calls `updateWorkout(id, { date: newDate })`. 8px activation constraint preserves click behaviour. Mobile layout is unchanged.
- Production/ops: `ErrorBoundary` wraps both the root render (`main.tsx`) and the `/ai-coach` route separately (via its optional `fallback` prop). Password reset flow: `Login.tsx`'s "Forgot password?" → `supabase.auth.resetPasswordForEmail` → `src/pages/ResetPassword.tsx`. Sentry (`src/lib/sentry.ts`, `supabase/functions/_shared/errorTracking.ts`) is a no-op unless a DSN is configured. `npm run dev` reads `.env.local` (points at the local Supabase stack); a production build reads `.env.production.local` — using prod credentials locally requires deliberately copying values over, not the default. All 6 edge functions validate the Bearer token + request body shape before doing anything else, generate a per-request `requestId` for error logs/responses, and return `504` (not generic `500`) on a Claude timeout.
- `checkRateLimit`/`releaseRateLimit` (`supabase/functions/_shared/rateLimit.ts`) call `SECURITY DEFINER` Postgres functions (`check_and_increment_rate_limit`, `release_rate_limit_slot`) that do the count-check-and-insert atomically under a per-`(user_id, function_name)` advisory lock; the three AI edge functions call `releaseRateLimit()` if the Claude call fails after the slot was reserved, so a provider-side failure doesn't burn the user's hourly quota.
- `strava-sync` inserts activities via `.upsert(..., { onConflict: 'strava_activity_id', ignoreDuplicates: true })`, not `.insert()` — a plain insert fails the whole batch if a concurrent sync (e.g. two open tabs) already inserted one colliding row.
- `ImportModal`/`GeneratePlanModal`/`PlanCard` write to `workouts` directly (bulk insert, not a fit for `WorkoutsContext.addWorkout`'s single-row API) and call `refetchWorkouts()` immediately after, rather than relying solely on the realtime subscription.
- The `avatars` storage bucket is `public: true` with no SELECT policy on `storage.objects` — `<img>` URLs resolve via the public object endpoint (bypasses RLS for GET-by-known-filename), but nothing can enumerate the bucket's contents via the Storage list API.
- `ai-briefing` falls back to the most recent cached briefing (`{ cached: true, stale: true }`) instead of a hard error when a `force:true` refresh's Claude call fails.

## Testing

- Framework: Vitest + @testing-library/react, jsdom environment
- Commands: `npm test` (run once), `npm run test:watch` (watch mode), `npm run test -- --coverage` for coverage
- Setup: `src/test/setup.ts` — loads jest-dom matchers and mocks canvas
- Supabase mock: `src/test/mocks/supabase.ts` — canonical, in-memory table-backed query builder. `.eq`/`.match`/`.in`/`.neq`/`.gt(e)`/`.lt(e)`/`.order`/`.limit` actually filter seeded rows (not a canned response); an `undefined` filter value throws (catches auth-race bugs); every RLS-protected table (see `RLS_TABLES` in the file) is scoped to whichever id `setMockCurrentUser()` set, regardless of what filter the app code applied — mirrors real Postgres RLS rather than trusting the client's query shape. `seedMockTable(table, rows)` / `getMockTable(table)` seed and inspect table state across a test; `resetMockSupabase()` clears everything (call in `beforeEach`). `mockFrom`/`mockSupabaseAuth`/`mockChannel`/`mockSupabase` are still exported for one-off overrides (e.g. `mockFrom.mockImplementationOnce(...)` to simulate a raw DB error).
- 34 test files / 411 tests, each co-located in `__tests__/` beside the file under test
- Edge function helpers tested in `src/test/edge-helpers/`: `cors`, `planScheduling`, `parsePlanValidation`, `generatePlanValidation`, `stravaAuth`, `calculatePMC` (via `aiBriefing.test.ts`) import the real `_shared` module directly (no Deno globals in those files, so they load fine under Vitest); `stravaSync` and `aiBriefing.test.ts`'s briefing-pruning logic still duplicate their pure math into the test file instead, because `strava-sync/index.ts` references Deno globals at module scope (and pruning isn't extracted to `_shared/`) — if you touch either of those, update the duplicated copy too. `_shared/rateLimit.ts` is intentionally not unit tested — it constructs its Supabase client from `Deno.env.get(...)` at module scope, so testing it would mean restructuring an already-hardened, comment-explained atomic rate-limit mechanism for a two-line boolean check.
- Do not mock the Supabase client at the module level across all tests — import `src/test/mocks/supabase.ts` and use `seedMockTable`/`setMockCurrentUser`/`resetMockSupabase` per test rather than hand-rolling a new ad hoc mock

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

- One responsibility per function — don't fold unrelated behaviour into `ai-briefing`, `race-predictor`, `generate-plan`, `parse-plan`, `strava-auth`, or `strava-sync` instead of adding a focused new function.
- Validate the Bearer token and parse/validate input at the top of the handler before doing anything else, consistent with the existing auth pattern.
- Reuse `supabase/functions/_shared/cors.ts` rather than re-declaring CORS headers per function.
- Never log secrets, full JWTs, or the `ANTHROPIC_API_KEY` in anything that ends up in `get_logs` output.

### Tests

- **Write tests before implementation.** Derive test cases from what the correct behaviour of the feature should be — the spec, the requirement, the intended contract — not from whatever the implementation ends up doing. Tests written after the fact tend to just restate the implementation's actual behaviour (including its bugs) instead of verifying correctness against it. This applies to new business logic and to bug fixes: write a failing test that encodes the correct behaviour first, then make it pass.
- New business logic — especially calculation/derived-metric logic in `lib/` and edge function shared helpers — should get a test, following the existing co-location pattern (`__tests__/` beside the file under test).
- Use the existing Supabase mock (`src/test/mocks/supabase.ts`); seed table data with `seedMockTable`/scope it with `setMockCurrentUser` per test rather than hand-rolling a new ad hoc mock. Only reach for a one-off `mockFrom.mockImplementationOnce(...)` override for things the mock doesn't model (e.g. a raw transport/DB error).
- Don't write tests that just restate the implementation (asserting internal calls) — test behaviour and output.
- If a change touches `calculateMetrics.ts`, an edge function's shared logic, or a context's derived values, check whether existing tests in `__tests__/` need updating rather than leaving them passing on stale assumptions.

### Before finishing any change

- Run the tests touching the changed file (`npm test` or a targeted run) — especially for `lib/` calculation logic and edge function shared helpers.
- Review the diff for: duplicated logic, unused props/variables, hardcoded colors or values that should use `COLORS` or an existing constant, and any schema change not yet reflected in `supabase-schema.sql`.
- Confirm the change does only what was asked — no unrelated refactors bundled in silently.
- If a change touches RLS policies, auth logic, or the ES256/`verify_jwt` pattern, call out the security implication explicitly rather than assuming it's fine.

## Git Commit Conventions

- **Atomic commits** — one logical change per commit; a commit should be revertible on its own without breaking anything else. Don't bundle unrelated fixes into one commit even if they were made in the same session — split by concern before committing.
- **Subject line**: imperative mood, ~50 chars, no trailing period (e.g. "Fix rate limit bypass", not "Fixed" or "Fixes").
- **Body explains why, not what** — the diff already shows what changed; the body should cover reasoning, constraints, and what was ruled out. Blank line after the subject.
- **Every commit should leave the codebase in a working state** — tests pass, it builds, nothing left half-done. Run typecheck/lint/tests after each commit in a multi-commit sequence, not just at the end.
- **Conventional prefixes** (`fix:`, `feat:`, `refactor:`, `chore:`, `docs:`, `test:`) are not currently used in this repo's history but are worth adopting for new commits — enables automated changelogs/semver later and is much easier to start now than retrofit.
- **Squash noisy WIP commits before merging to main** — collapse typo-fix/WIP churn into one clean commit, but don't squash away legitimately separate changes just because they landed in the same session.

## Rules

- Always use the existing COLORS object — never hardcode colors
- Never use hardcoded mock data — all data comes from Supabase
- Inline styles only — no Tailwind, no CSS modules. Exception: `index.css` has `.no-spinner` (strip number input arrows), `.spinning` (keyframe spin animation), `.plans-field-input` (plans inputs with `:focus` state — the one legitimate CSS-class case, since inline styles can't express `:focus`), and keyframes `fadeSlideUp` / `pulse-ring` / `msgAppear`
- Supabase edge functions: always deploy with `--no-verify-jwt` (required — Supabase runtime only supports HS256 but this project uses ES256); always call via raw `fetch` with explicit `Authorization` + `apikey` headers (not `supabase.functions.invoke`); auth is enforced inside each handler via Bearer token check + `supabase.auth.getUser()`
- Keep components focused; extract subcomponents only when reused
- Mobile responsiveness: use `useIsMobile` hook from `src/hooks/useIsMobile.ts` (`useState(() => window.innerWidth < 768)` + resize listener). All responsive logic is JS-driven inline styles — no media queries, no Tailwind.
- Mobile modal pattern: `position: fixed, inset: 0, height: 100dvh, borderRadius: 0` — full screen, no overlay, no click-outside close
- React border warning: never mix `border` shorthand with `borderLeft`/`borderRight`/etc. in the same style object — always expand to all four sides (`borderTop`, `borderRight`, `borderBottom`, `borderLeft`)
- Modal pattern: fixed overlay (rgba 0.7–0.78) + centered card, click-outside closes (desktop only)
- Form inputs: background COLORS.surface or COLORS.bg, border COLORS.border, borderRadius 8
- All SQL (table definitions, RLS policies, seed data, migrations) goes in `supabase-schema.sql` at the repo root — never in component files or inline comments
- Dropdown menus that escape `overflow: hidden` containers must use `position: fixed` positioned via `getBoundingClientRect()`. Outside-click handlers must exclude both the trigger element AND the dropdown div (use two refs) to avoid race conditions between `mousedown` and `click`.
- `tsconfig.app.json`/`tsconfig.node.json` have `"strict": true` — no new code should need `any`. Supabase's generated types only narrow a column to a literal union when it's a Postgres `enum`; a `text` column with a `CHECK` constraint (e.g. `workouts.type`, `nutrition_logs.meal`) still generates as plain `string`, so narrowing to the app's literal union still needs an `as` cast at the `mapXRow()` boundary — that's expected and should stay scoped to one line, not spread through the codebase.
- Any `SECURITY DEFINER` Postgres function intended for service-role-only use must explicitly `revoke execute ... from anon, authenticated` — this project's default privileges grant `anon`/`authenticated` `EXECUTE` on new `public`-schema functions automatically, so `revoke ... from public` alone does not block them.
- `supabase/functions/_shared/cors.ts` fails closed: an origin outside `ALLOWED_ORIGIN` (plus localhost dev origins, always allowed) gets no `Access-Control-Allow-Origin` header at all, never a `'*'` fallback.
- Comments: one line, only when the WHY isn't obvious from the code. No multi-line comment blocks narrating what was tried/confirmed/found — that belongs in a commit message or this doc's hardening log, not inline.
