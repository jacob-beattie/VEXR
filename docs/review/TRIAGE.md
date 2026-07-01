# Vexr — Fix Triage Plan

Derived from `docs/review/SUMMARY.md` §1. No new analysis — this just turns that ranked list into
a per-module worklist so a fix session can start immediately without re-reading all 11 module
files.

Verified directly against the module files: `grep -l "Severity:** High"` across `docs/review/*.md`
returns exactly `01-architecture.md`, `02-typescript.md`, `03-security-rls.md`, `06-testing.md` —
no Blocker-severity findings exist anywhere, confirming SUMMARY.md's claim.

---

## 1. Ordered module list (Blocker/High only)

Order = SUMMARY.md's ranking (severity tier is identical — all High — so ordered by effort,
cheapest first). Modules are listed once, at the position of their first/highest-ranked finding.

| Order | Module | Finding(s) to fix | Effort |
|---|---|---|---|
| 1 | **01 — architecture** (`01-architecture.md`) | F5 | S |
| 2 | **03 — security & RLS** (`03-security-rls.md`) | F1 | S |
| 3 | **02 — typescript** (`02-typescript.md`) | F1, F-Supabase-types | M, M |
| 4 | **06 — testing** (`06-testing.md`) | F1 | M (partial scope) / L (full) |

---

## 2. Per-module worklist

### Fix 1 — `01-architecture.md` F5: reorder `strava-auth` auth check
- **File:** `supabase/functions/strava-auth/index.ts`
- **What's wrong:** Bearer token is validated at line 81, *after* the Strava OAuth token exchange
  and secret reads happen at lines 37-75. An unauthenticated caller can POST any `code` and
  trigger a real Strava API call before auth ever runs — burns a one-time auth code + API quota.
- **Fix:** Move the `authHeader` / `supabase.auth.getUser()` check (currently lines 78-101) to the
  very top of the handler, before the body is parsed or Strava is contacted — matching the
  already-correct pattern in `ai-briefing`, `generate-plan`, `parse-plan`, `strava-sync`.
- **Effort:** S — no design decision, just move existing code.

### Fix 2 — `03-security-rls.md` F1: lock down `api_rate_limits` RLS
- **File:** `supabase-schema.sql:286-287` (policy), edge functions that touch this table
  (`ai-briefing`, `strava-auth`, `strava-sync`, `generate-plan`, `parse-plan`).
- **What's wrong:** Policy `"Users can manage own rate limits" ... for all` grants
  SELECT/INSERT/UPDATE/**DELETE** on a user's own rows. Any signed-up user can
  `supabase.from('api_rate_limits').delete()...` from devtools and get unlimited calls to
  Strava-sync/auth and the Anthropic-backed functions — this is the *only* enforcement mechanism
  protecting real API spend and the shared Strava OAuth quota.
- **Fix (pick one, both are in the module's Fix section):**
  1. (Recommended — less code) Drop the client-writable policy entirely (RLS enabled + zero
     policies = deny-all for `anon`/`authenticated`); switch the edge functions' rate-limit
     read/insert calls to a service-role client, isolated to just that call.
  2. Keep RLS but restrict the policy to `SELECT` only; do INSERT/DELETE via a
     `SECURITY DEFINER` Postgres RPC (same pattern as `handle_new_user`).
- **Effort:** S — schema change + wiring across 5 functions, still small/well-scoped.

### Fix 3 — `02-typescript.md` F1 + F-Supabase-types
Two distinct findings in the same module, do F1 first (narrower, more urgent), then
F-Supabase-types (broader, foundational).

**F1 — runtime-validate `parse-plan`/`generate-plan` JSON output**
- **Files:** `supabase/functions/parse-plan/index.ts:210-213`,
  `supabase/functions/generate-plan/index.ts:262-265`.
- **What's wrong:** `JSON.parse(jsonStr)` result is assigned to a *type-annotated* variable with
  zero runtime checks. A slightly-off Claude response (missing field, `week` as a string, omitted
  `sessions`) parses as valid JSON, then flows `undefined`s into `resolveDate()`, conflict
  detection, and `training_sessions`/`workouts` inserts — silently wrong plan on a user's
  calendar, no error shown.
- **Fix:** Add `typeof`/`Array.isArray` guards on `sessions`, `week`, `sport`,
  `duration_minutes`, etc. before trusting `parsed`. Copy the pattern already used correctly in
  `strava-sync/index.ts:208-247` (cast to `Record<string, unknown>[]`, then `typeof` checks
  before use). No schema library needed — the existing `RawSession` interface already documents
  the expected shape, it's just unenforced.
- **Effort:** M.

**F-Supabase-types — generate and wire a `Database` type**
- **File:** `src/lib/supabase.ts:6` (`createClient` with no `<Database>` generic), same pattern
  in every edge function's `createClient` call.
- **What's wrong:** No generated `database.types.ts` exists anywhere in the repo. Every Supabase
  query returns `any` at the type level; every `data as Profile`/`data as Workout[]` cast has no
  checked side. A future column rename/drop/nullability change compiles cleanly and only shows up
  as `undefined` in production.
- **Fix:** Run `mcp__supabase__generate_typescript_types`, commit as
  `src/types/database.types.ts`, pass as the generic to `createClient<Database>(...)` in
  `src/lib/supabase.ts` and each edge function. Hand-written interfaces in `src/types/index.ts`
  can stay as the app-facing shape — map from the generated row type at each context's fetch site
  (`ProfileContext.tsx:21`, `WorkoutsContext.tsx:47`, etc.) rather than rewriting everything in one
  pass.
- **Effort:** M — one-time generation + wiring the generic through ~10 call sites, no behavior
  change.

### Fix 4 — `06-testing.md` F1: test the untested/miscovered edge functions
- **Files:** `supabase/functions/generate-plan/index.ts` (zero tests),
  `supabase/functions/parse-plan/index.ts` (zero tests, includes conflict-detection at
  `parse-plan/index.ts:239-249`), `supabase/functions/strava-auth/index.ts` (zero tests),
  plus `ai-briefing`/`strava-sync` whose existing tests exercise **hand-duplicated copies** of
  the logic, not the deployed code.
- **What's wrong:** The code paths carrying the most financial/data-integrity risk (conflict
  detection deciding whether an imported plan double-books a calendar; date/week-bucketing math;
  rate-limit + auth checks) have no test coverage from any angle.
- **Fix, in priority order (per the module's own ordering):**
  1. Extract `parse-plan`'s conflict-detection function and `resolveDate`/week-bucketing math
     (both `generate-plan` and `parse-plan`) into pure, Deno-global-free files importable by
     Vitest — same pattern `_shared/cors.ts` already uses — instead of duplicating into test
     files. This is the highest-value chunk: it closes the "tests a copy, not the real thing" gap
     for the riskiest logic.
  2. Add request-validation-level tests for `generate-plan`, `parse-plan`, `strava-auth`: missing
     auth header → 401, missing required field → 400, rate limit exceeded → 429.
  3. (Longer term / L scope, not required for this pass) Replace the duplicated-logic pattern in
     `ai-briefing`/`strava-sync` tests with real imports, same as (1).
- **Effort:** M for (1)+(2) — the scope to target in this triage pass. L only if extending to full
  parity across all five functions (out of scope here).

---

## 3. Modules with zero Blocker/High findings — skip for now

None of these appear in the ordered list above. Do not touch them in this pass.

- `00-inventory.md` — narrative/structural, no severity tags
- `04-edge-functions.md` — explicitly states no Blocker findings; highest finding is Medium (F1,
  non-atomic rate-limit check-then-insert — see optional list below)
- `05-frontend-state.md` — narrative/structural, no severity tags
- `07-error-handling.md` — explicitly states no Blocker findings; highest finding is Medium (F3 —
  see optional list below)
- `08-code-quality.md` — highest finding is Medium (F5 — see optional list below)
- `09-performance.md` — narrative/structural, no severity tags
- `10-documentation.md` — narrative/structural, no severity tags
- `11-deployment.md` — narrative/structural, no severity tags

### Optional / later (Medium-severity near-misses, named in SUMMARY.md §1 but explicitly not High)

Not part of the checklist below — revisit after the High findings are closed:
- `04-edge-functions.md` F1 — rate-limit check-then-insert is non-atomic (parallel requests can
  bypass the cap independent of Fix 2 above).
- `08-code-quality.md` F5 — `paceToSeconds` has already diverged behaviorally between
  `src/lib/tss.ts` and `ProfileSettingsModal.tsx`.
- `07-error-handling.md` F3 — AI rate-limit slot is spent before the Claude call succeeds, so an
  Anthropic outage compounds into users locking themselves out via retries.
- `04-edge-functions.md` / `11-deployment.md` — both flag standing up basic CI
  (`npm test` + `npm run lint` GitHub Actions workflow) as the single highest-value-per-hour fix
  in the whole audit, despite not being tagged Blocker/High. Cheap (well under a day), worth
  sequencing early regardless.

---

## 4. Checklist — run in this order

- [ ] **Fix 1** — `01-architecture.md` F5: move `strava-auth` auth check to top of handler
- [ ] **Fix 2** — `03-security-rls.md` F1: remove client-writable RLS on `api_rate_limits`,
      move rate-limit read/insert to service-role or `SECURITY DEFINER` RPC
- [ ] **Fix 3** — `02-typescript.md` F1: runtime-validate `parse-plan`/`generate-plan` JSON output
- [ ] **Fix 3** — `02-typescript.md` F-Supabase-types: generate + wire `Database` type
- [ ] **Fix 4** — `06-testing.md` F1: extract + test conflict-detection/`resolveDate`/week-bucketing
      pure functions, add request-validation tests for `generate-plan`/`parse-plan`/`strava-auth`
