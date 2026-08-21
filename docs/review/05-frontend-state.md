# Frontend State Management & Data Flow Review

Scope: `src/contexts/`, `src/hooks/useAuth.ts`, and the pages/components that consume them
(Dashboard, Analytics, AICoach, Calendar, Plans, Library, Sidebar, StravaCallback).

## 1. WorkoutsContext — derived metrics recomputation

**No memoization anywhere in `WorkoutsContext.tsx`.** All derived helpers —
`getWorkoutsForMonth`, `getWorkoutsForWeek`, `getTodaysWorkouts`, `calculateFitnessMetrics`,
`getWeeklyLoadHistory`, `getDailyWeekLoad`, `getFitnessHistory`, `getUpcomingWorkouts` — are
plain closures re-created every render of `WorkoutsProvider` (`src/contexts/WorkoutsContext.tsx:106-215`),
and none of their *results* are cached with `useMemo`. They just re-filter/re-run
`calculatePMC` over the full `workouts` array every time they're called.

This is compounded by call-site behavior, not just the context:

- `Dashboard.tsx:712-717` calls `calculateFitnessMetrics()` **and** `getFitnessHistory(8)` **and**
  `getFitnessHistory(1)` in the same render — three independent full PMC recalculations
  (`calculatePMC` iterates every day from the earliest workout to today) on every Dashboard
  render, including renders triggered by unrelated state (`showWelcome`, modal open/close, `isMobile`).
- `AICoach.tsx:141-142` bypasses the context helpers entirely and calls `calculatePMC` directly,
  twice (`today`/`today` and `sevenDaysAgo`/`sevenDaysAgo`), duplicating the "compute once" intent
  called out in CLAUDE.md's DRY section for `calculateMetrics.ts`. It works (same canonical
  engine), but it means fitness numbers are computed via three different call sites
  (`WorkoutsContext`, `Dashboard`, `AICoach`) with no shared memoization — a good place for
  divergence to creep in if any of the three is ever tweaked independently.
- `Analytics.tsx:35-36` calls `getFitnessHistory(effectiveWeeks)` and `getWeeklyLoadHistory(effectiveWeeks)` directly in the render body of a component that also re-renders on `weeks` state changes.

**Provider value object itself is also unmemoized**: the object passed to
`WorkoutsContext.Provider` (`src/contexts/WorkoutsContext.tsx:218-226`) is a fresh literal every
render, with fresh function references for every helper. Any consumer via `useWorkouts()`
re-renders whenever `WorkoutsProvider` re-renders (i.e., whenever `workouts` or `loading` changes),
even if that consumer only destructures a stable action like `addWorkout`. In practice this is
low-impact today because `WorkoutsProvider` only re-renders on fetch/realtime events, not on
every keystroke — but it means none of the `get*` functions can be trusted as stable
`useCallback`/`useEffect` dependencies by children.

**Recommendation:** wrap `WorkoutsProvider`'s derived getters in `useMemo`/`useCallback` keyed on
`workouts`, and have `Dashboard`/`AICoach`/`Analytics` consume `calculateFitnessMetrics()` /
`getFitnessHistory()` from context instead of re-deriving via direct `calculatePMC` calls. This
isn't urgent at current data volumes (single-user workout history, likely low hundreds of rows)
but will matter as history grows.

**No stale-closure bugs found.** The one place that looks suspicious at a glance —
`StravaContext.tsx:43-50`, an effect with an `eslint-disable react-hooks/exhaustive-deps` calling
`triggerSync` (which isn't wrapped in `useCallback`) — is actually safe: the effect invokes
`triggerSync` synchronously in the same render pass where `connection`/`loadingConnection` become
true, so it always closes over the current `refetchWorkouts`/`syncing`, not a stale one.

## 2. Loading / error state coverage

| Source | Loading exposed? | Error exposed? |
|---|---|---|
| `WorkoutsContext` | ✅ `loading` | ❌ none — on fetch error (`WorkoutsContext.tsx:42-45`) it just sets `loading = false` and returns; `workouts` silently stays whatever it was (empty array on first load). No way for `Dashboard`/`Calendar`/`Analytics` to distinguish "no workouts yet" from "fetch failed." |
| `ProfileContext` | ❌ none | ❌ none — `ProfileContext.tsx:16-32` has no `loading` field in `ProfileContextValue` at all, and on error or missing row, `profile` just stays `null` forever with no signal. Every consumer (`Sidebar`, `Dashboard`, `AICoach`, `Analytics`, `GeneratePlanModal`) treats `profile === null` as "not loaded yet," but it's indistinguishable from "fetch failed, will never load." |
| `StravaContext` | ✅ `loadingConnection` for the connection fetch | Partial — `triggerSync` (`StravaContext.tsx:63-94`) has an empty `catch {}` block: sync failures are completely silent, no error state, no toast. Success shows a toast; failure shows nothing. A user whose token expired gets no feedback that sync stopped working. |
| `useAuth` | ✅ `loading` | ❌ none — `signIn`/`signUp`/`signOut` just re-throw; callers (`Login.tsx`, `Signup.tsx`) presumably catch these locally (not audited here), but the hook itself exposes no persisted error state. |
| `Plans.tsx` / `Library.tsx` | ✅ `loading` | ✅ `error` (both follow the same try/catch/`setError` pattern, `Plans.tsx:12-37`, `Library.tsx:12-27`) |
| `AICoach.tsx` generate flow | ✅ `generating` | ✅ `genError` (`AICoach.tsx:181-207`) |

**Finding:** the two contexts that back nearly every page — `WorkoutsContext` and
`ProfileContext` — are the ones with the weakest error handling, while page-local fetches
(Plans, Library, AICoach's briefing generation) consistently do it right. Worth bringing
`WorkoutsContext`/`ProfileContext` up to the same standard: add an `error` field, set it on
fetch failure, and let pages decide whether to show a banner (they already have the `loading`
branch to extend).

`ProfileContext` additionally has no `loading` state at all, which is more pressing than the
missing error — currently every consumer just falls back to defaults (`profile?.name || ''`,
`profile?.ftp || '—'`) so there's no broken UI, but there's also no way to show a skeleton or
distinguish "still fetching" from "guest has no profile."

## 3. Race conditions

**`WorkoutsContext.fetchWorkouts` has no request-ordering guard.** It's triggered from three
independent places (`WorkoutsContext.tsx:51-73`): initial mount, `onAuthStateChange`, and the
`postgres_changes` realtime subscription. All three call the same `fetchWorkouts`, which does a
full `select('*')` and calls `setWorkouts(data)` unconditionally when it resolves — there's no
abort controller and no request-id/sequence check. If two fetches are in flight and the older
one resolves after the newer one (out-of-order network response, e.g. two realtime events fire
in quick succession from a burst of Strava-imported workouts), the stale response overwrites the
fresher state. This is low-severity in practice (a subsequent realtime event or manual refetch
will reconcile it) but it is a real, unguarded race — worth a comment or a simple request-id
check (`const reqId = ++fetchIdRef.current; ...; if (reqId === fetchIdRef.current) setWorkouts(...)`)
given how many triggers funnel into the same setter.

**`ProfileContext`** has the identical shape of issue on a smaller scale (`fetchProfile` fires on
mount and on every `onAuthStateChange` event, `ProfileContext.tsx:16-32`), but profile fetches are
rare/one-shot enough that this is theoretical.

**No cancellation on unmount** in either context — if a component using these providers unmounts
mid-fetch there's no `AbortController`, but since the fetch result only feeds context state (not
local component state), this doesn't produce the classic "set state on unmounted component"
warning risk in practice; it would only matter if `WorkoutsProvider`/`ProfileProvider` themselves
unmounted mid-request, which only happens on full sign-out — low risk.

## 4. Prop drilling vs. context

Context usage is appropriately scoped, not overly broad:

- Modals that mutate workouts (`LogWorkoutModal`, `WorkoutDetailModal`) receive `addWorkout` /
  `updateWorkout` / `onSubmit` as **props** from their parent page rather than calling
  `useWorkouts()` directly — this is the right call, since it avoids subscribing modal
  components to the full `workouts` array just to get a couple of stable-ish action functions.
- `Sidebar.tsx:27-28` only pulls `useProfile()` and `useStrava()` (`syncing`, `connection`) — it
  doesn't touch `useWorkouts()`, so it won't re-render on every workout CRUD/realtime event.
- `GeneratePlanModal.tsx:110-111` pulls `calculateFitnessMetrics` from `useWorkouts()` and
  `profile` from `useProfile()` — reasonable, no raw Supabase calls duplicated.

No deep prop-drilling chains found (3+ levels) — everything that needs profile/workout/strava
data reaches for the corresponding context directly, per the CLAUDE.md architecture.

One structural note rather than a bug: `WorkoutsContext` bundles CRUD actions
(`addWorkout`/`updateWorkout`/`deleteWorkout`) and all the derived read-only selectors into a
single context value. Because the whole value object is recreated on every provider render
(see §1), any component that only needs a CRUD action (e.g. `GeneratePlanModal` only needing
`calculateFitnessMetrics`) still re-renders whenever `workouts` refetches for unrelated reasons
(e.g., a realtime event from a Strava sync while that modal happens to be open). Not currently
causing visible bugs since these are lightweight components, but it's the reason the context
can't be split into a "workouts data" context + "workouts actions" context later without a
larger refactor if a real performance issue shows up.

## 5. Components mixing data-fetching + logic + presentation (>150 lines)

| File | Lines | Notes |
|---|---|---|
| `src/pages/AICoach.tsx` | 564 | Mixes: Supabase fetching (`fetchBriefings`, `generate`), business logic (`calculatePMC` calls, `getTrainingPhase`, compliance %, TSS delta calc), and a large presentational tree, all in one component + several inline sub-components (`MetricCard`, `QuickStatCard`). **Best split candidate**: extract a `useAICoachData()` hook (briefings fetch/generate/error state) and a `useTrainingSnapshot()` (or fold into `WorkoutsContext`, see §1) for the derived metrics, leaving `AICoach.tsx` as pure presentation consuming both. `MetricCard`/`QuickStatCard` could move to `components/ai/`. |
| `src/pages/Dashboard.tsx` | 907 | Mixes fetching (via `useWorkouts`/`useProfile`), business logic (CTL delta, subtitle/sub-text string logic), and presentation, plus **five** sub-components defined inline in the same file (`FitnessAreaChart`, `WeeklyLoadCard`, `ComingUpCard`, `AICoachTeaser`, `SeasonGoalsPanel`, `NutritionSummaryCard`, `StatCard`) — three of which (`AICoachTeaser`, `SeasonGoalsPanel`, `NutritionSummaryCard`) do their own independent `supabase.from(...)` calls with local loading state, bypassing context entirely. This is the single largest file in `src/pages`. Given CLAUDE.md's file structure doc references a `components/dashboard/` directory (`StatCard`, `WeeklyLoadChart`, `FitnessChart`, `UpcomingWorkouts`) that **no longer exists on disk** — these components were apparently inlined into `Dashboard.tsx` at some point and the doc wasn't updated. Recommend extracting each inline sub-component to its own file under `components/dashboard/` (matching the CLAUDE.md doc) and moving `SeasonGoalsPanel`'s CRUD (add/toggle/delete goal) into a small `useGoals()` hook, following the existing `useAuth`/`useIsMobile` hook pattern. |
| `src/components/analytics/AnalyticsPage.tsx` | 885 | Presentation-heavy but the derivation functions (`getVolumeHistory`, `getZoneDistribution`, `getMonotony`, `getYTDStats`, `getBestPerformances`, `getPowerCurve`, `getPaceCurve`, `getHRZones`) are pure functions of `(workouts, ...)` defined at module scope, not fetching — this is actually a reasonable shape (logic separated from the component body, just co-located in one large file). Lower priority than the two above; if split, it'd be by extracting these pure functions into `lib/analyticsDerivations.ts` rather than by component boundary. |
| `src/pages/Onboarding.tsx` | 658 | Not primarily a data-flow concern (multi-step form UI); not reviewed in depth here since it's mostly local form state, not context/fetch orchestration. |

**Not flagged**: `Plans.tsx` (60 lines) and `Library.tsx` (50 lines) are exactly the shape to
copy from — thin fetch/loading/error wrapper delegating all presentation to `PlansPage`/
`LibraryPage`. `AICoach.tsx` and `Dashboard.tsx` should move toward that same split.
