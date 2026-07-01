# Vexr — Code Quality Review (Duplication & Complexity)

Read-only review of duplication and unnecessary complexity against five questions. Findings use:
**Severity** (High/Medium/Low) · **Evidence** (file:line) · **Why it matters** · **Fix** · **Effort** (S/M/L).

---

## Summary

The headline pattern is not that the codebase lacks canonical modules — it has good ones
(`src/lib/calculateMetrics.ts`, `src/lib/tss.ts`, `supabase/functions/_shared/cors.ts`) and
CLAUDE.md is explicit that they're supposed to be the single source of truth. The problem is that
**canonical modules exist but keep getting bypassed**: the same pure function (`localDateKey`,
`paceToSeconds`, HR-zone-from-max_hr math, the PMC CTL/ATL loop, rate-limit checking, the
Claude API call itself) gets reimplemented inline the next time a new component or edge function
needs it, instead of importing the existing one. Two of these reimplementations have already
**diverged** in behavior from the original (pace parsing in `ProfileSettingsModal`, the empty-state
string in `formatDuration`), which is the exact failure mode CLAUDE.md's DRY section warns about.
On the edge-function side, the five functions correctly share CORS logic via `_shared/cors.ts`,
but rate-limiting and the raw Anthropic `fetch` call — both copy-pasted 4-5 times — never made it
into `_shared/` despite CLAUDE.md naming that directory as exactly where cross-function logic
belongs. Separately, the Plans feature's two entry points (import vs. AI-generate) duplicate both
their session-mapping logic and their review-screen UI as full parallel implementations rather
than a shared component, and `ai-briefing` folds an unrelated feature (race predictor narrative)
into what CLAUDE.md itself calls a single-responsibility function.

| # | Question | Answer |
|---|----------|--------|
| 1 | Genuine duplication — TSS/zone math, formatting, CORS/auth/rate-limit, context bypass, Plans UI pattern | Zone math (HR%, pace parsing) and date/duration formatting are reimplemented 3-7x outside their canonical `lib/` homes, with two confirmed behavioral divergences (F4, F5, F6). Rate-limiting and the Anthropic API call are duplicated verbatim across edge functions instead of living in `_shared/` (F1, F2). PMC math is reimplemented in `ai-briefing` rather than reusing the canonical, dependency-free `calculateMetrics.ts` (F3). Plans import/generate duplicate session-mapping logic and UI patterns as full parallel copies rather than shared code (F7). No unnecessary direct-Supabase-instead-of-context reads were found — remaining direct `supabase.from(...)` calls outside contexts are legitimate writes/bulk-inserts contexts don't support. |
| 2 | Single-responsibility violations causing real problems | `ai-briefing`'s `Deno.serve` handler branches into two unrelated features (weekly briefing vs. race predictor narrative) in one 368-line file, contradicting CLAUDE.md's own "one responsibility per function" rule for edge functions (F8). |
| 3 | Premature/unnecessary abstraction (KISS) | None found. No factory/strategy patterns, no tier-gating scaffolding, no single-implementation abstraction layers. |
| 4 | Dependency direction / tight coupling | The raw Anthropic `fetch` call (headers, `AbortController` timeout, error handling) is inlined 4 times across 3 edge functions with zero shared helper — a concrete, cheap-to-fix seam, not speculative (F2). |
| 5 | Misleading naming | None found. `get`-prefixed functions in `WorkoutsContext`/`AnalyticsPage` are pure; `calculate*` functions don't mutate; no side-effect-hiding names identified. |

---

## 1. `checkRateLimit` is byte-identical (or near-identical) across all 5 edge functions, never extracted to `_shared/`

**Severity:** Medium
**Evidence:**
- `supabase/functions/ai-briefing/index.ts:64-79`:
  ```ts
  async function checkRateLimit(
    supabase: SupabaseClient, userId: string, functionName: string, limit: number,
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('api_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('function_name', functionName)
      .gte('called_at', windowStart)
    if ((count ?? 0) >= limit) return false
    await supabase.from('api_rate_limits').insert({ user_id: userId, function_name: functionName })
    return true
  }
  ```
- Identical (4-parameter) copy in `supabase/functions/strava-auth/index.ts:11-26` and
  `supabase/functions/strava-sync/index.ts:11-26`.
- A second variant — same query/insert body, but with `functionName`/`limit` hardcoded as closures
  instead of parameters — in `supabase/functions/parse-plan/index.ts:43-53` and
  `supabase/functions/generate-plan/index.ts:44-53`.
- All 5 functions also independently redeclare `RATE_WINDOW_MS = 60 * 60 * 1000`.

**Why it matters:** This is exactly the case CLAUDE.md's DRY section calls out: "Shared edge
function logic goes in `supabase/functions/_shared/` — check there before duplicating ... CORS
headers, auth checks, or other cross-function logic in a new edge function." CORS *did* get this
treatment (`_shared/cors.ts`, imported everywhere); rate-limiting didn't, despite being added
after CORS and following the same per-user/per-function pattern documented in CLAUDE.md's
"Production hardening" section. Five independent copies means a future fix (e.g. switching from
`called_at` window-counting to a token bucket, or fixing a race condition in the
check-then-insert) has to be applied five times, and nothing stops a sixth edge function from
adding a sixth copy.
**Fix:** Move `checkRateLimit(supabase, userId, functionName, limit)` (the 4-parameter version) into
`supabase/functions/_shared/rateLimit.ts`, alongside `RATE_WINDOW_MS`. Update `parse-plan` and
`generate-plan` to call it with explicit `functionName`/`limit` arguments instead of the
closure-based 2-parameter variant (trivial — they already have `RATE_LIMIT` and the function name
as constants).
**Effort:** S

---

## 2. The raw Anthropic `fetch` call is copy-pasted 4 times across 3 edge functions

**Severity:** Medium
**Evidence:**
- `supabase/functions/ai-briefing/index.ts:154-176` (race predictor branch) and
  `supabase/functions/ai-briefing/index.ts:305-320` (weekly briefing branch) — two copies in the
  *same file*.
- `supabase/functions/parse-plan/index.ts:178-199`, `supabase/functions/generate-plan/index.ts:228-249`.
- All 4 sites are structurally identical: read `ANTHROPIC_API_KEY`, build an `AbortController` with
  a 30s timeout, `fetch('https://api.anthropic.com/v1/messages', { headers: { 'x-api-key':
  apiKey, 'anthropic-version': '2023-06-01', ... }, body: JSON.stringify({ model:
  'claude-sonnet-4-6', max_tokens: N, messages: [...] }) })`, `clearTimeout`, check `aiRes.ok`,
  log `[fn-name] Anthropic error: ...`, throw `'AI service error'` on failure, then
  `aiData.content?.[0]?.text?.trim()`. Only `max_tokens` and the prompt text vary.
**Why it matters:** This is the concrete, non-speculative coupling case the audit asked about —
not "what if we swap providers" but "the exact same 18-line block, including the 30s timeout
value and the error-log prefix pattern, is maintained independently in 4 places today." Any fix
that touches this pattern (e.g. CLAUDE.md's own "Production hardening" note that added the 30s
timeout after the fact) has to be reapplied by hand to every call site, and did visibly miss one:
`generate-plan` uses `max_tokens: 8000` while `parse-plan` still uses `8192` — a small numeric
drift that's a symptom of there being no single place this constant lives.
**Fix:** Add `supabase/functions/_shared/anthropic.ts` exporting a single
`callClaude(prompt: string, maxTokens: number): Promise<string>` that owns the API key read,
timeout, headers, error handling, and response extraction. All 4 call sites pass their existing
prompt string and `max_tokens` value; the per-call system-prompt/user-prompt text itself stays in
each function, only the transport boilerplate moves.
**Effort:** M

---

## 3. `ai-briefing` reimplements the canonical PMC engine instead of reusing `src/lib/calculateMetrics.ts`

**Severity:** Medium (High if the two implementations are ever allowed to drift)
**Evidence:** `supabase/functions/ai-briefing/index.ts:14-16, 31-60`:
```ts
// ─── PMC constants (mirrors src/lib/calculateMetrics.ts) ─────────────────────
const CTL_K = 1 - Math.exp(-1 / 42)
const ATL_K = 1 - Math.exp(-1 / 7)
...
function calculateCTLATL(workouts: Workout[], today: Date): { ctl: number; atl: number; tsb: number } {
  ...
  ctl = ctl + CTL_K * (tss - ctl)
  atl = atl + ATL_K * (tss - atl)
  ...
}
```
compared to `src/lib/calculateMetrics.ts:5-6, 66-94` (`runPMC`) — same constants, same warmup
logic, same day-by-day loop, same rounding, hand-copied line for line, with the comment on line 14
explicitly acknowledging it's a copy that has to be kept in sync by hand.
**Why it matters:** CLAUDE.md states as an explicit rule: "`calculateMetrics.ts` ... is the
**canonical** CTL/ATL/TSB engine — never reimplement fitness math elsewhere, even partially, even
for a 'quick' chart." `ai-briefing` is the one place in the codebase this rule is broken, and it's
broken for a real feature (the weekly briefing's fitness/fatigue narrative), not a throwaway
chart. Because `calculateMetrics.ts` has zero runtime dependencies (only a type-only import of
`Workout` from `../types`, which itself has zero imports — confirmed via `grep '^import'
src/types/index.ts` returning nothing), there's no technical reason this needs a Deno-side copy:
Deno resolves relative `.ts` imports natively, exactly like this project already does for
`../_shared/cors.ts`. If the frontend PMC engine's warmup or rounding logic ever changes (e.g. to
fix a bug), the edge function's briefing will silently start disagreeing with the
Dashboard/Analytics/Calendar CTL/ATL/TSB numbers the user sees three seconds later on the same
page — precisely the "numbers quietly drift out of sync" scenario CLAUDE.md's DRY section warns
about for exactly this engine.
**Fix:** Replace `supabase/functions/ai-briefing/index.ts:14-16,18-20,31-60` with
`import { calculatePMC } from '../../../src/lib/calculateMetrics.ts'` (Deno supports the relative
`.ts` path directly, same pattern already used for `_shared/cors.ts`) and call
`calculatePMC(workouts, today, today).current` in place of `calculateCTLATL(workouts, today)`.
**Effort:** S

---

## 4. Heart-rate zone percentage thresholds (65/75/82/89%) are hand-copied in 3 places

**Severity:** Low-Medium
**Evidence:**
- `src/components/ProfileSettingsModal.tsx:36-41` (`calcHRZones`, used to populate
  `training_zones` on Profile Settings save):
  ```ts
  const z1Max = Math.round(maxHrVal * 0.65)
  const z2Max = Math.round(maxHrVal * 0.75)
  const z3Max = Math.round(maxHrVal * 0.82)
  const z4Max = Math.round(maxHrVal * 0.89)
  ```
- `src/components/analytics/AnalyticsPage.tsx:55-58` (`DEFAULT_HR_BOUNDARIES`, fallback
  220-35 estimate) — identical four lines.
- `src/components/analytics/AnalyticsPage.tsx:432-435` (`activeBoundaries`, from
  `profile.max_hr`) — identical four lines *again*, in the same file as the block above.
**Why it matters:** CLAUDE.md's own feature description for HR zones ("zones Z1–Z5 from
profile.max_hr; falls back to 220–35 estimate") and its DRY rule ("Don't duplicate zone/threshold
math ... if it's not already in `lib/`, that's a sign it should be extracted there now") both
point at this directly. The three copies currently agree, but nothing enforces that: a future
change to zone boundaries (e.g. matching a different HR zone model) made in
`ProfileSettingsModal.tsx` — the place a developer would naturally reach for since it's the
"settings" file — would silently leave both `AnalyticsPage.tsx` copies on the old percentages,
producing a Profile Settings zone table that disagrees with the Analytics HR zone donut for the
same athlete.
**Fix:** Extract `calcHRZonesFromMaxHR(maxHr: number): { z1Max, z2Max, z3Max, z4Max }` (or the
full boundary array shape `AnalyticsPage` wants) into `src/lib/zones.ts` (new file, justified —
this is exactly the "not already in `lib/`" case CLAUDE.md flags). Have `ProfileSettingsModal`'s
`calcHRZones` and both `AnalyticsPage` boundary calculations call it.
**Effort:** S

---

## 5. `paceToSeconds`/pace-formatting reimplemented 3 times outside `src/lib/tss.ts` — and one copy has already diverged

**Severity:** Medium
**Evidence:**
- Canonical: `src/lib/tss.ts:3-16`:
  ```ts
  export function paceToSeconds(pace: string): number {
    const parts = pace.split(':')
    if (parts.length !== 2) return 0
    const mins = parseInt(parts[0]) || 0
    const secs = parseInt(parts[1]) || 0
    return mins * 60 + secs
  }
  export function secsToPaceStr(secs: number): string {
    if (!secs || secs <= 0) return ''
    const m = Math.floor(secs / 60)
    const s = Math.round(secs % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  ```
  Already correctly imported and reused by `src/components/LogWorkoutModal.tsx:8`.
- Reimplemented, functionally identical, in `src/components/WorkoutDetailModal.tsx:143-151`.
- Reimplemented **and diverged** in `src/components/ProfileSettingsModal.tsx:50-61`:
  ```ts
  function paceToSeconds(pace: string): number | null {
    if (!pace || !pace.includes(':')) return null
    const [min, sec] = pace.split(':').map(Number)
    if (isNaN(min) || isNaN(sec)) return null
    return min * 60 + sec
  }
  ```
  This version returns `number | null` (the canonical version returns `number`, using `0` as the
  invalid sentinel) and parses with `Number()` + `isNaN` instead of `parseInt() || 0` — a
  malformed pace string like `"5:"` or `"abc:30"` produces different results (`NaN`/`null`
  handling paths) between the two implementations depending on which file happens to process it.
**Why it matters:** Three implementations of the same conversion, one with a different type
signature and different edge-case behavior, is the concrete "divergence" risk CLAUDE.md's DRY
section is trying to prevent generally for this exact category ("date/pace/duration formatting").
Today the divergence is limited to malformed-input handling (zone calc silently no-ops via `null`
vs. TSS calc treating it as 0 pace), but it means a bug fix to pace parsing made in one file
doesn't propagate to the other two.
**Fix:** Delete the local `paceToSeconds`/`secondsToPace` in `ProfileSettingsModal.tsx:50-61` and
`paceToSeconds`/`secsToPaceStr` in `WorkoutDetailModal.tsx:143-151`; import `paceToSeconds` /
`secsToPaceStr` from `src/lib/tss.ts` in both. If `ProfileSettingsModal`'s null-return semantics
for invalid input are actually needed (its call sites do `if (!T) return null` to skip rendering
zones), wrap the shared import at the call site (`const T = paceToSeconds(pace) || null`) rather
than keeping a second implementation.
**Effort:** S

---

## 6. `localDateKey` and `formatDuration` are copy-pasted across 6-7 files with no shared `lib/date.ts`

**Severity:** Low
**Evidence:**
- `localDateKey` — byte-identical `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` `` body in:
  `src/lib/calculateMetrics.ts:27-29`, `src/contexts/WorkoutsContext.tsx:100-101`,
  `src/components/calendar/CalendarGrid.tsx:36-38`, `src/components/calendar/WeeklySummary.tsx:13-15`,
  `src/components/analytics/AnalyticsPage.tsx:70-72`, `src/pages/Dashboard.tsx:16-18`, and again in
  `supabase/functions/ai-briefing/index.ts:18-20`.
- `formatDuration` — same h/m-splitting logic, but with a **divergent fallback string** for
  falsy/zero minutes: `''` in `CalendarGrid.tsx:40-46`, `'0m'` in `WeeklySummary.tsx:17-23`, `'—'`
  in `Dashboard.tsx:20-26` and `WorkoutDetailModal.tsx:259-265` (which also uses `"${m} min"` for
  the minutes-only case instead of the other three files' `"${m}m"`).
**Why it matters:** `localDateKey` is low-risk since all 7 copies are still identical — pure
duplication, no drift yet, but zero reason for a developer touching one of these files to know
the other six exist. `formatDuration`'s fallback-string divergence is already user-visible: the
same "0 minutes" workout renders as blank in the month calendar, `"0m"` in the weekly summary
strip, and `"—"` on the Dashboard/detail modal — a minor but real inconsistency a design review
would catch as "why does this look different in three places."
**Fix:** Add `src/lib/date.ts` (or fold into `calculateMetrics.ts` if kept small) exporting
`localDateKey(d: Date): string`; have `WorkoutsContext.tsx`, `CalendarGrid.tsx`,
`WeeklySummary.tsx`, `AnalyticsPage.tsx`, and `Dashboard.tsx` import it instead of redeclaring it
(`calculateMetrics.ts`'s copy stays or re-exports, since it's already the canonical PMC file; the
edge-function copy is addressed by F3's fix, which pulls in `calculateMetrics.ts` wholesale). For
`formatDuration`, pick one canonical fallback (`'—'` matches the Dashboard/detail-modal pattern
used for other "no data" values elsewhere) and export it from the same file; update the 4 call
sites.
**Effort:** S

---

## 7. Plans import and AI-generate pipelines duplicate both their session-mapping logic and their review UI as full parallel copies

**Severity:** Medium
**Evidence — session mapping (frontend):**
- `src/components/plans/ImportModal.tsx:35-41` (`formatDisplayDate`), `:44-46` (`toSessionSport`),
  `:48-57` (`interface EdgeSession`), `:59-71` (`mapEdgeSessions`).
- `src/components/plans/GeneratePlanModal.tsx:38-40` (`toSessionSport`), `:42-48`
  (`formatDisplayDate`), `:49-59` (`interface EdgeSession`, one extra `description` field), `:61-74`
  (`mapEdgeSessions`) — all four are the same logic, reordered, with the interface widened by one
  field.

**Evidence — date resolution (backend):**
- `supabase/functions/parse-plan/index.ts:14-26` (`DAY_OFFSETS` + `resolveDate`) and
  `supabase/functions/generate-plan/index.ts:15-26` — identical `DAY_OFFSETS` map and identical
  `resolveDate(startDate, week, dayOfWeek)` implementation, each maintained independently in the
  two edge functions that both turn `(week, day_of_week)` pairs into calendar dates for
  `training_sessions`/`workouts`.

**Evidence — review UI (frontend):**
- `src/components/plans/ImportReviewScreen.tsx:5-8` (`SPORT_LABELS`) and `:10-17` (`SPORT_TABS`)
  vs. `src/components/plans/PlanCard.tsx:8-11` (`SPORT_LABELS`) and `:13-19` (`SPORT_TABS`) —
  identical constant objects.
- The sport-filter-tab rendering block (`ImportReviewScreen.tsx:105-141`) and the week-grouped,
  collapsible session-row rendering (`ImportReviewScreen.tsx:170-267` roughly, filter →
  week-group → toggle-open → sport-color-dot row) are structurally re-implemented, not shared,
  inside `PlanCard.tsx`'s `PlanSessionsView` component (`PlanCard.tsx:71-260` roughly) — same
  tab/filter/week-toggle/sport-dot pattern, different padding/border-radius constants and prop
  wiring (`ImportReviewScreen` takes filter/expand state as props from its parent; `PlanCard`
  owns the same state locally in `PlanSessionsView`).

**Why it matters:** CLAUDE.md explicitly describes this pattern as already shared ("The Plans
review screen and Plans sessions list already share a pattern intentionally — follow that
precedent rather than diverging"), and the DRY rules say to extract a shared component "if the
same UI pattern shows up in two places." In practice it shows up in **four** places (2 UI, 2 data
mapping) as four independent implementations that happen to still agree. `GeneratePlanModal`'s
`EdgeSession`/`mapEdgeSessions` already diverged by one field (`description`) from `ImportModal`'s,
which is exactly how this class of duplication starts drifting — a future conflict-detection or
session-shape change applied to the import path (parse-plan) has no reason to also land on the
generate path (generate-plan), or vice versa, and a reviewer has to know to check both.
**Fix:**
- Move `toSessionSport`, `formatDisplayDate`, and a widened `EdgeSession`/`mapEdgeSessions` (union
  of both current shapes, `description` optional) into a new `src/components/plans/shared.ts`;
  import from both `ImportModal.tsx` and `GeneratePlanModal.tsx`.
- Move `DAY_OFFSETS` + `resolveDate` into `supabase/functions/_shared/planDates.ts`; import from
  both `parse-plan` and `generate-plan`.
- Extract the sport-tab-row + week-collapsible-list JSX into a shared
  `src/components/plans/SessionsList.tsx` component parameterized on the session shape (both
  `ParsedSession` and the DB `TrainingSession` type already share `week`/`sport`/`title`/duration
  fields), taking `sportFilter`/`openWeeks`/`onToggle` as props either way — `ImportReviewScreen`
  already receives this state as props, so `PlanCard`'s `PlanSessionsView` just needs to lift its
  local `useState` into the same shape and render the shared component instead of its own copy.
**Effort:** M

---

## 8. `ai-briefing` folds an unrelated feature (race predictor narrative) into one function, against the project's own edge-function rule

**Severity:** Low-Medium
**Evidence:** `supabase/functions/ai-briefing/index.ts:82-186` — the single `Deno.serve` handler
does shared auth/CORS setup, then:
```ts
// ── Race predictor mode ──────────────────────────────────────────────────
if (mode === 'race_predictor') {
  const allowed = await checkRateLimit(supabase, user.id, 'ai-briefing-predictor', PREDICTOR_RATE_LIMIT)
  ...
  return new Response(JSON.stringify({ narrative }), ...)
}

// Check for a cached briefing from the last 24 hours (unless force)
if (!force) { ... }
```
followed by ~180 more lines (188-368) of the actual weekly-briefing flow: cache lookup, PMC calc
(F3), prompt building from race goal/CTL trend, `ai_briefings` insert-with-pruning. The two
branches share only the auth/CORS preamble and the `checkRateLimit`/Anthropic-call machinery
(F1/F2) — no business logic in common. `RATE_WINDOW_MS`, `BRIEFING_RATE_LIMIT`, and
`PREDICTOR_RATE_LIMIT` all live at file scope (`:10-12`) even though only one applies per branch.
**Why it matters:** CLAUDE.md's edge-function rules state directly: "One responsibility per
function — don't fold unrelated behaviour into `ai-briefing`, `generate-plan`, `parse-plan`,
`strava-auth`, or `strava-sync` instead of adding a focused new function." `ai-briefing` is named
first in that list, and the race predictor mode is the one place this rule is violated in the
shipped codebase — CLAUDE.md's own feature log confirms it was a deliberate choice ("AI narrative
calls edge function with `mode: 'race_predictor'` ... Edge function `race_predictor` mode returns
`{ narrative }` directly without saving to `ai_briefings`"), not an oversight, but it still means
the file mixes two independent rate limits, two independent Anthropic prompts, and two unrelated
response shapes in one 368-line handler — a bug fix to the briefing cache logic requires reading
past the entire race-predictor branch to get there, and a future third mode (there's already a
`mode` string dispatch, so this is the obvious place a developer would add one) would compound it.
**Fix:** Extract the `mode === 'race_predictor'` branch (`:122-186`) into a new
`supabase/functions/race-predictor/index.ts` edge function, deployed with `--no-verify-jwt` like
the others, reusing the auth-check pattern and the shared rate-limit/Anthropic helpers from F1/F2.
Update `RacePredictor.tsx`'s fetch call (`src/components/ai/RacePredictor.tsx`) to point at the
new function URL. `ai-briefing` shrinks back to its one stated responsibility.
**Effort:** M

---

## Priority order

1. **F5** (Medium) — dedupe `paceToSeconds`/pace formatting into `src/lib/tss.ts`; the only
   finding here with a confirmed live behavioral divergence between copies.
2. **F3** (Medium, High if left alone) — point `ai-briefing` at the canonical
   `calculateMetrics.ts` instead of its hand-copied PMC loop; cheapest fix in the report (one
   import swap) for the highest drift risk (CTL/ATL/TSB disagreeing across the app is the thing
   CLAUDE.md's PMC section exists to prevent).
3. **F7** (Medium) — consolidate Plans import/generate session-mapping + review UI; already has
   one confirmed field-level divergence (`description`).
4. **F2** (Medium) — extract the shared Anthropic `fetch` helper; already has one confirmed
   numeric drift (`max_tokens: 8192` vs `8000`).
5. **F1** (Medium) — extract `checkRateLimit` to `_shared/rateLimit.ts`.
6. **F4** (Low-Medium) — extract HR zone threshold math to `src/lib/zones.ts`.
7. **F8** (Low-Medium) — split race predictor out of `ai-briefing` into its own edge function.
8. **F6** (Low) — extract `localDateKey`/`formatDuration` to a shared date/format util.
