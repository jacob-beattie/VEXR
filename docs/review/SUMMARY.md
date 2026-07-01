# Vexr — Review Summary

Synthesis of the 11-module read-only audit in `docs/review/`. No fixes were applied in this
pass or this document — this is a report to read end to end, not a changelog.

---

## 1. Prioritized Blocker / High findings

**No Blocker-severity findings exist anywhere in the audit.** Three modules say so explicitly
(`03-security-rls.md`, `04-edge-functions.md`, `07-error-handling.md`); none of the other eight
surfaced one either. Five modules (`05-frontend-state.md`, `09-performance.md`,
`10-documentation.md`, `11-deployment.md`, `00-inventory.md`) don't use formal severity tags at
all — they're narrative/structural and are folded into the verdict below, not this list.

That leaves **5 High-severity findings**, all from `01-architecture.md`, `02-typescript.md`,
`03-security-rls.md`, and `06-testing.md`. Ordered by effort (cheapest first) since severity tier
is identical across all five:

| Rank | Finding | Module | Effort | Why this order |
|---|---|---|---|---|
| 1 | **`strava-auth` validates the caller's Bearer token *after* calling Strava's OAuth API and reading secrets** (`supabase/functions/strava-auth/index.ts` — auth check at line 81, external call + secret read at lines 37-75). An unauthenticated caller can POST any `code` and trigger a real Strava token-exchange call, burning a one-time auth code and API quota, before any auth check runs. | `01-architecture.md` F5 | **S** | Purest fix in the whole list: move ~15 lines of existing auth-check code to the top of the handler, matching the other 4 functions' already-correct pattern. No design decision needed. |
| 2 | **`api_rate_limits` grants users full `ALL`-command RLS on their own rows** (`supabase-schema.sql:286-287`) — any authenticated user can `DELETE`/backdate their own rate-limit ledger directly via the Supabase client (bypassing the edge function entirely) and get unlimited calls to `strava-sync`/`strava-auth`/`ai-briefing`/`generate-plan`/`parse-plan`. This is the *only* enforcement mechanism protecting real Anthropic API spend and the app's shared Strava OAuth quota from a single user. | `03-security-rls.md` F1 | **S** | Also a small, well-scoped fix (drop the client-writable policy, move insert/count to a service-role call or a `SECURITY DEFINER` RPC) — slightly more moving parts than #1 (schema change + code change across 5 functions) so ranked just behind it. |
| 3 | **`parse-plan` and `generate-plan` trust Claude's JSON output with zero runtime validation** (`supabase/functions/parse-plan/index.ts:210-213`, `generate-plan/index.ts:262-265`) — a `JSON.parse()` result is assigned to a typed variable with no `typeof`/`Array.isArray` checks on `sessions`, `week`, `duration_minutes`, etc. A slightly-off LLM response silently produces `undefined`s that flow into `training_sessions`/`workouts` inserts — a wrong training plan on a user's calendar with no error shown. | `02-typescript.md` F1 | **M** | `strava-sync/index.ts:208-247` already has the right pattern to copy (cast to `Record<string, unknown>[]`, guard with `typeof` before use) — bounded, well-understood fix, not a design problem. |
| 4 | **No generated Supabase `Database` type anywhere in the project** (`src/lib/supabase.ts:6`, every edge function) — every Supabase query returns `any` at the type level; every `data as Profile`/`data as Workout[]` cast has no checked side. A future column rename/drop/nullability change compiles cleanly everywhere and only shows up as `undefined` in production. | `02-typescript.md` F-Supabase-types | **M** | One-time type generation is trivial; the real cost is wiring the generic through ~10 call sites. No behavior change required, but broader surface area than #3. |
| 5 | **`generate-plan`, `parse-plan`, and `strava-auth` have zero tests; `ai-briefing`/`strava-sync` are tested via hand-duplicated copies of their logic, not the deployed code.** 602 combined lines (`generate-plan` + `parse-plan`) including the conflict-detection algorithm that decides whether an imported plan double-books a user's calendar have no test coverage from any angle. | `06-testing.md` F1 | **M** (for the highest-value subset: extracting `parse-plan`'s conflict-detection + both functions' `resolveDate`/week-bucketing math into testable pure functions, plus request-validation tests) / **L** if extended to full test parity across all five functions | Largest, least-bounded fix — "extract pure functions out of Deno handlers and write tests" is real design + implementation work, not a mechanical change, so it's ranked last even though the risk it addresses (silently double-booked or miscalendared training plans) is serious. |

**Not included above but worth naming as close seconds** (Medium severity, but each has a
concrete confirmed real-world consequence, not just theoretical risk):
- `04-edge-functions.md` F1 — the rate-limit check-then-insert is non-atomic; a handful of parallel
  browser-console `fetch` calls bypasses the per-hour cap independent of finding #2 above.
- `08-code-quality.md` F5 — pace-parsing (`paceToSeconds`) has already diverged behaviorally
  between `src/lib/tss.ts` and `ProfileSettingsModal.tsx`, live today, not hypothetical.
- `07-error-handling.md` F3 — the AI rate-limit slot is spent *before* the Claude call succeeds, so
  an Anthropic outage compounds into users being locked out by their own retries.

---

## 2. Production-readiness verdict: **Not ready**

Vexr is well-architected for a solo project — RLS is correctly configured on all 16 tables, edge
function auth is consistently JWT-verified (with the one exception above), the PMC engine is
genuinely excellent and well-tested, there are no circular dependencies, and nothing in the app
crashes to a blank screen. That's real, and it's more than a lot of solo projects have at this
stage.

But "not ready" is the honest call, for reasons independent of current traffic scale:

- **Two of the five High findings are live, exploitable security/cost-abuse issues today**, not
  future-scale concerns. An unauthenticated caller can already hit `strava-auth` and burn Strava
  quota; any single signed-up user can already delete their own `api_rate_limits` rows and get
  unlimited Anthropic API calls on the project's key. Neither requires meaningful scale or
  sophistication to exploit — a few lines in a browser console are enough.
- **The code paths carrying the most financial and data-integrity risk are the least tested.**
  `generate-plan` and `parse-plan` write directly to a user's calendar and have zero test coverage,
  including the conflict-detection logic that decides whether an imported plan double-books
  existing workouts.
- **There is no CI, no error monitoring, and no environment separation.** A red test suite doesn't
  block a deploy; a production exception is invisible until a user reports it; and day-to-day
  local development runs against the same live database as production, per `CLAUDE.md`'s own
  stated policy.
- **The documentation that's supposed to be the onboarding safety net has drifted from the live
  schema** in ways that would break a fresh setup (missing `strava_connections` table, missing
  `profiles.max_hr`/`onboarding_completed`, missing `workouts` Strava-sync columns) — not a
  security issue, but a sign that the "update docs before every commit" discipline has already
  slipped once, which matters for a project this documentation-dependent.

None of this means the app is broken for its current single/few-user, pre-monetization use — it
demos fine and the core training-load math is trustworthy. It means it is not ready to be opened
up to unknown users or a paid tier without closing the two live-exploitable High findings at
minimum, and ideally the CI/monitoring gap too, since a paying user churning silently from an
undetected bug is a materially worse outcome than the same thing happening today.

---

## 3. Estimated effort to clear all Blocker + High findings

**Roughly 5–8 working days** (about one to one-and-a-half weeks at solo-project pace), broken down:

| Finding | Rough estimate |
|---|---|
| #1 — reorder `strava-auth` auth check | 0.5 day |
| #2 — fix `api_rate_limits` RLS (schema change + service-role/RPC wiring across 5 functions) | 0.5–1 day |
| #3 — runtime-validate `parse-plan`/`generate-plan` JSON output | 1–1.5 days |
| #4 — generate + wire Supabase `Database` types (~10 call sites) | 1–1.5 days |
| #5 — extract testable pure functions + write tests for conflict-detection/`resolveDate`/rate-limit/auth paths (partial scope, not full parity) | 2–3 days |

This estimate covers only the 5 High findings above, at the "M" (not "L") scope for #5. Fully
closing the Medium-severity near-misses listed in §1 (non-atomic rate limiting, pace-parsing
divergence, rate-limit-before-success ordering) would add roughly another 2–3 days on top, and
standing up CI (`04-edge-functions.md`/`11-deployment.md` both flag this as the single
highest-value-per-hour fix in the whole audit) is a separate, much smaller effort — well under a
day for a basic `npm test` + `npm run lint` GitHub Actions workflow — that isn't counted above
since it wasn't tagged as a Blocker/High finding, but should be sequenced early regardless of that
technicality, since it's cheap insurance against regressing anything fixed in the list above.
