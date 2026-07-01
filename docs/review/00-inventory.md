# Vexr — File Inventory

Read-only reconnaissance pass. Maps every top-level module/directory, its rough size, and
what it does. This is the map for the module-by-module review that follows — no fixes in
this pass.

Total `src/` line count: **~17,950** across ~74 files (27 of which are test files, ~2,970
test lines / ~14,580 non-test lines). Root-level config/docs/SQL: ~985 lines.

---

## Root

| Path | Files | Lines | Description |
|---|---|---|---|
| `CLAUDE.md` | 1 | 240 | Project instructions/conventions consumed by Claude Code (this file) |
| `README.md` | 1 | 251 | Human-facing project overview |
| `roadmap.txt` | 1 | 95 | Feature roadmap / backlog notes |
| `supabase-schema.sql` | 1 | 339 | Canonical SQL — all table defs, RLS policies, constraints; source of truth for schema |
| `vite.config.ts` | 1 | 34 | Vite build config — manualChunks vendor splitting (react/supabase/charts), pdfjs-dist excluded from optimizeDeps |
| `index.html` | 1 | 26 | HTML entrypoint; loads Inter + DM Mono fonts |
| `package.json` / `package-lock.json` | 2 | — | Dependency manifest. **Note:** `tailwindcss` + `@tailwindcss/vite` are present in devDependencies despite CLAUDE.md stating "No Tailwind" — worth confirming whether these are vestigial or in active use |
| `vercel.json` | 1 | 4 | Vercel SPA rewrite config (all routes → index.html) |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | 3 | — | TypeScript project references |
| `eslint.config.js` | 1 | — | ESLint flat config |
| `.mcp.json` | 1 | — | Supabase MCP server config (gitignored, project ref `fsskwaazmoidayqtsipy`) |
| `.env.local` | 1 | — | Local env vars (not read — may contain secrets) |

## `design_handoff_*/` (4 directories, untracked in CLAUDE.md)

| Path | Files | Description |
|---|---|---|
| `design_handoff_health/` | 2 (Health.html, README.md) | Static design mockup handoff, not wired into the app |
| `design_handoff_nutrition/` | 2 | Static design mockup handoff for Nutrition page |
| `design_handoff_plans/` | 2 | Static design mockup handoff for Plans page |
| `design_handoff_social/` | 2 | Static design mockup handoff for a **Social** feature — no corresponding page/route exists in `src/`; either an unbuilt feature or stale handoff |

These four are standalone HTML/README pairs, not imported by the build. Not mentioned in
CLAUDE.md's file structure section.

## `public/`

Static assets served as-is: favicons (`favicon.png`, `favicon-old.svg`), `icons.svg` sprite,
two logo PNGs (`vexr-fixed.png`, `vexr-new.png`), `robots.txt` (currently permissive —
CLAUDE.md flags this needs updating before public launch since Landing is live at `/`).

## `docs/review/`

New — this review series. Currently just this file.

---

## `src/` (top-level files)

| File | Lines | Description |
|---|---|---|
| `App.tsx` | 353 | Root component — routing, `ProtectedLayout` (auth guard → ProfileProvider → WorkoutsProvider → StravaProvider → AppShell), lazy-loaded page routes |
| `main.tsx` | 13 | React entrypoint, wraps root in `ErrorBoundary` |
| `App.css` | 184 | Global keyframes/utility classes (`.purple-glow-btn`, `.upload-tab`, `.plans-field-input`, animations) |
| `index.css` | 141 | Base styles, `.no-spinner`, `.spinning`, font imports |

## `src/lib/` — 4 files, 234 lines

Shared business logic / infra, imported everywhere.

| File | Lines | Description |
|---|---|---|
| `calculateMetrics.ts` | 127 | **Canonical PMC engine** — `calculatePMC`, `buildTssByDay`, `runPMC` (CTL/ATL/TSB exponential moving averages) |
| `tss.ts` | 72 | TSS calculation helpers (pace/power/CSS/RPE → TSS). Not mentioned in CLAUDE.md's file structure list — worth cross-checking for overlap with `calculateMetrics.ts` |
| `colors.ts` | 29 | `COLORS` object — single source of truth for the dark theme palette |
| `supabase.ts` | 6 | Supabase client init |

Plus `__tests__/calculateMetrics.test.ts`, `__tests__/tss.test.ts`.

## `src/types/` — 1 file, 129 lines

`index.ts` — all shared TypeScript interfaces (Workout, Profile, TrainingPlan, etc.)

## `src/hooks/` — 2 files, 55 lines

| File | Description |
|---|---|
| `useAuth.ts` | Supabase auth session hook |
| `useIsMobile.ts` | `window.innerWidth < 768` + resize listener; drives all JS-based responsive layout |

Plus 2 test files.

## `src/contexts/` — 3 files, 400 lines

| File | Description |
|---|---|
| `ProfileContext.tsx` | Fetches/exposes `profile` + `setProfile` |
| `WorkoutsContext.tsx` | Workouts array, derived metric helpers, `refetchWorkouts`, PMC engine consumer |
| `StravaContext.tsx` | Strava OAuth connection state, auto-sync, toasts, `triggerSync`/`disconnect` |

Plus 3 test files (one per context).

## `src/pages/` — 13 files, 4,491 lines

| File | Lines | Description |
|---|---|---|
| `Analytics.tsx` | 44 | Thin page wrapper — actual content lives in `components/analytics/AnalyticsPage.tsx` |
| `Library.tsx` | 50 | Thin page wrapper for `components/library/LibraryPage.tsx` |
| `Plans.tsx` | 60 | Thin page wrapper for `components/plans/PlansPage.tsx` |
| `StravaCallback.tsx` | 128 | OAuth redirect handler for Strava |
| `ResetPassword.tsx` | 133 | Password reset landing page (validates session, calls `updateUser`) |
| `Signup.tsx` | 147 | Signup form → redirects to `/onboarding` |
| `Calendar.tsx` | 169 | Thin page wrapper for calendar components |
| `Login.tsx` | 180 | Login form + "Forgot password?" inline reset flow |
| `Landing.tsx` | 506 | Public marketing/portfolio page at `/`, light theme (only light-theme page in the app) |
| `AICoach.tsx` | 564 | Weekly briefing, race predictor section, quick stats, briefing history |
| `Onboarding.tsx` | 658 | 3-step first-time-user flow (profile basics → benchmarks → Strava connect) |
| `Dashboard.tsx` | 907 | Daily driver — greeting, stat cards, fitness chart, weekly load, upcoming, AI teaser, season goals |
| `Nutrition.tsx` | 945 | Daily fuel tracking — calorie ring, macros, meal log, hydration, food DB modal |

Note: `Dashboard.tsx`, `Nutrition.tsx`, `Onboarding.tsx`, and `AICoach.tsx` carry most of the
page-level logic directly rather than delegating to `components/`, unlike Analytics/Library/
Plans/Calendar which are thin wrappers. Worth checking during the review pass whether these
four would benefit from extraction given their size.

Plus 10 test files in `__tests__/`.

## `src/components/` (top-level files) — 5 files, 2,908 lines

Modals used across multiple pages.

| File | Lines | Description |
|---|---|---|
| `ErrorBoundary.tsx` | 74 | Class component catching unhandled render errors |
| `DayWorkoutsModal.tsx` | 159 | Mobile bottom-sheet listing all workouts for a selected day |
| `WorkoutDetailModal.tsx` | 686 | View/edit/delete a single workout, structured block breakdown, Strava link |
| `LogWorkoutModal.tsx` | 880 | Create/log a workout — TSS auto-calc, structured workout builder (Simple/Structured toggle) |
| `ProfileSettingsModal.tsx` | 1,109 | Edit profile, benchmarks, training zones (largest single component in the app) |

Plus `__tests__/ErrorBoundary.test.tsx`.

### `src/components/ai/` — 1 file, 649 lines

`RacePredictor.tsx` — sport-specific race time prediction (Riegel formula for running,
power/speed model for cycling, CSS-based for swimming, combined for triathlon), AI narrative
via `ai-briefing` edge function in `race_predictor` mode. Plus 1 test file.

### `src/components/analytics/` — 1 file, 884 lines

`AnalyticsPage.tsx` — all deep-dive charts: fitness/fatigue area chart, weekly TSS bar chart,
sport breakdown, volume stacked bar, zone distribution, Power Curve, Pace Curve, HR Zones,
YTD summary, Training Monotony, Best Performances. No test file for this one despite its size.

### `src/components/calendar/` — 4 files, 1,248 lines

| File | Lines | Description |
|---|---|---|
| `CalendarGrid.tsx` | 540 | Month/week view container, `DndContext` for drag-to-reschedule |
| `WeeklySummary.tsx` | 276 | Stats strip (activity totals + CTL/ATL/TSB) above week view |
| `CalendarDay.tsx` | 263 | Single day cell renderer (month view) |
| `DayBottomSheet.tsx` | 169 | Mobile day-detail sheet |

Plus 1 test file (`WeeklySummary.test.tsx` — `CalendarGrid`/`CalendarDay`/`DayBottomSheet`
appear untested).

### `src/components/layout/` — 2 files, 274 lines

`Sidebar.tsx`, `TopBar.tsx` — desktop sidebar nav + mobile hamburger, top bar with
`titleIcon`/`titleIconColor` props. Plus 1 test file (`TopBar` only).

### `src/components/library/` — 1 file, 248 lines

`LibraryPage.tsx` — workout template save/filter/delete.

### `src/components/plans/` — 5 files, 2,550 lines

| File | Lines | Description |
|---|---|---|
| `PlansPage.tsx` | 166 | Container — plan list, status filters |
| `ImportReviewScreen.tsx` | 392 | Step 3 of import — collapsible week rows, sport filter tabs, conflict review |
| `PlanCard.tsx` | 651 | Plan card — status badge, progress bar, three-dot menu, collapsible sessions list |
| `GeneratePlanModal.tsx` | 667 | AI plan generation from free-text prompt via `generate-plan` edge function — **not listed** in CLAUDE.md's file structure section (only ImportModal/ImportReviewScreen are mentioned there) |
| `ImportModal.tsx` | 674 | Step 1–2 of import — PDF/HTML/text upload, animated parse via `parse-plan` |

Plus 1 test file (`PlanCard.test.tsx` — `PlansPage`/`ImportModal`/`ImportReviewScreen`/
`GeneratePlanModal` appear untested).

### `src/components/ui/` — 2 files, 77 lines

`Button.tsx`, `Badge.tsx` — small shared primitives. Both have test files.

## `src/test/` — 5 files (infra) + included test counts above

| File | Lines | Description |
|---|---|---|
| `setup.ts` | 18 | Global Vitest setup — jest-dom matchers, canvas mock |
| `mocks/supabase.ts` | 49 | Chainable Proxy-based Supabase query builder mock (`makeQueryBuilder`) |
| `edge-helpers/aiBriefing.test.ts` | 136 | Unit tests for `ai-briefing` shared logic |
| `edge-helpers/cors.test.ts` | 74 | Unit tests for shared CORS helper |
| `edge-helpers/stravaSync.test.ts` | 183 | Unit tests for `strava-sync` shared logic |

Total test files across the repo: **27**, ~2,970 lines.

## `src/assets/`

`hero.png`, `vexr-logo.png`, `vexr-logo-white.png` (used), plus default Vite scaffolding
(`react.svg`, `vite.svg` — likely dead/unused).

---

## `supabase/functions/` — 5 edge functions + 1 shared module, ~1,466 lines

| Path | Lines | Description |
|---|---|---|
| `_shared/cors.ts` | 25 | Shared CORS headers helper, imported by all functions |
| `ai-briefing/index.ts` | 368 | Weekly AI briefing + race predictor narrative via Claude (claude-sonnet-4-6), 24h cache, 9-entry history prune |
| `generate-plan/index.ts` | 325 | AI training plan generation from free-text prompt (claude-sonnet-4-6), max_tokens 8000 |
| `strava-sync/index.ts` | 322 | Imports last 30 days of Strava activities, dedupes by `strava_activity_id`, rate-limited 3/hr |
| `parse-plan/index.ts` | 277 | PDF/HTML/text plan parsing for import pipeline (claude-sonnet-4-6) |
| `strava-auth/index.ts` | 149 | Strava OAuth token exchange, rate-limited 5/hr |

Each function directory also has a `config.toml` (all `verify_jwt = false` per the ES256
pattern documented in CLAUDE.md). No `supabase/migrations/` directory exists — schema is
tracked solely via `supabase-schema.sql` at the repo root, consistent with CLAUDE.md's stated
workflow (though this means there's no local migration history, only the live project +
this file).

`supabase/.temp/` — CLI-generated local state (project ref, versions), not source.

---

## Cross-cutting observations for the review pass

- **Untracked-in-docs items to reconcile:** `tailwindcss` in `package.json` despite "no
  Tailwind" rule; `src/lib/tss.ts` not mentioned in CLAUDE.md's file structure; `GeneratePlanModal.tsx`
  not mentioned; four `design_handoff_*/` directories (including an unbuilt "Social" feature)
  not mentioned anywhere in CLAUDE.md.
- **Size outliers worth a closer look:** `ProfileSettingsModal.tsx` (1,109 lines),
  `LogWorkoutModal.tsx` (880), `Nutrition.tsx` (945 — page-level, not delegated to
  `components/`), `Dashboard.tsx` (907, same pattern).
  Might be worth an outsize-file / responsibility-split review pass.
- **Test coverage gaps:** `AnalyticsPage.tsx` (884 lines, no test file), `CalendarGrid.tsx`/
  `CalendarDay.tsx`/`DayBottomSheet.tsx` (no tests, only `WeeklySummary` covered),
  `PlansPage.tsx`/`ImportModal.tsx`/`ImportReviewScreen.tsx`/`GeneratePlanModal.tsx` (no
  tests, only `PlanCard` covered), `Sidebar.tsx` (no test, only `TopBar` covered).
- **No `supabase/migrations/` directory** — all schema changes rely on discipline around
  updating `supabase-schema.sql` in lockstep with live `apply_migration` calls; there's no
  independently-diffable migration history to audit against.
