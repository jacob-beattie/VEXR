# Vexr — Error Handling & Failure Modes Review

End-to-end review of what happens when things go wrong: Supabase network failures, Claude API
failures, uncaught render exceptions, data validation at the Supabase→frontend boundary, and
silent/swallowed catch blocks. Overlaps with two existing docs in this series — rather than
re-deriving those findings, this doc cross-references them and focuses on what they didn't cover:
page-level components (`Nutrition.tsx`, `Dashboard.tsx`'s inline cards), modal-level mutations
(delete flows), and the AI-Coach-specific angle of "what does the user see when Claude is down."
Findings use: **Severity** (Blocker/High/Medium/Low) · **Evidence** · **Why it matters** · **Fix** ·
**Effort** (S/M/L).

---

## Summary

**No Blocker findings.** Nothing crashes the app outright — there's a single root-level
`ErrorBoundary`, every edge function has a top-level `try/catch`, and the pages with the most
traffic (Plans, Library, AI Coach) handle errors properly. But the failure mode that recurs
everywhere else is the same one already flagged in `05-frontend-state.md` §2 for the two core
contexts: **on a failed fetch, state silently stays at its default/previous value with no
indication anything went wrong.** This review found that pattern is much more widespread than just
`WorkoutsContext`/`ProfileContext` — it's the default posture of almost every `useEffect` data
fetch in the codebase, including the entire Nutrition page and three of Dashboard's inline cards.

Worth fixing soonest:

- **F1**: `Nutrition.tsx` has zero error handling anywhere — no try/catch, no error state, on any
  of its ~10 Supabase call sites — and two of its handlers (`handleRemoveFood`,
  `handleSetHydration`) optimistically update local state without checking whether the write
  actually succeeded, so a failed delete/update can silently leave the UI showing something the
  database doesn't have.
- **F2**: `WorkoutDetailModal`'s delete flow (`handleDelete`) catches the error and does nothing
  with it — no message, no toast — while its sibling save flow two lines below does this
  correctly. A failed delete looks identical to a successful one from the user's perspective.
- **F3**: the AI rate-limit ledger (`api_rate_limits`) is decremented *before* the Claude call, not
  after a successful one — so if the Anthropic API is down, slow, or rate-limiting Vexr, every
  failed attempt still burns one of the user's 5 (or 10, for the race predictor) requests/hour,
  compounding the outage. This extends the "no stale-cache fallback" note already in
  `04-edge-functions.md` §3.

---

## 1. Network failures (Supabase)

**Already covered in depth:** `05-frontend-state.md` §2 has a table showing `WorkoutsContext` has
no `error` state (silently keeps stale/empty `workouts` on fetch failure,
`WorkoutsContext.tsx:42-45`) and `ProfileContext` has *neither* `loading` nor `error`
(`ProfileContext.tsx:16-32` — a failed or slow profile fetch is indistinguishable from "no profile
yet," forever). That doc's recommendation (add an `error` field to both, matching the pattern
`Plans.tsx`/`Library.tsx`/`AICoach.tsx` already use correctly) stands and isn't repeated here.

This review extends that finding to the rest of the app — the same "destructure `data`, ignore
`error`, silently keep defaults" shape shows up well beyond the two contexts:

### F1 — `Nutrition.tsx` has no error handling on any of its Supabase calls, and two write paths update local state before confirming the write succeeded
**Severity:** Medium
**Evidence:**
- Every fetch in the file follows the same shape with no `try/catch` and no error state:
  `fetchStatic` (`Nutrition.tsx:678-694`, loads targets/custom foods/food database),
  `fetchDay` (`Nutrition.tsx:699-719`, loads today's meal log + hydration). Both destructure
  `.data` and ignore `.error` entirely; on failure, the page just renders as if the user has no
  targets, no meals, and hasn't drunk any water today — no banner, no retry.
- `handleRemoveFood` (`Nutrition.tsx:732-741`) calls `supabase.from('nutrition_logs').delete(...)`
  and unconditionally removes the item from local `meals` state immediately after, without
  checking the returned `error`. If the delete fails server-side (network blip, RLS edge case), the
  UI shows the food item gone while it's still in the database — it reappears on the next
  `fetchDay()` (date change or remount), which will look like a bug to the user ("I deleted this,
  why is it back?").
- `handleSetHydration` (`Nutrition.tsx:743-748`) has the identical shape: `setHydration(liters)`
  fires before the `await supabase...upsert(...)` even resolves, and the result isn't checked at
  all. A failed hydration update silently reverts on next load with no explanation.
- Contrast with `handleAddFood` (`Nutrition.tsx:721-730`), which *does* check `if (!error && data)`
  before updating state — so the file isn't consistently one way or the other, which makes the gap
  easy to miss in review.
**Why it matters:** This is the only page in the app where an optimistic update isn't guarded by
an error check, so it's the one place a network failure produces state that's actively wrong
(not just stale/empty) until the next refetch. Given Nutrition has no loading/error UI at all, a
user on a flaky connection gets no signal that any of this happened.
**Fix:** Add the same `if (error) { ...surface it... ; return }` guard `handleAddFood` already
uses to `handleRemoveFood` and `handleSetHydration` before touching local state; add a page-level
`error` string (mirroring `Plans.tsx`/`Library.tsx`) for the two `fetch*` effects so a failed
initial load isn't indistinguishable from "no data yet."
**Effort:** S

### F2 — `WorkoutDetailModal`'s delete flow swallows the error completely; its own save flow two lines away does it correctly
**Severity:** Medium
**Evidence:** `WorkoutDetailModal.tsx:289-297`:
```ts
const handleDelete = async () => {
  setDeleting(true)
  try {
    await onDelete(workout.id)
    onClose()
  } catch {
    setDeleting(false)
  }
}
```
`onDelete` is `WorkoutsContext.deleteWorkout`, which does `if (error) throw error`
(`WorkoutsContext.tsx:90-93`) — so a failed delete (RLS denial, network drop, FK constraint) does
throw. But the catch here only resets `deleting` back to `false`; there's no `setError(...)` call,
even though the component already has an `error` string and a rendered error banner two lines
below for the save path (`handleSave`, `WorkoutDetailModal.tsx:299-310`, `error &&` banner at
`WorkoutDetailModal.tsx:668-671`). The delete button just stops showing "Deleting…" and reverts to
"Delete" — visually identical to a successful delete that closed the modal, except the modal
*doesn't* close, which is the only signal (easy to miss, no explicit message).
**Why it matters:** Deleting a workout is a destructive, one-click action a user might not double-
check succeeded — if it silently fails, they may believe a workout was removed from their training
log when it wasn't.
**Fix:** `catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to delete workout'); setDeleting(false) }` — reuses the existing `error` state/banner already in the component.
**Effort:** S

### Minor — same silent-default pattern in three of Dashboard's inline cards and `ProfileSettingsModal`'s benchmark load
**Severity:** Low
**Evidence:** `AICoachTeaser` (`Dashboard.tsx:297-312`), `SeasonGoalsPanel`'s initial load
(`Dashboard.tsx:374-380`), and `NutritionSummaryCard` (`Dashboard.tsx:507-525`) each do their own
`supabase.from(...)` call independent of context (already noted structurally in
`05-frontend-state.md` §5) and none check `.error` — on failure they render their empty/zero state,
which happens to look identical to "user has no data yet." Same shape in
`ProfileSettingsModal.loadData` (`ProfileSettingsModal.tsx:218-232`, fetching `fitness_benchmarks`)
— a failed fetch just leaves the benchmark charts empty with `loadingData` set to `false`, no error
shown. `SeasonGoalsPanel`'s mutations (`addGoal`/`toggleGoal`/`deleteGoal`,
`Dashboard.tsx:382-401`) are the one bright spot in this list — they do check `error` before
touching state (unlike Nutrition's equivalent), so they don't have F1's state-drift problem, just
the silent-no-feedback one.
**Why it matters:** Low severity individually — these are all secondary/summary widgets, not the
primary data path, and "shows empty state" is a reasonable-looking degradation, not a broken UI.
Flagged because it's the same root cause as F1 and the `05-frontend-state.md` §2 findings, just at
lower stakes: there is currently no single place in this codebase's data-fetching code that treats
"fetch failed" differently from "fetch succeeded, empty result."
**Fix:** Same as the `05-frontend-state.md` recommendation — if/when `WorkoutsContext`/
`ProfileContext` get an `error` field, apply the same `if (error) ...` guard to these call sites
too rather than one-off fixing each. Not urgent enough to warrant fixing in isolation before that.
**Effort:** S each / M to do consistently across all of them

---

## 2. Claude API failures (AI Coach / Race Predictor / Plan generation / Plan import)

**Already covered:** `04-edge-functions.md` §3 confirms all four Claude call sites have a 30s
`AbortController` timeout and that a timeout/error is caught by the outer `try/catch` and turned
into a normal error response (no hang). That doc's "Minor — no stale-cache fallback when a forced
refresh's Claude call fails" note (§3, `ai-briefing/index.ts:188-207`) already covers the specific
UX gap of "what does a refresh look like when Claude is down" for the briefing.

**Frontend consumption is solid across the board** — this review checked all four call sites and
each correctly surfaces a user-facing error on failure:
- `AICoach.tsx` briefing generation → `genError` state + banner (`AICoach.tsx:181-207, 423-426`)
- `RacePredictor.tsx` narrative generation → `narrativeError` state (`RacePredictor.tsx:317-372`)
- `GeneratePlanModal.tsx` plan generation → `generateError` state (`GeneratePlanModal.tsx:172-226`)
- `ImportModal.tsx` plan parsing → `parseError` state, with a specific "check your connection"
  message when the `fetch` itself throws (`ImportModal.tsx:232-244`) as opposed to when the edge
  function returns a non-2xx (`ImportModal.tsx:246-250`) — a nice touch, distinguishing "couldn't
  reach the server" from "server rejected the request."

The one silent exception, **already flagged in `05-frontend-state.md`'s §2 table**: `StravaContext.
triggerSync` has an empty `catch {}` (`StravaContext.tsx:90-91`) — not Claude-related, but the same
"AI/external-API-adjacent background task fails completely silently" shape. Included here for
completeness since it's directly on-topic for "what happens when an external API call fails."

### F3 — the per-hour rate-limit slot is consumed *before* the Claude call succeeds, so Anthropic outages compound into "you're rate-limited" for the user
**Severity:** Medium
**Evidence:** In all three AI edge functions, the sequence is: `checkRateLimit` (which inserts a
row into `api_rate_limits` as soon as the count check passes,
`ai-briefing/index.ts:64-80`/`generate-plan/index.ts:44-55`/`parse-plan/index.ts:43-54`) →
*then* the Claude `fetch` (`ai-briefing/index.ts:307-323`, `generate-plan/index.ts:229-245`,
`parse-plan/index.ts:179-195`). There's no rollback of the rate-limit insert if the Claude call
subsequently times out, errors, or gets rate-limited itself (all three just `throw` from inside the
same try block, `ai-briefing/index.ts:325-329`, etc.).
**Why it matters:** During any Anthropic-side slowness/outage, a user's retries are the exact
thing that exhausts their quota fastest — 5 failed attempts in a row (briefing) or 5 failed plan
generations both permanently use up the hour's allowance, so by the time Claude recovers the user
is now *also* rate-limited by Vexr for up to an hour, on top of whatever they already waited
through. The error message they see (`'An internal error occurred. Please try again.'`) actively
encourages the retry that causes this. This is a distinct mechanism from the two rate-limiting
issues already documented in `04-edge-functions.md` §4 (F1: non-atomic check-then-insert) and §3
(no stale-cache fallback) — this one is about the ledger being wrong on failure, not about
concurrency or missing a cache fallback.
**Fix:** Move the `api_rate_limits` insert to *after* a successful Claude response (or, cheaper:
wrap the Claude call + insert in one block and only insert on the success path). This also makes
`checkRateLimit`'s current shape — read count, then unconditionally insert — closer to "count
successful calls" rather than "count attempts," which is what a per-hour cost-control limit should
be measuring anyway.
**Effort:** S

---

## 3. Global error boundary

**Confirmed present and correctly implemented.** `src/components/ErrorBoundary.tsx` is a class
component using `getDerivedStateFromError`/`componentDidCatch`, wraps the entire app at the root
in `main.tsx:9-11`, logs the error + component stack via `console.error`, and renders a
themed fallback ("Something went wrong — reload the page") with a reload button rather than a
blank screen or React's default red error overlay. `src/components/__tests__/ErrorBoundary.test.tsx`
exists and covers this. This is genuinely solid — a render-time exception anywhere in the tree
degrades to a friendly, on-brand fallback instead of a blank page.

### Minor — single boundary means blast radius is the whole app, not the failing feature
**Severity:** Low / informational
**Evidence:** There is exactly one `ErrorBoundary`, at the very root (`main.tsx`). Nothing wraps
individual pages, routes, or high-risk components (e.g. `PowerCurve`/`PaceCurve`/`HRZones` in
Analytics, which do real arithmetic on `workouts` data and would be the most likely candidates for
a render-time crash from unexpected input shapes — see §4). A render exception in, say, one
Analytics chart takes down the entire app (dashboard, calendar, everything) to the "reload page"
screen, rather than just that chart failing gracefully in place.
**Why it matters:** Not a bug — a single root boundary is a reasonable default and is strictly
better than no boundary. Flagged because the task specifically asks whether "one component
crashing takes down the whole app," and the honest answer is: no crash reaches a blank screen, but
yes, any single component's render crash currently takes down every other page/feature along with
it, since there's no per-route or per-widget isolation.
**Fix:** Optional, not urgent at current scale. If a specific page/widget turns out to be a
recurring crash source in production (via the `componentDidCatch` console logging — note there's no
external error-reporting sink wired up, so these currently only show up if a user reports them or
someone checks `get_logs`/browser console directly), wrap that one route or widget in a second,
local `ErrorBoundary` instead of adding boundaries everywhere preemptively.
**Effort:** S per boundary added, if/when needed

---

## 4. Data validation at the Supabase→frontend boundary

**Confirmed: nothing is validated at runtime.** Every read from Supabase is a blind type assertion,
not a parse:
- `ProfileContext.tsx:21` — `setProfile(data as Profile)`
- `WorkoutsContext.tsx:47` — `setWorkouts((data ?? []) as Workout[])`
- `Library.tsx:21` — `setItems(data as WorkoutLibraryItem[])`
- `Plans.tsx:25` — `(data as any[]).map(p => ({...}))`
- `Nutrition.tsx:729` — `data as FoodEntry`

There is no schema-validation library anywhere in the codebase (no zod/io-ts/valibot in
`package.json`) and no hand-rolled shape check on any Supabase response. TypeScript's `as` is a
compile-time-only assertion — it provides zero runtime protection. If the live schema drifts from
`src/types/index.ts` (a column renamed in a migration but the type not updated, a column made
nullable that the interface still marks as required, an edge function or a manual `execute_sql`
write inserting a row that doesn't match the shape the frontend expects), nothing in the app would
catch it before the malformed data reaches a component.

**Calibrated severity — this is a real structural gap, but not an actively manifesting bug today**,
for two reasons: (1) most numeric aggregation call sites already defensively guard with `|| 0` or
`??` (e.g. `calculateMetrics.ts:40`, `WeeklySummary.tsx:47,58`, `AnalyticsPage.tsx:121-124,186` all
do `(w.duration_minutes || 0)` / `(w.tss || 0)` rather than trusting the type), so a `null` where a
`number` is expected mostly degrades to a `0` in a sum rather than a `NaN` or a crash; (2) no code
path was found calling string methods (`.split`, `.slice`, etc.) directly on a nullable field
without an existing guard (checked `avg_pace`/`run_pace`/`css` usage specifically, since those are
the `string | null` fields most likely to be string-processed).

### Minor — the DB schema is more permissive than the TypeScript types claim, and only ad-hoc `|| 0` guards at usage sites paper over the gap
**Severity:** Low
**Evidence:** `Workout.duration_minutes: number` and `Workout.tss: number` in `src/types/index.ts:20-21`
are typed as required, non-nullable. The actual column definitions in `supabase-schema.sql:21-22`
are `duration_minutes integer` (nullable, no default) and `tss integer default 0` (nullable,
defaults to 0 only on insert if omitted — a row can still have `tss = null` if explicitly set that
way, e.g. via a manual `execute_sql` UPDATE or a future edge function that forgets to set it).
TypeScript will not catch this at any point — `workout.duration_minutes / 60` compiles cleanly and
is only safe at runtime because every current call site happens to use `|| 0` first, by convention,
not by anything the compiler enforces. A new call site added later that does direct arithmetic
without that guard (e.g. `workout.duration_minutes / 60` without the `||`) would compile, pass
review unless someone notices the missing guard, and silently produce `NaN` in the UI (React
renders `NaN` as the literal text "NaN," not an error) the first time a null slips through.
**Why it matters:** This is a latent risk that scales with codebase size/contributor count, not a
present bug. It matters more given the project's own CLAUDE.md DRY section explicitly calls for
centralizing derived-metric logic in `lib/` — a validation layer at the fetch boundary (context
level) would be the natural single place to enforce "every `Workout` in state has real numbers,"
removing the need for every downstream consumer to remember the `|| 0` convention individually.
**Fix:** Not worth introducing a full schema-validation library for a solo project at this data
volume. Cheapest meaningful improvement: a small `normalizeWorkout(row)` function in
`WorkoutsContext.tsx` (or `lib/`) that coerces `duration_minutes`/`tss` to `0` if null/undefined
once, at the fetch boundary, so every downstream consumer can trust the TS type instead of
independently reimplementing the `|| 0` guard. If the schema drift risk grows (multiple
contributors, more edge functions writing to `workouts`), revisit with a lightweight `zod` schema
on the two or three hottest tables (`workouts`, `profiles`).
**Effort:** S (normalize helper) / M (zod schemas, only if warranted later)

---

## 5. Empty catch blocks / catch-that-only-logs

Exhaustively checked every `catch` block in `src/` (16 files) and every edge function (5 files).
**Edge functions: none found** — all five wrap the entire handler in one top-level `try/catch` that
always returns a structured JSON error response (confirmed in `04-edge-functions.md` §1); the two
inner `try/catch(JSON.parse)` blocks in `generate-plan`/`parse-plan` also both return a proper
`parse_failed` response rather than swallowing (`generate-plan/index.ts:263-270`,
`parse-plan/index.ts:213-220`).

**Frontend: three catches don't surface anything to the user**, of which two are real gaps and one
is benign:

| Location | Body | Assessment |
|---|---|---|
| `StravaContext.tsx:90-91` | `catch {}` (fully empty) | **Real gap.** Already flagged in `05-frontend-state.md` §2 — a user whose Strava token has expired or whose sync fails for any reason gets no toast, no error state, nothing. Success shows a toast; failure is indistinguishable from "nothing new to sync." |
| `WorkoutDetailModal.tsx:294-296` | `catch { setDeleting(false) }` | **Real gap** — see F2 above. |
| `RacePredictor.tsx:314` | `catch { /* ignore */ }` | **Benign.** This wraps a `localStorage.getItem`/`JSON.parse` of a client-side cache (`RacePredictor.tsx:305-315`), not a network call — if the cached blob is malformed, silently falling back to "no cached narrative, show the generate button" is the correct behavior, and it's the one place in the codebase where an empty catch is explicitly commented as intentional. No fix needed. |

No catch block anywhere does a bare `console.log`/`console.error` with no other action (i.e., the
"logs but doesn't tell the user" pattern the task asked about specifically) — every non-empty catch
either sets an error state, re-throws, or (in edge functions) returns an error response. The gap in
this codebase is empty catches and missing catches (no `try` at all around a fetch, per §1), not
log-only ones.

**Fix for both real gaps:** covered above as part of the `StravaContext`/`05-frontend-state.md`
recommendation and F2 respectively — no new fix needed here beyond what's already specified.
