# Vexr — Testing Review

Assessment of actual test coverage and quality (not just presence of test files): suite
execution, coverage numbers, Supabase mock fidelity, `calculateMetrics.ts` rigor, edge function
coverage, implementation-detail smells, and the three highest-risk untested code paths. Findings
use: **Severity** (Blocker/High/Medium/Low) · **Evidence** · **Why it matters** · **Fix** ·
**Effort** (S/M/L).

---

## Summary

The suite is real and green: **275 tests across 27 files, all passing**, running in ~5s. The one
genuinely excellent piece of testing in the repo is `calculateMetrics.ts` (the PMC/CTL/ATL/TSB
engine) — it's covered with known-correct inputs and the edge cases that actually matter (empty
history, single workout, rest-period decay, planned-workout exclusion). That's the bar the rest of
the repo should be held to, and mostly isn't.

Two findings dominate everything else:

**F1 (High):** The edge functions are almost entirely untested. Two of five functions
(`generate-plan`, `parse-plan`) have **zero tests of any kind** — not even the pure-logic
duplication pattern used elsewhere — despite containing input validation, rate limiting, date-math
that determines what dates land on a user's calendar, and (in `parse-plan`) the conflict-detection
logic that decides whether an imported plan collides with existing workouts. `strava-auth` (OAuth
token exchange) also has zero tests. The two functions that do have tests (`ai-briefing`,
`strava-sync`) are tested via **hand-duplicated copies** of their pure-math helpers, not the actual
deployed code — the test file comments admit this openly. Combined with Module 3/4's findings on
edge-function risk, this is the single biggest coverage gap in the repo.

**F2 (Medium):** The dedicated chainable Supabase mock at `src/test/mocks/supabase.ts` — documented
in `CLAUDE.md` as *the* canonical mock and described in the review brief as "the chainable Supabase
mock" — **is never imported by any test file**. It's dead code. Every test that needs a Supabase
mock hand-rolls its own ad hoc `vi.hoisted()` mock instead, in direct contradiction of the
project's own stated convention ("Don't hand-roll a new ad hoc mock"). Since it's unused, its own
fidelity to real Postgrest behavior is moot for current risk — but the ad hoc mocks that replaced it
share its core weakness: none of them enforce RLS, reject malformed filters, or validate that a
required filter (e.g. `user_id` scoping) was actually applied. A test can pass against these mocks
in a state the real Supabase client would reject or scope differently.

No Blocker-severity finding — nothing here is actively broken — but the coverage gaps mean real
regressions in AI-plan generation, Strava auth, and race-time predictions would currently ship
undetected.

---

## 1. Test suite run and coverage

```
npx vitest run --coverage
```

**Result:** 27 test files passed (27), **275 tests passed (275)**, 0 failed. Duration ~5s.

Coverage tooling exists (`@vitest/coverage-v8`, configured in `vite.config.ts`, provider `v8`).
Overall numbers:

| Metric | Coverage |
|---|---|
| Statements | 58.24% (1021/1753) |
| Branches | 44.00% (650/1477) |
| Functions | 47.11% (245/520) |
| Lines | 62.89% (934/1485) |

By directory, the pattern is exactly what you'd expect from a repo that tests logic well and UI
shells poorly:

| Area | Stmts % | Notes |
|---|---|---|
| `src/lib` | 95.12% | `calculateMetrics.ts` and `tss.ts` — the actual business logic |
| `src/contexts` | 73.93% | Context providers, decent |
| `src/components/layout`, `plans`, `calendar`, `ai` | 71–100% | Mixed |
| `src/pages` | 53.93% | Dragged down by `Nutrition.tsx` (35.51%), `Calendar.tsx` (41.02%), `Dashboard.tsx` (48.70%) |
| `src/components` (root, e.g. modals) | 5.52% | `WorkoutDetailModal.tsx` 2.40%, `DayWorkoutsModal.tsx` 3.84% |
| `supabase/functions/_shared` | 90.9% | Only file in `supabase/functions/**` that appears in the report at all |

**Methodology caveat worth flagging on its own:** `vite.config.ts`'s coverage block doesn't set
`all: true`, so v8 only reports files that were actually `import`ed during the test run — files
never touched by any test don't appear as 0% rows, they simply don't appear. This means the
headline 58% number is flattering: `generate-plan/index.ts`, `parse-plan/index.ts`,
`strava-auth/index.ts`, and `strava-sync/index.ts` (1441 combined lines) contribute **nothing** to
either the numerator or denominator above. Real effective coverage of the codebase including those
files is meaningfully lower than 58%. Recommend adding `coverage.all: true` so the report is honest
about what's untouched — it'll make the number look worse, but a lower true number beats a flattering
false one.

**Effort:** S (one-line config change; will surface a lot of 0% rows, which is the point).

---

## 2. Supabase mock fidelity

### F2 — The documented chainable mock is unused; every test hand-rolls its own, none enforce RLS or filter shape
**Severity:** Medium
**Evidence:**
- `src/test/mocks/supabase.ts` exports `mockFrom`, `mockSupabase`, `mockChannel`, `mockSupabaseAuth`
  and self-registers via `vi.mock('../../lib/supabase', ...)` at module scope.
- `grep -rl "mocks/supabase" src` returns **zero results** — no test file imports it.
- Instead, 9 test files (`ProfileContext`, `WorkoutsContext`, `StravaContext`, `Dashboard`,
  `Nutrition`, `Plans`, `Library`, `PlanCard`, `RacePredictor`, others) each independently declare
  their own `vi.hoisted()` mock of `../../lib/supabase`, with slightly different shapes each time
  (e.g. `WorkoutsContext.test.tsx:25-36` builds a `from()` mock with distinct `insert`/`update`/
  `delete` chains; `ProfileContext.test.tsx:29-37` builds a different one with only
  `select/eq/single/update`).
- `CLAUDE.md`'s own Testing section says: *"Do not mock the Supabase client at the module level
  across all tests — set up `mockFrom.mockReturnValue(chain)` per test for precise control"* and
  *"Use the existing Supabase mock... configure `mockFrom.mockReturnValue(chain)` per test rather
  than hand-rolling a new ad hoc mock."* — the actual test suite does the opposite of the second
  instruction in every single context/page test.
- Whichever mock shape is used (the unused shared one, or any of the ad hoc ones), the same
  structural gap exists: `.eq()`, `.match()`, `.select()`, `.order()`, etc. all just
  `mockReturnThis()` or return the proxy — **no mock checks what column/value was filtered on, no
  mock rejects a malformed filter, and no mock enforces row ownership.** A test configuring
  `mockFrom.mockReturnValue({ ..., select: vi.fn().mockResolvedValue({ data: allUsersRows, error:
  null }) })` will pass regardless of whether the code under test actually called
  `.eq('user_id', user.id)` before `.select()` — the real Supabase client would return only that
  user's rows (via RLS) or reject the query shape; the mock returns whatever canned `data` the test
  author typed in, unconditionally.
- Concretely visible in `WorkoutsContext.test.tsx:117-127`: the test is named *"calls insert with
  the workout payload and user_id"* but the only assertion is
  `expect(mockFromImpl).toHaveBeenCalledWith('workouts')` — it never inspects the actual payload
  passed to `.insert()`, so if `WorkoutsContext.tsx` stopped setting `user_id` on the insert payload
  (which would make the real insert fail a `NOT NULL`/RLS `WITH CHECK` in Postgres), this test would
  keep passing.
**Why it matters:** This is exactly the failure mode the review brief asked about: a test can pass
against the mock while the real query would fail or return different data. Because the mock
doesn't model RLS scoping or malformed-filter rejection, a regression that drops a `.eq('user_id',
...)` filter — the single most security-relevant line in any Supabase query in this app — would not
be caught by any current test. Module 3's RLS review found the *database* policies are sound; this
finding is the reason a *client-side* regression that accidentally broadens a query wouldn't be
caught before it reached production, where RLS would then either silently return nothing (breaking
the feature) or, if the affected table's policy were ever weakened, leak cross-user data with no
test signal either way.
**Fix:** Two independent fixes: (1) Either start using `src/test/mocks/supabase.ts` for real, or
delete it — a documented-but-unused mock is worse than no mock, since it misleads anyone reading
`CLAUDE.md` about how the suite actually works. (2) Upgrade whichever mock becomes canonical so
`.eq()`/`.match()` record their arguments on the builder instance (not just via a separate
`toHaveBeenCalledWith` on `mockFrom`), and add at least one test per context that asserts the
`user_id`/`id` filter was actually applied to reads and the `user_id` field was actually present on
writes — turning the current table-name-only assertions into real payload/filter assertions.
**Effort:** M

---

## 3. `calculateMetrics.ts` — the PMC engine

This is the standout of the test suite and matches the rigor the review brief asked for.

`src/lib/__tests__/calculateMetrics.test.ts` (131 lines) covers `buildTssByDay` and `calculatePMC`
with known-correct inputs/outputs and the edge cases that matter for an EWMA-based fitness model:

| Case | Covered? | Test |
|---|---|---|
| Empty workout history | Yes | `'returns zeros for no workouts'` — asserts `{ctl:0,atl:0,tsb:0}` and `history: []` |
| Single workout | Yes | `'ATL reacts faster than CTL to a high-TSS day'` — single 300-TSS workout, asserts ATL > CTL |
| Gaps in data / long rest period | Yes | `'CTL and ATL converge toward 0 after a long rest period'` — one workout, checked 6 months later, asserts CTL < 1 and ATL === 0 (decay correctness) |
| Multiple workouts same day | Yes (via `buildTssByDay`) | `'sums multiple workouts on the same day'` |
| Planned workouts excluded | Yes | `'excludes planned workouts'` (both `buildTssByDay` and `calculatePMC` level) — asserts a 9999-TSS planned workout has **zero** effect on output |
| Date string with time component | Yes | `'strips time component from date strings'` |
| Null/undefined TSS | Yes | `'treats null/undefined TSS as 0'` |
| Invariant: TSB = CTL − ATL | Yes | `'TSB always equals CTL minus ATL'`, checked both on `current` and across every entry in `history` |
| History window spans correctly | Yes | `'history array spans from windowStart to today'` — asserts exact array length (31) and first/last dates |

Every assertion uses hand-computable or invariant-based expected values rather than re-deriving the
formula in the test (e.g. asserting `ATL > CTL` from the known time-constant difference, rather than
just re-running the same math and comparing) — this is the right style, since it would actually
catch a broken formula rather than just a broken *copy* of the formula.

`src/lib/tss.ts` (the TSS-from-workout-inputs calculator, used by the Log Workout modal and the
structured workout builder) is similarly well covered by `tss.test.ts`: run/ride/swim/strength IF²
math, missing-input-returns-0 cases, structured-block reps/duration multiplication, and a
sum-decomposition invariant test. Minor gap: no test for negative or wildly out-of-range inputs
(negative duration, FTP=0 with power>0 division edge, pace strings like `"0:00"`), but these are
low-severity since the UI constrains these inputs before they reach the calculator.

**No finding here — this file meets the bar the rest of the repo should be held to.**

---

## 4. Edge function test coverage

### F1 — `generate-plan`, `parse-plan`, and `strava-auth` have zero tests; `ai-briefing` and `strava-sync` are tested via hand-duplicated logic, not the real deployed code
**Severity:** High
**Evidence:**
- `supabase/functions/` line counts vs. test coverage:

  | Function | Lines | Test file | What's actually tested |
  |---|---|---|---|
  | `_shared/cors.ts` | shared | `edge-helpers/cors.test.ts` (74 lines) | **Real file, imported directly** (`import { parseAllowedOrigins, getCorsHeaders } from '../../../supabase/functions/_shared/cors'`) — the one genuine edge-function test in the repo |
  | `ai-briefing/index.ts` | 368 | `edge-helpers/aiBriefing.test.ts` (136 lines) | Pruning logic and CTL/ATL math **copy-pasted into the test file**, not imported. Header comment: *"These functions are duplicated here (not imported) because the edge function uses Deno globals."* Auth check, rate limiting, Anthropic API call, request parsing, DB writes: **untested** |
  | `strava-sync/index.ts` | 322 | `edge-helpers/stravaSync.test.ts` (183 lines) | Same pattern — `mapStravaType` and `estimateTSS` duplicated and tested in isolation. Auth, rate limiting, Strava API pagination, dedup-by-`strava_activity_id`, DB writes: **untested** |
  | `generate-plan/index.ts` | 325 | none | **Zero tests.** Auth, rate limiting, input validation (sport/date/level checks), week-bucketing math (`baseWeeks`/`buildWeeks`/`taperWeeks` from `totalWeeks`), `resolveDate`, Anthropic call, response parsing, DB writes: **all untested** |
  | `parse-plan/index.ts` | 277 | none | **Zero tests.** Same categories, plus the **conflict-detection logic** (`parse-plan/index.ts:239-249`) that flags `has_conflict` against existing workouts by date — this is the exact algorithm the Plans import review screen displays to the user, and it has no test coverage at any level |
  | `strava-auth/index.ts` | 149 | none | **Zero tests.** OAuth code-for-token exchange, rate limiting: untested |

- The "duplicated logic" pattern used for `ai-briefing`/`strava-sync` is explicitly a workaround for
  Deno globals blocking import into the Vitest/jsdom (Node) environment — a real constraint, not
  laziness — but it means these tests validate that a **hand-maintained copy** of the formula is
  correct, not that the deployed function is. If someone edits the real
  `calculateCTLATL`-equivalent logic inside `ai-briefing/index.ts` (e.g. changing how planned
  workouts are excluded, matching a future change to the canonical `calculateMetrics.ts`) and
  forgets to mirror the edit in `aiBriefing.test.ts`, the test suite stays green while the deployed
  function's behavior has silently diverged from both its own tests and the canonical engine.
- No frontend component test (`ImportModal`, `ImportReviewScreen`, `GeneratePlanModal` — none of
  which have `__tests__/` files either) exercises the conflict-detection or plan-write path from the
  other direction, so this logic has **no test coverage from any angle**.
**Why it matters:** This directly compounds the risk Module 3/4 already flagged around edge
functions (auth pattern correctness, rate limiting as the only Anthropic-cost/Strava-quota guard).
Untested here specifically means: a broken date calculation in `resolveDate` or the week-bucketing
math could silently place an entire AI-generated training plan on the wrong weeks or days on a
user's calendar; a broken rate-limit check could either lock users out entirely or (worse, per
Module 3's `api_rate_limits` finding) fail open; and a broken conflict-detection comparison could
either falsely flag every imported session as conflicting (annoying) or **silently miss real
conflicts and double-book a user's calendar** (worse, and harder to notice after the fact). None of
these would surface in CI — they'd surface as a support request or a silently wrong training
calendar.
**Fix:** Prioritize in this order: (1) `parse-plan`'s conflict-detection function and
`resolveDate`/week-bucketing math in both `generate-plan` and `parse-plan` — extract these as pure,
Deno-global-free functions (they mostly already are, based on the code shape) into files importable
by Vitest, the same way `_shared/cors.ts` already is, rather than duplicating them into test files.
This closes the "tests a copy, not the real thing" gap for exactly the highest-value logic. (2) Add
at least request-validation-level tests (missing auth header → 401, missing required field → 400,
rate limit exceeded → 429) for `generate-plan`, `parse-plan`, and `strava-auth`, using a minimal
fetch-based harness or by extracting the validation branches into testable pure functions the same
way. (3) Longer term, consider whether the "duplicate the logic into the test file" pattern for
`ai-briefing`/`strava-sync` can be replaced by extracting those pure functions into
Deno-global-free modules too, so the tests import the real code like `cors.test.ts` already does.
**Effort:** M for (1)+(2), L if extending to full extraction across all five functions.

---

## 5. Tests asserting implementation details over behavior

Grep for `toHaveBeenCalledWith` / `.mock.calls` across test files turns up 8 files, ~15 call sites.
Most are fine (asserting the credentials passed to `supabase.auth.signInWithPassword` in
`useAuth.test.ts` is really asserting *behavior* — that's the whole job of that function). Two
stand out as testing the mock's internals rather than observable behavior:

- **`ProfileContext.test.tsx:64-65`** — `expect(chain.select).toHaveBeenCalledWith('*')` and
  `expect(chain.eq).toHaveBeenCalledWith('id', 'user-1')`, immediately after already asserting the
  actual observable outcome (`received` contains `mockProfile`, line 63). These two lines add
  nothing behaviorally new — they pin the exact query-builder call shape. If `ProfileContext.tsx`
  were refactored to fetch via `.match({ id: userId })` instead of `.eq('id', userId)`, or to select
  specific columns instead of `'*'`, this test would fail despite identical, correct behavior.
  **Worst offender in the repo for this pattern** — it's the only place asserting exact chained-call
  arguments on a mock that isn't otherwise the subject of the test.
- **`WorkoutsContext.test.tsx:117-127, 141-149, 160-168`** — the inverse problem: three tests named
  `'calls insert with the workout payload and user_id'` / `'calls update on the workouts table'` /
  `'calls delete on the workouts table'` promise a payload/argument check in their names but only
  assert `expect(mockFromImpl).toHaveBeenCalledWith('workouts')` — the table name, not the payload.
  This isn't quite the same failure mode (it won't break on a harmless refactor), but it's a
  misleading-test-name smell paired with the same underlying gap flagged in F2: the payload that
  matters most for correctness (`user_id` on the insert) is asserted by neither the mock nor the
  test.

Recommend: drop the two `chain.select`/`chain.eq` assertions in `ProfileContext.test.tsx:64-65`
(the behavioral assertion on line 63 already proves the fetch worked); rename or extend the
`WorkoutsContext` tests to match what they claim to check.

**Effort:** S.

---

## 6. Three highest-risk untested pieces of logic

Ranked by likelihood × visibility of a resulting user-facing bug or data issue:

1. **Race Predictor formulas (`src/components/ai/RacePredictor.tsx`, 649 lines) — zero numerical
   correctness testing.** `RacePredictor.test.tsx` (192 lines, 27 assertions) exclusively checks
   that distance labels render on the right sport tab (`expect(screen.getByText('5K'))
   .toBeInTheDocument()`, etc.) — **not one assertion checks a predicted time value.** This file
   implements four separate non-trivial formulas (Riegel for running, an FTP/IF/cube-root speed
   model for cycling, CSS/IF for swimming, and a composite triathlon model with transition times and
   a brick-run factor), each with a ±5%-capped CTL adjustment. This is the single most
   formula-dense piece of logic in the frontend, it's directly user-facing (a predicted race time is
   the kind of number a user screenshots and remembers), and a sign error, unit mixup (seconds vs.
   minutes, meters vs. km), or wrong exponent would currently ship with zero test signal — the
   suite would stay green while every triathlete using the feature sees a wrong number.

2. **`parse-plan` and `generate-plan` edge functions (602 combined lines) — zero test coverage,
   direct multi-table writes.** Covered in detail in F1 above. Ranked #2 rather than #1 because it's
   somewhat mitigated by the review screen giving users a chance to see (though not fully verify)
   the plan before confirming — but the conflict-detection logic specifically (§4) has no safety net
   at any layer, and a wrong `resolveDate` calculation silently miscalendars a multi-week training
   plan with no error shown to the user.

3. **Client-side query filter correctness across all Supabase-calling contexts/components (no test
   can currently catch a dropped `.eq('user_id', ...)`).** This is the structural risk from F2: it's
   not one file, it's a class of bug the entire mock strategy can't detect. Ranked #3 because
   Module 3 confirmed RLS is correctly configured server-side as a backstop for the read path — so
   the actual blast radius today is "feature silently returns nothing" rather than "user sees
   another user's data" for reads. But for any query that both filters *and* relies on the filtered
   subset for a write decision (e.g. duplicate-detection before an insert, or a client-side
   aggregate before deciding whether to show a warning), a dropped filter could produce a wrong
   *decision* even though RLS keeps the underlying data itself safe.

---

## Coverage caveat for this review

This review reads test files and coverage output; it does not execute the app manually or verify UI
behavior beyond what the automated suite checks. Coverage percentages come directly from
`npx vitest run --coverage` run against the current `main` working tree.
