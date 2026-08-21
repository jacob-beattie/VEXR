# Vexr — Architecture Review

Read-only review of overall architecture against six questions. Findings use:
**Severity** (High/Medium/Low) · **Evidence** (file:line) · **Why it matters** · **Fix** · **Effort** (S/M/L).

---

## 1. Separation between UI / business logic / data access

Overall the layering is intentional and mostly holds: `lib/` is a clean leaf layer, `contexts/`
own data access + realtime for the tables they cover (`profiles`, `workouts`,
`strava_connections`), and pages/components consume those contexts rather than reimplementing
fetch logic for the same tables. Direct `supabase.from(...)` calls inside pages/components for
tables that have **no** dedicated context (`goals` in `Dashboard.tsx`, `nutrition_logs` /
`nutrition_targets` / `hydration_logs` / `nutrition_custom_foods` / `food_database` in
`Nutrition.tsx` and `Dashboard.tsx`, `training_zones` / `fitness_benchmarks` in
`ProfileSettingsModal.tsx`, `training_plans` / `training_sessions` in `PlanCard.tsx` /
`PlansPage.tsx`) are consistent with the project only building contexts for
Profile/Workouts/Strava — this is a reasonable YAGNI call, not a violation.

The real violations are around the `workouts` table specifically, which *does* have a context:

### F1 — Plan feature writes to `workouts` bypass `WorkoutsContext`
**Severity:** Medium
**Evidence:**
- `src/components/plans/ImportModal.tsx:332` — `supabase.from('workouts').insert(calendarRows)`
- `src/components/plans/GeneratePlanModal.tsx:322` — same insert pattern (the component already imports `useWorkouts` at line 7 and calls `calculateFitnessMetrics()` at line 110, but not `addWorkout`)
- `src/components/plans/PlanCard.tsx:392-397` — `supabase.from('workouts').delete()...` on plan delete

**Why it matters:** `WorkoutsContext.addWorkout`/`deleteWorkout` (`src/contexts/WorkoutsContext.tsx:75-94`) exist specifically to keep the in-memory `workouts` array in sync after a write, and there's also a realtime channel (`WorkoutsContext.tsx:62-67`) that will eventually catch external writes. But these three call sites write directly and don't call `refetchWorkouts()` afterward — they rely entirely on the realtime subscription firing. If that channel is briefly disconnected (mobile network drop, tab backgrounded, Supabase realtime hiccup), a plan import/generation/deletion won't be reflected on the Calendar/Dashboard until the socket reconnects, with no explicit fallback. It also means the table's "owning" context can be silently bypassed by any new feature, which erodes the reason to have `WorkoutsContext` own the table at all.
**Fix:** Route these three writes through `addWorkout`/`deleteWorkout` (may need a batched variant of `addWorkout` for the bulk-insert cases in `ImportModal`/`GeneratePlanModal`), or at minimum call `refetchWorkouts()` immediately after the direct write as the other bypass sites already do implicitly via realtime.
**Effort:** M

### F2 — "Start of week" date math duplicated in 5 places
**Severity:** Low-Medium
**Evidence:** The `day === 0 ? -6 : 1 - day` Monday-start-of-week idiom is independently implemented in:
- `src/contexts/WorkoutsContext.tsx:119-120` (`getWorkoutsForWeek`)
- `src/contexts/WorkoutsContext.tsx:144-145` (`getDailyWeekLoad`)
- `src/contexts/WorkoutsContext.tsx:171-172` (`getWeeklyLoadHistory`)
- `src/pages/Dashboard.tsx:129`
- `src/components/analytics/AnalyticsPage.tsx:106-107` and again at `210-211`

**Why it matters:** This is exactly the pattern CLAUDE.md's own DRY section warns about: *"Derived values ... should be computed once in lib/ or context, not recalculated slightly differently in multiple components — divergence here is how dashboard/analytics/calendar numbers quietly drift out of sync."* There's no shared `getWeekStart()` helper, so a future change to week-start convention (e.g. supporting Sunday-start locales) has to be found and edited in 5 places by hand.
**Fix:** Extract a single `getWeekStart(date: Date): Date` (and `getWeekEnd`) into `src/lib/` and use it everywhere above.
**Effort:** S

---

## 2. Is `calculateMetrics.ts` properly isolated?

**Yes, on the frontend.** `src/lib/calculateMetrics.ts` has exactly one import (`Workout` type
from `../types`), no React hooks, no browser-only APIs beyond `Date`/`Math`/`Intl` date
formatting (all available in Node/jsdom too), and no Supabase client reference. It's pure —
same inputs always produce the same `{ current, history }` output — and it's already
unit-tested (`src/lib/__tests__/calculateMetrics.test.ts`). Every frontend consumer goes through
it correctly: `WorkoutsContext.tsx:137,194` (via `calculatePMC`), `WeeklySummary.tsx:67`,
`AICoach.tsx:141-142`. No reimplementation exists anywhere in `src/`.

### F3 — The PMC formula *is* reimplemented in the `ai-briefing` edge function, with no shared source of truth
**Severity:** Medium
**Evidence:**
- `supabase/functions/ai-briefing/index.ts:14-60` — `calculateCTLATL()`, explicitly commented at line 14: `// PMC constants (mirrors src/lib/calculateMetrics.ts)`
- `src/test/edge-helpers/aiBriefing.test.ts:19-20, 52-53` — the test for this edge-function logic *also* hardcodes its own copy of `CTL_K`/`ATL_K` and the recurrence relation, rather than importing a shared fixture or the real `calculateMetrics.ts` constants

**Why it matters:** This duplication is structurally hard to avoid (Deno edge functions can't import from `src/lib/`), but the comment is the *only* thing keeping the two formulas in sync — there's no test that would fail if `calculateMetrics.ts`'s constants or recurrence changed without a matching edit in the edge function. A future tweak to the PMC model (e.g. adjusting the 42-day/7-day time constants) would silently desync the AI briefing's CTL/ATL/TSB numbers from what the Dashboard/Analytics/Calendar show, with no test catching it.
**Fix:** At minimum, add a comment/test in `src/lib/__tests__/calculateMetrics.test.ts` asserting the exact constants (`1 - Math.exp(-1/42)`, `1 - Math.exp(-1/7)`) so a diff to either file is a visible signal to check the other. A stronger fix would be a small shared JSON/constants file checked by both test suites, or a golden-output cross-check test that feeds identical fixture data through both implementations and asserts equal results.
**Effort:** S (comment/test) to M (golden cross-check)

---

## 3. Is `WorkoutsContext` a "god context"?

**No** — the three contexts are correctly split by domain and don't mix unrelated concerns.
`ProfileContext` owns `profiles`, `WorkoutsContext` owns `workouts` + realtime, `StravaContext`
owns the third-party OAuth/sync state, and the one cross-context dependency
(`StravaContext.tsx:4` imports `useWorkouts` to call `refetchWorkouts()` after a sync) is
one-directional and appropriate — Strava sync results genuinely need to invalidate workout data.

### F4 — `WorkoutsContext` bundles raw CRUD with a growing library of analytics selectors
**Severity:** Low
**Evidence:** `src/contexts/WorkoutsContext.tsx` (237 lines) contains three distinct layers in one file: (1) fetch/CRUD + realtime subscription (lines 36-94), (2) calendar-oriented selectors — `getWorkoutsForMonth`, `getWorkoutsForWeek`, `getTodaysWorkouts`, `getUpcomingWorkouts`, and (3) reporting/analytics selectors — `calculateFitnessMetrics`, `getWeeklyLoadHistory`, `getDailyWeekLoad`, `getFitnessHistory` — consumed almost exclusively by `Dashboard.tsx`/`AnalyticsPage.tsx`, not by Calendar.
**Why it matters:** Not a defect today, but it's the same root cause as F2 (duplicated date math) — selector logic living inside a context makes it easy to reimplement slightly differently elsewhere instead of importing a pure function. It also means testing a single selector (e.g. `getWeeklyLoadHistory`) requires mounting the whole provider rather than calling a function with a `workouts` array, unlike `calculateMetrics.ts` which is trivially unit-tested.
**Fix:** Extract the layer-(3) selectors into `src/lib/workoutSelectors.ts` as pure functions taking `workouts: Workout[]` as an argument (mirroring the `calculateMetrics.ts` pattern), and have the context call them. This would also let them absorb the F2 fix directly.
**Effort:** M

---

## 4. Are the 5 Deno edge functions structured consistently?

CORS is the one thing done right and consistently everywhere: all 5 functions import
`parseAllowedOrigins`/`getCorsHeaders` from `_shared/cors.ts` rather than re-declaring headers.
Everything else below shows the functions evolved independently.

### F5 — `strava-auth` validates the caller's identity *after* calling an external API and reading secrets
**Severity:** High
**Evidence:** `supabase/functions/strava-auth/index.ts` — body is parsed and the Strava token
exchange is performed at lines 37-75 (including reading `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET`
and throwing if unset at lines 49-50), and the Vexr Bearer token is only checked afterward, at
line 81. Every other function checks auth as the literal first step of the handler:
`ai-briefing/index.ts:89-95`, `generate-plan/index.ts:65-83`, `parse-plan/index.ts:64-82`,
`strava-sync/index.ts:105-111`.
**Why it matters:** This directly contradicts CLAUDE.md's own stated rule: *"Validate the Bearer
token and parse/validate input at the top of the handler before doing anything else, consistent
with the existing auth pattern."* Practically, it means an unauthenticated caller can POST any
`code` value to `strava-auth` and trigger a real call to Strava's OAuth token endpoint (burning a
one-time auth code, consuming API quota) without ever presenting a valid Vexr session — the
401 only fires *after* that external call has already happened. Combined with F6 below, a
caller in this pre-auth window can also receive an internal error message describing exactly
which secret is missing.
**Fix:** Move the `authHeader`/`supabase.auth.getUser()` check (currently lines 78-101) to the
top of the handler, before the body is parsed or Strava is contacted, matching the pattern in
the other four functions.
**Effort:** S

### F6 — Error responses inconsistently expose internal detail
**Severity:** Medium
**Evidence:**
- Sanitized pattern: `ai-briefing/index.ts:360-366`, `generate-plan/index.ts:317-323`,
  `parse-plan/index.ts:269-275` — all return `{ error: 'An internal error occurred. Please try
  again.' }` on the catch-all, logging the real message server-side only via `console.error`.
- Leaky pattern: `strava-auth/index.ts:141-148` and `strava-sync/index.ts:312-320` return
  `err.message` (or the raw error object stringified) directly in the response body. Concretely,
  `strava-auth/index.ts:49-50` throws `'STRAVA_CLIENT_ID secret is not set on this edge
  function'` and `strava-auth/index.ts:72-74` forwards Strava's own error response text — both
  would reach the client verbatim via the catch-all.

**Why it matters:** This isn't a "logging secrets" violation (CLAUDE.md's rule about not logging
secrets in `get_logs` output is respected — no token values are logged), but it's an inconsistent
information-disclosure surface: two of five functions will hand a caller specifics about
misconfigured infra or upstream (Strava/Postgres) error text, while three sanitize the same class
of failure.
**Fix:** Make `strava-auth`/`strava-sync` match the other three — log the real error via
`console.error`, return a generic message to the client.
**Effort:** S

### F7 — Catch-all HTTP status code differs for the same failure class
**Severity:** Medium
**Evidence:** For the generic "unexpected internal error" catch block: `ai-briefing/index.ts:365`
and `strava-auth/index.ts:146` / `strava-sync/index.ts:319` return **400**, while
`generate-plan/index.ts:322` and `parse-plan/index.ts:274` return **500**.
**Why it matters:** A 400 tells a client "you sent something wrong, don't retry as-is"; a 500
tells it "this was our fault, retrying might work." Using both for what's meant to be the same
"something unexpected broke" case makes client-side retry logic and monitoring/alerting
(anything that buckets by status code) unreliable across functions.
**Fix:** Standardize on 500 for the unexpected-error catch-all (400 should be reserved for actual
validation failures, which `generate-plan`/`parse-plan` already return correctly elsewhere, e.g.
`generate-plan/index.ts:113-143`).
**Effort:** S

### F8 — `checkRateLimit` is reimplemented 5 times, with 2 different signatures, instead of living in `_shared/`
**Severity:** Medium
**Evidence:**
- `ai-briefing/index.ts:64-80`, `strava-auth/index.ts:11-27`, `strava-sync/index.ts:11-27` — all
  three take `(supabase, userId, functionName, limit)`.
- `generate-plan/index.ts:44-55`, `parse-plan/index.ts:43-54` — both take only
  `(supabase, userId)` and hardcode the function name (`'generate-plan'` / `'parse-plan'`) as a
  string literal inside the helper body.

**Why it matters:** This is the same logic (query `api_rate_limits` for a count in the last hour,
insert a row, compare to a limit) copy-pasted 5 times with a signature drift already visible
between two of the copies. CLAUDE.md is explicit here: *"Shared edge function logic goes in
`supabase/functions/_shared/` (e.g. `cors.ts`) — check there before duplicating CORS headers,
auth checks, or other cross-function logic in a new edge function."* A 6th edge function added
later has a 50/50 chance of copying the "wrong" (hardcoded-name) version, or writing a third
variant.
**Fix:** Move `checkRateLimit(supabase, userId, functionName, limit)` into
`supabase/functions/_shared/rateLimit.ts` and import it in all 5 functions, matching the
`_shared/cors.ts` precedent.
**Effort:** S

### F9 — Auth header validation depth differs
**Severity:** Low
**Evidence:** `ai-briefing/index.ts:90`, `strava-auth/index.ts:81`, `strava-sync/index.ts:106`
check `authHeader?.startsWith('Bearer ')`; `generate-plan/index.ts:66` and
`parse-plan/index.ts:65` only check `if (!authHeader)` (truthiness, no prefix check).
**Why it matters:** Functionally harmless today — a malformed header still fails
`supabase.auth.getUser()` right after — but it's an easy detail to get wrong differently in a 6th
function, and it signals the auth-check block was written independently 5 times rather than
factored out.
**Fix:** Fold into the same `_shared/` auth-check helper suggested for F8's rate limiter (a
single `requireAuth(req, supabase)` helper covering both the Bearer-prefix check and
`getUser()` call would resolve F9 and reduce the F5/F6 risk class going forward).
**Effort:** S

### F10 — Logging verbosity is inconsistent
**Severity:** Low
**Evidence:** `strava-auth/index.ts` and `strava-sync/index.ts` have 8-10 `console.log` trace
statements per function (athlete IDs, user IDs, HTTP statuses at nearly every step — e.g.
`strava-auth/index.ts:39,46-47,60,69,79,95,115,136`). `ai-briefing`, `generate-plan`, and
`parse-plan` only log on the error path.
**Why it matters:** No secrets are logged (consistent with the CLAUDE.md rule), so this isn't a
security issue, but `get_logs` output volume is wildly different per function for no functional
reason, making the Strava functions noisier to read through when debugging something unrelated.
**Fix:** Trim the Strava functions' step-by-step tracing to match the error-only pattern used
elsewhere, or intentionally standardize a debug-log convention if the extra tracing is wanted
project-wide.
**Effort:** S

---

## 5. Circular dependency risk

**None found.** Specifically checked:
- `grep` across `src/lib/*` for any import from `contexts/`, `components/`, or `pages/` —
  zero matches. `lib/` is a clean leaf layer.
- `src/types/index.ts` has **zero** imports — pure interface definitions, cannot participate in
  any cycle.
- Context-to-context dependency is one-directional: `src/contexts/StravaContext.tsx:4` imports
  `useWorkouts` from `WorkoutsContext.tsx`; neither `WorkoutsContext.tsx` nor
  `ProfileContext.tsx` import anything from `StravaContext` or from each other.
- Provider nesting in `App.tsx` (`ProfileProvider` → `WorkoutsProvider` → `StravaProvider`)
  matches this dependency direction, so `StravaProvider` always mounts inside a tree where
  `useWorkouts()` is already available — no risk of a provider calling a hook before its
  dependency is mounted.

This is a genuine strength of the codebase and worth preserving as a rule of thumb during the
review: any future context or `lib/` addition should keep imports flowing one way
(`components`/`pages` → `contexts` → `lib` → `types`), never back up the chain.

---

## 6. Navigability score: **4 / 5**

A new engineer could work in this codebase productively within a day or two without a guided
tour, but would hit a few specific surprises along the way.

**What makes it a 4, not lower:**
- File/folder conventions are consistent and match what CLAUDE.md describes: pages are thin
  wrappers delegating to `components/` for anything non-trivial (`Analytics.tsx`, `Library.tsx`,
  `Plans.tsx`, `Calendar.tsx` are all under 170 lines), tests are reliably co-located in
  `__tests__/`, and `lib/` genuinely holds the shared logic it claims to (Section 2 above).
- The import graph is clean and one-directional (Section 5) — nothing requires tracing a cycle
  to understand what depends on what.
- CLAUDE.md itself is unusually thorough and, apart from the specific gaps already flagged in
  the inventory pass (`00-inventory.md`: `tss.ts`, `GeneratePlanModal.tsx`, and the `tailwindcss`
  devDependency not mentioned), matches the actual repo structure closely enough to be a
  reliable map rather than aspirational documentation.

**What holds it back from a 5:**
- A new engineer reading `WorkoutsContext.deleteWorkout`/`addWorkout` would reasonably assume
  that's *the* way to mutate the `workouts` table, then be confused to find three other files
  (F1) writing to it directly with no comment explaining why.
- The edge functions (Section 4) look like they were each written by copying a previous one and
  quietly evolving — five slightly different `checkRateLimit` implementations, mixed error
  status codes, and one function (`strava-auth`) that checks auth in a different position than
  the documented convention. Someone building a 6th edge function from "whichever one I found
  first" has better-than-even odds of propagating the wrong pattern.
- CLAUDE.md documents an auth-first-in-handler rule that the codebase doesn't uniformly follow
  (F5) — a new engineer who trusts the doc at face value and doesn't independently read all 5
  functions would be misled about actual behavior in `strava-auth`.

None of this requires deep spelunking to discover — everything above surfaced from grep plus
reading the ~10 files involved — which is why it's a 4 and not a 3.

---

## Summary table

| # | Finding | Severity | Effort |
|---|---|---|---|
| F1 | Plan writes to `workouts` bypass `WorkoutsContext` | Medium | M |
| F2 | Week-start date math duplicated 5x | Low-Medium | S |
| F3 | PMC formula reimplemented in `ai-briefing`, no cross-check | Medium | S–M |
| F4 | `WorkoutsContext` mixes CRUD with analytics selectors | Low | M |
| F5 | `strava-auth` checks auth after external call + secrets read | **High** | S |
| F6 | Inconsistent error-detail exposure across edge functions | Medium | S |
| F7 | Inconsistent catch-all HTTP status codes (400 vs 500) | Medium | S |
| F8 | `checkRateLimit` duplicated 5x, 2 signatures, not in `_shared/` | Medium | S |
| F9 | Inconsistent Bearer-header validation depth | Low | S |
| F10 | Inconsistent edge function logging verbosity | Low | S |

No findings for circular dependencies (clean) or for `calculateMetrics.ts` isolation on the
frontend (clean, well-tested).
