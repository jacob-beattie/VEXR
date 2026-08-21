# Vexr — TypeScript Safety Review

Read-only review of TypeScript usage against five questions. Findings use:
**Severity** (High/Medium/Low) · **Evidence** (file:line) · **Why it matters** · **Fix** · **Effort** (S/M/L).

Verified against the live repo: `npx tsc -b --noEmit` (baseline, clean), plus one-flag-at-a-time
reruns of `tsc` with each strict flag added on top of the real `tsconfig.app.json` via a
`--extends` overlay, so the error counts below are real compiler output, not estimates.

---

## Summary

The headline finding is structural, not a pile of sloppy `any`s: **the codebase is
disciplined about explicit escape hatches (one `any` in ~130 source files, zero `@ts-ignore`/
`@ts-expect-error`, catch blocks already narrow safely) but `strict` mode itself was never turned
on**, and **the Supabase client has no generated `Database` type**, which pushes the real risk
into places `grep` for `any`/`as` won't find: implicit `any` flowing in through untyped
`fetch().json()` / `JSON.parse()` boundaries with a type annotation slapped on top that looks
like a check but isn't one.

| # | Question | Answer |
|---|----------|--------|
| 1 | `any` / `as` / `@ts-ignore` audit | 1 literal `any` (suppressed + justified), ~48 `as` assertions (mostly benign DOM/enum casts), 0 `@ts-ignore`. Real risk is in the *un-annotated* `any` from `res.json()`/`JSON.parse()` — see F1. |
| 2 | strict mode | Fully off. Turning on `strict` (all 8 sub-flags): **0 new errors**. Turning on `noUncheckedIndexedAccess`: **81 errors**, almost all false-positive noise, but it did surface one real gap (F4). |
| 3 | Supabase generated types | **Not used at all** — no `Database` generic on `createClient`, no generated types file anywhere in the repo. All shapes are hand-typed in `src/types/index.ts` with zero compiler link back to the schema. |
| 4 | Implicit-`any`-wider-than-intended returns | Two edge functions (F1) annotate a variable from `JSON.parse()` of an LLM response with zero runtime validation. |
| 5 | Exhaustiveness | No `switch` statements exist anywhere in the app. Union coverage is enforced structurally via `Record<WorkoutType, ...>` / `Record<BlockType, ...>` maps (good) except one map that isn't (F5). |

---

## 1. `any` / `unknown` / `as` / `@ts-ignore` audit

### F1 — `parse-plan` and `generate-plan` trust the shape of Claude's JSON output with zero runtime validation
**Severity:** High
**Evidence:**
- `supabase/functions/parse-plan/index.ts:210-213`:
  ```ts
  let parsed: { plan_name: string; total_weeks: number; races: Array<{ name: string; date: string }>; sessions: RawSession[] }
  try {
    parsed = JSON.parse(jsonStr)
  ```
- `supabase/functions/generate-plan/index.ts:262-265` — identical pattern.

**Why it matters:** `JSON.parse` returns `any`. Assigning it to a variable with a type
*annotation* (rather than an explicit `as X` cast) is the same unchecked-cast problem as `as`,
except it's invisible to a `grep -n "as "` sweep and reads like a real type check to anyone
skimming the code. The only validation that happens is a `try/catch` around whether the string
parses as *some* JSON at all — nothing checks that `sessions` is an array, that each session has
`week`/`day_of_week`/`duration_minutes` in the right shape, or that `races[0].date` is a real
date string. This is fed by an LLM (`claude-sonnet-4-6`) whose output format is a prompt
convention, not a contract — a slightly-off response (missing field, `week` as a string instead
of a number, `sessions` omitted when the model decides to explain itself first) parses as valid
JSON and then silently produces `undefined`s that flow into `resolveDate()`, conflict detection,
and eventually into `training_sessions`/`workouts` inserts — a user-facing plan import that's
subtly wrong (missing sessions, wrong week numbers) rather than a clean error.
**Fix:** Add a minimal runtime shape check before trusting `parsed` — even a handful of
`typeof`/`Array.isArray` guards on `sessions`, `week`, `sport`, `duration_minutes` (mirroring the
already-careful pattern used in `strava-sync/index.ts:208-247`, which casts to
`Record<string, unknown>[]` and then does `typeof a.x === 'number'` checks before use — that's
the right model to copy here). Doesn't need a full schema library; the existing `RawSession`
interface already documents the expected shape, just nothing enforces it at the boundary.
**Effort:** M

### F2 — Edge function request bodies are cast from `any` without validating types, only presence
**Severity:** Medium
**Evidence:**
- `supabase/functions/generate-plan/index.ts:94-108` — `const { sport, raceDistance, ... } = body as { sport: string; ...; preferredDays?: string[]; ...; athleteProfile: { ctl: number; ftp?: number; ... } }`, followed only by `if (!sport || !raceDistance || !raceDate || !startDate)` (truthy/presence checks, not type checks).
- `supabase/functions/parse-plan/index.ts:93-100` — same pattern; only `typeof content !== 'string'` is actually type-checked, the rest (`contentType`, `startDate`, `raceDate`) are not.
- `supabase/functions/strava-auth/index.ts:37-38` — `const body = await req.json(); const { code } = body` — no cast, no interface at all; `code` is bare `any` for the rest of the function.

**Why it matters:** These are the actual network trust boundary (client → edge function), the
one place in the codebase where "unknown until proven otherwise" is the correct default. A
malformed request — `preferredDays` sent as a string instead of `string[]`, `athleteProfile.ctl`
sent as a string from a stale/buggy frontend build — passes every existing check and gets used
directly in string interpolation building the Claude prompt (`generate-plan/index.ts`), which
degrades to a confusing/wrong generated plan rather than a clean 400. Lower risk than F1 because
these functions are only ever called from this project's own frontend today, but it's the same
class of hole and will matter more if any other client ever calls these functions directly.
**Fix:** Not urgent to add a schema library, but worth at least typing `code`/`content`/etc. as
`unknown` at the destructure and narrowing with `typeof` before use, consistent with how
`strava-sync` already treats external data.
**Effort:** S

### F3 — The one literal `any` is already fixed correctly — not a finding, but worth noting as the pattern to keep
**Severity:** N/A (positive)
**Evidence:** `src/pages/Plans.tsx:24-29`:
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(data as any[]).map(p => ({
  ...p,
  total_sessions: (p.training_sessions?.[0]?.count as number) ?? 0,
  training_sessions: undefined,
})) as TrainingPlan[]
```
This is the *only* `any` in the entire `src/` + `supabase/functions/` tree, and it's the one
place ESLint's `@typescript-eslint/no-explicit-any` (active via `tseslint.configs.recommended`
in `eslint.config.js`) would otherwise block it — the disable comment is explicit and scoped to
one line. It exists because `select('*, training_sessions(count)')` produces a joined-count
shape that isn't representable by the hand-written `TrainingPlan` interface, which traces back
to the same root cause as Q3 (no generated Supabase types) — with real `Database` types and a
typed `.from('training_plans').select(...)` call, this join's return shape would be inferred
correctly and the `any` wouldn't be needed. Don't "fix" this one in isolation; it'll go away
naturally if F-Supabase-types (below) is addressed.

### Remaining `as` assertions (~44 not called out above)
The rest of the ~48 `as` assertions are low-risk and don't need individual fixes:
- DOM event/element casts (`e.currentTarget as HTMLButtonElement`, `e.target as Node`) — standard
  React DOM narrowing, correct by construction of the event handler that produced them.
- `Object.keys(x) as SomeUnion[]` (7 occurrences across `WorkoutDetailModal.tsx`,
  `LogWorkoutModal.tsx`, `AnalyticsPage.tsx`, `Nutrition.tsx`) — a well-known, safe TS idiom
  (`Object.keys` is typed `string[]` even for a `Record<Union, T>`), fine as-is.
- `data as Profile` / `data as Workout[]` / `bData as FitnessBenchmark[]` (`ProfileContext.tsx:21`,
  `WorkoutsContext.tsx:47`, `ProfileSettingsModal.tsx:227`, `Nutrition.tsx:729`, `Library.tsx:21`,
  `AICoach.tsx:174`) — this is the *direct symptom* of Q3 (no generated types), not a separate
  bug; see F-Supabase-types below rather than fixing these one by one.
- `WebkitOverflowScrolling: 'touch' as unknown as undefined` (`LibraryPage.tsx:70`) — a known,
  narrow workaround for a non-standard CSS property missing from React's `CSSProperties` type.
  Legitimate escape hatch.

### `@ts-ignore` / `@ts-expect-error`
**Zero occurrences anywhere in the codebase.** Nothing to fix.

---

## 2. tsconfig strictness

`tsconfig.app.json` currently sets: `noUnusedLocals`, `noUnusedParameters`,
`erasableSyntaxOnly`, `noFallthroughCasesInSwitch`. It does **not** set `strict`,
`noImplicitAny`, `strictNullChecks`, or `noUncheckedIndexedAccess` — none of the four flags
asked about are present, so all default to `false`.

Actually enabling each flag on top of the real config (`tsc -p <overlay extending
tsconfig.app.json> --noEmit`):

| Flag | New errors |
|---|---|
| `noImplicitAny` | **0** |
| `strictNullChecks` | **0** |
| `strict` (all 8 sub-flags at once, including the above two plus `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`) | **0** |
| `noUncheckedIndexedAccess` | **81** |

### F4 — `strict: true` should just be turned on now — it's free
**Severity:** Medium (risk of *not* doing this, since it's a pure downgrade of future protection for no cost today)
**Evidence:** `tsconfig.app.json` — confirmed via direct compiler run, not inferred.
**Why it matters:** Zero errors under full `strict` means the code already *behaves* as if
strict were on (this lines up with the catch-block audit above — every `catch (err)` already
does an `err instanceof Error` check before touching `.message`, which is exactly the discipline
`useUnknownInCatchVariables` would otherwise force). Leaving `strict` off buys nothing and costs
real protection against regressions: nobody's compiler will stop them if they add
`function foo(x) {...}` without a param type on a new file, or write `user.name.length` where
`user` might be `null`. That's the entire point of `strict` mode, and this project is one
`compilerOptions` line away from having it for free.
**Fix:** Add `"strict": true` to `tsconfig.app.json` (and `tsconfig.node.json` for consistency,
though `vite.config.ts` is trivial). No code changes required.
**Effort:** S

### `noUncheckedIndexedAccess` — 81 errors, mostly noise, one real finding
**Severity:** Low (as a blanket flag), see F5 for the one real issue it surfaced
Distribution: `AnalyticsPage.tsx` (15), `WorkoutDetailModal.tsx` (10), `CalendarGrid.tsx` (6),
`Badge.tsx` (5), `ProfileSettingsModal.tsx` (5), `PlanCard.tsx`/`GeneratePlanModal.tsx` (4 each),
`calculateMetrics.ts` (2), `tss.ts` (2), remainder scattered 1-2 per file, plus ~15 in test files.

Spot-checked a representative sample across the largest offenders (`AnalyticsPage.tsx`,
`CalendarGrid.tsx`, `calculateMetrics.ts`, `WorkoutDetailModal.tsx`) and essentially all of them
are the same three shapes, none of which are real bugs:
1. `w.date.split('T')[0]` — `.split()` on a non-empty separator always returns ≥1 element;
   `noUncheckedIndexedAccess` can't know that, but it's not a real gap (`calculateMetrics.ts:40`,
   used identically ~10 more places).
2. Loop-bounded array access (`boundaries[i]` inside `for (let i = 0; i < boundaries.length; i++)`,
   `AnalyticsPage.tsx:292`) — provably in range, flagged only because the flag can't see the loop
   bound.
3. Regex capture groups (`rep[1]`, `rep[2]` after `if (rep)` from a two-mandatory-group regex,
   `WorkoutDetailModal.tsx:27`) — `RegExpMatchArray`'s numeric indices become `string | undefined`
   under this flag regardless of whether the groups are optional in the pattern; not a real
   gap here since both groups are non-optional in the regex.

Given that, turning this flag on globally would mostly add noise the team would immediately
start writing `!`-suppressions for, which is worse than not having the flag. **Recommend against**
enabling it repo-wide; the two spots worth fixing directly are called out below (F5 doesn't come
from this flag, it's a related manual finding; F6 does).

### F5 — `SPORT_COLORS` isn't typed against the actual sport/type unions, unlike its sibling maps
**Severity:** Low-Medium
**Evidence:** `src/lib/colors.ts:19-29`:
```ts
export const SPORT_COLORS: Record<string, string> = {
  swim: COLORS.accent, ride: COLORS.purple, bike: COLORS.purple, run: COLORS.green,
  strength: COLORS.amber, sc: COLORS.amber, brick: COLORS.orange, rest: COLORS.muted, other: COLORS.muted,
}
```
Compare to `src/components/ui/Badge.tsx:4` (`Record<WorkoutType, {...}>`),
`src/components/WorkoutDetailModal.tsx:129/136` and `src/components/LogWorkoutModal.tsx:28/35`
(`Record<BlockType, string>`) — every *other* color/label lookup table in the codebase is keyed
by the real union type, which means adding a new `WorkoutType` or `BlockType` variant forces a
compile error at every map that needs updating. `SPORT_COLORS` is the one exception: it's keyed
by bare `string` because it has to serve both `WorkoutType` (`run`/`ride`/`swim`/`strength`/
`rest`) and `SessionSport` (`bike`/`sc`/`brick`/`other`) keys in a single object.
**Why it matters:** Every current call site (`Badge.tsx`, `AnalyticsPage.tsx:581-584`) happens to
use a valid key today, but nothing stops a typo (`SPORT_COLORS.strenght`) or a future new sport
variant from silently returning `undefined` — which, spread into a `fill={undefined}` Recharts
prop or a CSS `color` value, degrades to invisible/default-colored UI rather than a build error.
This is exactly the class of bug `Record<Union, T>` exists to prevent, and this file is the one
place that pattern was dropped.
**Fix:** Split into two properly-keyed records (`Record<WorkoutType, string>` and
`Record<SessionSport, string>`, sharing values where the sport overlaps) or key one combined type
as `Record<WorkoutType | SessionSport, string>`. Either forces a compile error the next time a
sport/type variant is added without a matching color.
**Effort:** S

### F6 — `reorder()` in the structured workout builder can splice `undefined` into the block list
**Severity:** Low
**Evidence:** `src/components/LogWorkoutModal.tsx:286-292`:
```ts
const reorder = (fromIdx: number, toIdx: number) => {
  if (fromIdx === toIdx) return
  const arr = [...blocks]
  const [item] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, item)
  setBlocks(arr)
}
```
**Why it matters:** `arr.splice(fromIdx, 1)` destructured into `[item]` types `item` as
`WorkoutBlock` today (array destructuring isn't covered by `noUncheckedIndexedAccess`, it's
already unsound without any flag), but if `fromIdx` is ever out of bounds — a stale
`dragSrcIdx` after a block was deleted mid-drag, for instance — `item` is actually `undefined`
at runtime and gets spliced back into `blocks`, then flows into `WorkoutDetailModal`'s block
breakdown rendering (`blockType`, `durationMinutes`, etc. all read off it) with no null check,
which would throw a render-time crash rather than silently no-op the reorder.
**Fix:** Guard with `if (!item) return` before the second splice (or bounds-check `fromIdx`/
`toIdx` against `arr.length` up front). Cheap, and removes the only place in the file where a
drag-index bug turns into a full crash instead of a no-op.
**Effort:** S

---

## 3. Supabase generated types vs. hand-typed drift risk

### F-Supabase-types — The Supabase client has no generated `Database` type anywhere in the project
**Severity:** High (structural — root cause of F1's cousin issues and F3)
**Evidence:**
- `src/lib/supabase.ts:6` — `createClient(supabaseUrl, supabaseAnonKey)`, no `<Database>` type
  argument.
- Same in every edge function (`strava-auth`, `generate-plan`, `ai-briefing`, `strava-sync`,
  `parse-plan`) — `type SupabaseClient = ReturnType<typeof createClient>`, i.e. explicitly typed
  off the *untyped* factory.
- No `database.types.ts` / `supabase-types.ts` file exists anywhere in the repo (checked via
  `find` for common generated-type filenames — none found), and `mcp__supabase__generate_typescript_types`
  has apparently never been run and committed.
- Confirmed manually cross-checking `src/types/index.ts`'s `Profile` interface against
  `supabase-schema.sql`'s `profiles` table + the `avatar_url` migration — they currently agree,
  but only because CLAUDE.md's discipline ("All schema changes must also be reflected in
  `supabase-schema.sql`") has held up by hand so far, not because anything enforces it.

**Why it matters:** Every single Supabase query in the app returns `any` at the type level.
Every `data as Profile` / `data as Workout[]` / `data as TrainingSession[]` cast you see across
`ProfileContext.tsx`, `WorkoutsContext.tsx`, `AICoach.tsx`, `Library.tsx`, `Nutrition.tsx`,
`PlanCard.tsx` isn't really "casting an assumed shape to a checked one" — there is no checked
side. If a future migration renames a column, drops a column, or changes nullability
(`profiles.max_hr` becomes required, say, or `workouts.structure` changes shape), every one of
those call sites keeps compiling cleanly and keeps *believing* the old shape. The bug shows up
at runtime as `undefined` where a value was expected, in production, for real users — the exact
failure mode this whole audit is trying to catch, and it's currently only prevented by
disciplined manual bookkeeping (CLAUDE.md rules), not by the compiler.
**Fix:** Run `mcp__supabase__generate_typescript_types` (or `supabase gen types typescript
--project-id fsskwaazmoidayqtsipy`), commit the output as e.g. `src/types/database.types.ts`, and
pass it as the generic to `createClient<Database>(...)` in `src/lib/supabase.ts` and each edge
function's `createClient` call. This doesn't require rewriting `src/types/index.ts` in one pass —
the hand-written interfaces can stay as the app-facing shape, but each context's fetch site
(`ProfileContext.tsx:21`, `WorkoutsContext.tsx:47`, etc.) should map from the now-real generated
row type into the app type, which turns today's blind `as X` into a checked, compiler-verified
transform, and any future schema drift becomes a build error instead of a support ticket.
**Effort:** M (one-time type generation + wiring the generic through ~10 call sites; no behavior
change)

---

## 4. Implicit return types wider than intended

Beyond F1 (the two edge functions), this wasn't a widespread pattern — the app code is
consistent about annotating context/hook return types (`WorkoutsContext.tsx`'s
`WorkoutsContextValue` interface, `calculateMetrics.ts`'s explicit `{ current: FitnessSnapshot;
history: DayMetrics[] }` returns) and there's no second instance of a function whose inferred
return type is `Promise<any>` from an internal untyped branch. `calculateMetrics.ts` in
particular — the canonical PMC engine flagged as load-bearing in CLAUDE.md — has zero `any`,
zero unchecked casts, and fully explicit return types on every exported function; it's the
cleanest file in the codebase and the model other `lib/` code should match.

One minor, low-risk instance worth a passing mention: `src/components/ai/RacePredictor.tsx:307`
— `const cached: NarrativeCache = JSON.parse(raw)` reading a localStorage cache — same
"annotation masquerading as validation" shape as F1, but far lower stakes: it's wrapped in
`try/catch` that silently no-ops on failure (worst case is the cached narrative doesn't load,
not a wrong value shown), and a shape mismatch feeds into `metricsDrift()` which would
correctly treat missing/wrong fields as "stale" and trigger regeneration. Not worth a fix on its
own; mentioned for completeness since it's the same JSON.parse-then-annotate shape as F1.

---

## 5. Discriminated unions / exhaustiveness

**No `switch` statement exists anywhere in `src/` or `supabase/functions/`** (grepped directly,
zero matches) — `noFallthroughCasesInSwitch` is already on in `tsconfig.app.json` but has nothing
to check against. All type/status branching is done through if-chains or lookup objects.

Where a union is branched over via a **lookup object** typed as `Record<Union, T>`
(`workoutTypes` in `Badge.tsx`, `BLOCK_COLORS`/`BLOCK_LABELS`/`DEFAULT_INTENSITY`/
`DEFAULT_DURATION` in `LogWorkoutModal.tsx` and `WorkoutDetailModal.tsx` for `WorkoutType` and
`BlockType`), the `Record<Union, T>` type itself *is* the exhaustiveness check — TS refuses to
compile if a variant is missing a key. This is a good, idiomatic pattern and it's used
consistently for `WorkoutType`/`BlockType`. The one place it was dropped is F5 above
(`SPORT_COLORS`).

Where a union is branched over via **if-chains** instead (`TrainingPlan.status` in
`PlanCard.tsx:326,345-346,421,427,435` — `'active'`/`'complete'`/`'archived'`/`'upcoming'`), there
is no exhaustiveness check, but every chain checked falls back to a sane default branch (e.g.
`accentBarStyle`/`progressFillStyle` fall through to `COLORS.subtle` for the unhandled
`'upcoming'` case) rather than silently doing nothing or crashing — so a new `TrainingPlan.status`
variant would degrade gracefully (wrong color, not broken render) rather than fail outright. Not
flagged as a fix-now issue, but worth noting if `TrainingPlan.status` or
`TrainingSession.status` (`'pending' | 'completed' | 'skipped'`) ever grows a new variant: there's
no `never`-check anywhere in the codebase that would force every call site to be revisited, so
that revisit has to happen by manual code search rather than compiler error.

---

## Priority order

1. **F1** (High) — validate `parsed.sessions` shape in `parse-plan`/`generate-plan` before using it; this is the one place a malformed input silently corrupts user data rather than erroring cleanly.
2. **F-Supabase-types** (High, structural) — generate and wire in real Supabase types; this is the root cause behind most of the `as X` casts in section 1 and removes an entire class of future schema-drift bugs.
3. **F4** (Medium, but free) — turn on `strict: true`; zero current errors, pure future protection.
4. **F2** (Medium) — narrow edge function request body types with `typeof` checks, not just presence checks.
5. **F5** (Low-Medium) — type `SPORT_COLORS` against the real unions.
6. **F6** (Low) — guard `reorder()` against an out-of-bounds splice.
