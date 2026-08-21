# Performance & Scale Review

Scope: does Vexr hold up under real growth in per-user data volume (years of daily training
history) and user count, not just at today's dataset size. Checked live data via Supabase MCP
for a size baseline: **106 workout rows across 3 users, 136 kB table size** — current volume is
trivial, so every finding below is about what breaks *later*, not what's broken now.

## 1. Workout history fetch — no pagination, no date bound

`WorkoutsContext.fetchWorkouts` (`src/contexts/WorkoutsContext.tsx:37-46`) does:

```ts
supabase.from('workouts').select('*').order('date', { ascending: false })
```

No `.limit()`, no date-range filter — every call fetches the user's **entire** workout history,
every column, including the `structure` jsonb block for structured workouts. This single query is
re-run on: initial mount, every `onAuthStateChange` event, every realtime `postgres_changes` event
on the table, and explicitly after every `addWorkout` / `updateWorkout` / `deleteWorkout`. So
editing the notes field on one workout re-downloads the user's whole history before the UI
reflects the edit.

**Rough sizing:** a daily/near-daily triathlete logging swim+bike+run (+strength) sessions
realistically produces 300–500 workout rows/year. At 106 rows / 136 kB today, that's roughly
~1.3 kB/row on disk; JSON-over-the-wire will run somewhat higher, especially once `structure`
(multi-block interval sessions) is populated in real accounts (currently 0 structured rows in
prod).

**Where it starts to hurt:**
- **~1,000–2,000 workouts (2–4 years of consistent logging):** payload climbs into the low
  megabytes; initial dashboard/calendar paint gets a visible delay on mobile/cellular, and every
  single save in `LogWorkoutModal`/`WorkoutDetailModal` now blocks on re-downloading the entire
  history before the UI updates, not just the one changed row.
- **~5,000+ workouts (5+ years, or a future "coach" tier viewing an athlete's full history):**
  payload could reach 10 MB+; combined with the four independent full-array re-scans described
  in §2, this is where UI jank becomes clearly user-visible, not just wasted bandwidth.

**Recommendation:** not urgent today, but flag before it's a support ticket. The architecture
currently assumes "all workouts in memory" (many derived helpers filter the full array
client-side), so the real fix is bigger than adding `.limit()` — e.g. bound the default fetch to
a rolling window (12–24 months) for Dashboard/Calendar/Analytics defaults, and add an explicit
paginated/aggregated path for anything that needs full-history lookups (best performances, power
curve, etc.). The existing `idx_workouts_user_date` composite index (§5) already supports a
date-bounded version of this query with no schema change.

## 2. `calculateMetrics.ts` — complexity is linear in *account age*, not workout count, and never cached

`buildTssByDay` (`src/lib/calculateMetrics.ts:34-42`) is O(workout rows) — a single pass, fine.

`runPMC` (`calculateMetrics.ts:56-93`) is **O(days between the user's first-ever workout and
today)**, not O(workout count) — it iterates one EWMA step per calendar day since account
creation, including rest days with zero TSS. This is the correct algorithm for the PMC model, but
it means cost scales with how long someone has been using the app, decoupled from how much data
they've actually logged.

**Recomputed from scratch on every call, no incremental update, no memoization anywhere.** There
are **four independent call sites** all re-running the full day-loop over the full workout array
with zero sharing between them:
- `Dashboard.tsx:713-717` — `calculateFitnessMetrics()` + `getFitnessHistory(8)` +
  `getFitnessHistory(1)`, three full recomputations per render, including renders triggered by
  unrelated state (`isMobile`, modal open/close).
- `AICoach.tsx` calls `calculatePMC` directly a second time, bypassing `WorkoutsContext` entirely.
- `WeeklySummary.tsx:67` calls `calculatePMC` directly, a third independent call site.
- `Analytics.tsx:35` calls `getFitnessHistory(effectiveWeeks)` via context, a fourth.

(This memoization gap was already flagged in `docs/review/05-frontend-state.md` §1 from a
correctness/re-render angle — this note is the scaling angle on the same root cause.)

**Where it hurts:** raw cost is cheap in absolute terms — ~1,500 iterations for 4 years of
account age is sub-millisecond in JS by itself. The real risk is multiplicative: 4 call sites ×
frequent re-renders × a full `buildTssByDay` scan of the entire in-memory `workouts` array each
time. This starts to be perceptible somewhere around **2,000–5,000 workouts (5–10+ years of
history)** combined with a UI that re-renders several times per interaction (typing, toggling a
modal) — each of those re-renders redoes 3–4 full history scans + day-loops that didn't need to
change. Below that threshold it's wasted CPU but not user-visible.

**Recommendation:** if this ever becomes a real bottleneck, the standard fix is incremental —
persist yesterday's CTL/ATL and roll forward only the days elapsed since the last computation,
rather than replaying the whole history every time. Not worth building now; worth remembering
the day someone reports dashboard lag after years of continuous use.

## 3. N+1 query patterns — none found

Checked every place a list is fetched and then acted on per-item:
- **Plan import** (`ImportModal.tsx:294,332`) and **AI plan generation**
  (`GeneratePlanModal.tsx:289,322`) both insert `training_sessions` and `workouts` as a single
  batched array `.insert(...)`, not one insert per session.
- **`parse-plan` conflict detection** (`supabase/functions/parse-plan/index.ts:239-243`) does one
  batched `.in('date', datesToCheck)` query across all resolved session dates, then loops in
  memory over a `Set` — not one query per session.
- **`strava-sync`** (`supabase/functions/strava-sync/index.ts:304`) builds an `inserts` array and
  does a single batched insert, not one insert per imported activity.
- **`PlanCard.tsx`** fetches a plan's sessions once, lazily, on first expand — not eagerly for
  every plan card on the Plans page.

Nothing to fix here. Worth re-checking if a future "coach views multiple athletes" feature is
built — that's the shape most likely to introduce a per-athlete loop later.

## 4. Bundle size — Plans page ships pdfjs-dist to every visitor

Built the app (`npm run build`) to check real chunk sizes:

```
dist/assets/Plans-ChCfvzLJ.js               461.01 kB │ gzip: 134.33 kB   ← largest page chunk
dist/assets/vendor-charts-Djpk73xv.js       396.76 kB │ gzip: 113.92 kB   ← all of Recharts, every page
dist/assets/pdf.worker.min-iDqQPrd3.mjs   1,232.30 kB                     ← correctly lazy, only on parse
```

The Plans page chunk alone (134 kB gzip) is larger than the vendor-charts chunk that every other
page shares. Cause: `ImportModal.tsx:2` does `import * as pdfjsLib from 'pdfjs-dist'`, and
`PlansPage.tsx:5` imports `ImportModal` **statically**, not lazily. The pdfjs worker itself is
correctly split into its own chunk and only loads when a PDF is actually parsed — but the main
pdfjs-dist library code gets bundled directly into the Plans page chunk regardless, so *every*
visitor to `/plans` downloads it whether or not they ever click "Import."

Recharts, by contrast, is already imported correctly everywhere (named imports —
`{ AreaChart, Area, XAxis, ... }` from `'recharts'`) and gets its own shared `vendor-charts`
chunk via the existing `manualChunks` config — this part is already handled well.

**Where it hurts:** invisible at today's traffic. It starts to matter once `/plans` becomes a
common landing page (e.g. right after onboarding, or a signup funnel that pushes new users to
import a plan) — 134 kB gzip added to that page load is roughly a second copy of Recharts, paid
by users who mostly won't touch the import feature in that session.

**Recommendation:** `const ImportModal = lazy(() => import('./ImportModal'))` inside
`PlansPage.tsx`, matching the same lazy-loading pattern already used for all 13 top-level routes
in `App.tsx`. Small, mechanical fix, no architecture change needed.

## 5. Database indexes — already correctly in place

`supabase-schema.sql` has `idx_workouts_user_date on workouts(user_id, date)` — a composite index
that covers exactly the query shape `WorkoutsContext.fetchWorkouts` uses today (RLS-scoped by
`user_id`, ordered by `date`), and would equally well support the date-bounded version of that
query recommended in §1 with **no schema change required** when that fix lands.

Every other frequently-hit table also has its `user_id` (or `user_id, date`) index already:
`idx_goals_user_id`, `idx_nutrition_logs_user_date`, `idx_training_sessions_user_id`,
`idx_training_plans_user_id`, `idx_workout_library_user_id`, `idx_fitness_benchmarks_user_id`,
`idx_training_zones_user_id`, `idx_ai_briefings_user_id`, `idx_nutrition_custom_foods_user_id`,
`idx_api_rate_limits`. No missing index found for any query pattern currently in the codebase —
this part of the schema was clearly built with growth in mind from the start.

## Summary

| # | Issue | Severity today | Hurts at |
|---|---|---|---|
| 1 | Unbounded `workouts` fetch, refetched on every mutation | None (106 rows) | ~1–2k workouts (2–4 yrs) for load time; ~5k+ for mutation latency |
| 2 | PMC recomputed from scratch, 4 uncached call sites | None | ~2–5k workouts (5–10+ yrs) combined with frequent re-renders |
| 3 | N+1 queries | Not found | — |
| 4 | Plans chunk bundles pdfjs-dist unconditionally | None (solo traffic) | Once `/plans` is a common entry page / funnel target |
| 5 | Missing indexes | Not found — already correct | — |

Nothing here is urgent at current scale (single-digit users, ~100 workout rows). The two real
findings worth planning for are #1 (unbounded history fetch) and #4 (one-line lazy-load fix for
`ImportModal`) — both are cheap to defer and cheap to fix later, but #1 is the one that will
eventually require an actual design decision (rolling window vs. full history) rather than a
mechanical change.
