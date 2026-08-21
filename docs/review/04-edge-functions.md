# Vexr — Edge Functions Backend Review

Read-only review of the five Deno edge functions (`ai-briefing`, `generate-plan`, `parse-plan`,
`strava-auth`, `strava-sync`) as backend services — error handling, idempotency, timeouts,
rate-limit enforcement, logging, and statelessness. Independent of the RLS/auth security pass in
`03-security-rls.md`; where a finding here overlaps with that doc it's cross-referenced rather than
repeated. Findings use: **Severity** (Blocker/High/Medium/Low) · **Evidence** · **Why it matters** ·
**Fix** · **Effort** (S/M/L).

---

## Summary

**No Blocker findings.** All five functions wrap their entire handler body in a single top-level
`try/catch`, so no unhandled exception can crash a function or leak a raw stack trace to the
client — that part is solid and consistent. Every Anthropic API call has a 30s `AbortController`
timeout.

The two worth fixing soonest:

- **F1**: the shared `checkRateLimit` pattern (duplicated identically across all five functions) is
  a non-atomic check-then-insert — concurrent requests from the same user can blow past the
  intended per-hour limit regardless of the RLS issue already flagged in `03-security-rls.md` F1.
- **F4**: `strava-auth` and `strava-sync` return raw internal error strings (Postgres errors,
  upstream Strava error text) to the client, while the other three functions correctly return a
  generic message — an inconsistency that leaks backend implementation detail.

Also notable: `ai-briefing`, `generate-plan`, and `parse-plan` never log the user id, even in their
error handlers (**F5**), which will make production incidents on the AI-dependent paths — exactly
the paths most likely to fail from an external dependency — hard to correlate to a specific user.

---

## 1. Error handling

**Confirmed solid on the core question:** every function has exactly one top-level `try { ... }
catch (err: unknown) { ... }` wrapping the whole handler (`ai-briefing/index.ts:88-368`,
`generate-plan/index.ts:63-325`, `parse-plan/index.ts:62-277`, `strava-auth/index.ts:35-149`,
`strava-sync/index.ts:104-322`), and every catch block returns a JSON body with a non-2xx status
instead of letting an exception propagate. `req.json()` calls that could throw on malformed bodies
sit inside that same try block in every function, so a bad request body degrades to a normal error
response rather than a crash. No stack traces appear in any response body.

### F4 — `strava-auth`/`strava-sync` leak raw internal error text to the client
**Severity:** Medium
**Evidence:**
- `strava-auth/index.ts:141-148`: `const message = err instanceof Error ? err.message : 'Unknown error'` then `JSON.stringify({ error: message })` — this is whatever `.message` the thrown error carries, including `Strava token exchange failed (400): ${tokens.message}` (`strava-auth/index.ts:72-74`) and any Postgres upsert error (`strava-auth/index.ts:131-134`, e.g. constraint names, column names).
- `strava-sync/index.ts:312-319`: same pattern, plus a fallback that does `JSON.stringify(err)` for non-`Error` throws — even more likely to dump an unfiltered object shape to the client.
- Contrast with `ai-briefing/index.ts:363-366`, `generate-plan/index.ts:320-323`, `parse-plan/index.ts:272-275`, which all return the fixed string `'An internal error occurred. Please try again.'` and keep the real detail only in `console.error`.
**Why it matters:** Not a stack trace, but still an information-disclosure inconsistency — a Postgres error message can name tables/constraints/columns, and Strava's upstream error text is echoed verbatim to the Vexr client. It also means the two Strava functions and the three AI functions have different client-side error-handling contracts (specific string vs. generic string) for no functional reason.
**Fix:** Apply the same generic-message pattern used in the other three functions: log `message` via `console.error`, return a fixed user-facing string (e.g. `'Strava connection failed. Please try again.'` / `'Sync failed. Please try again.'`).
**Effort:** S

### Minor — inconsistent status codes for "unexpected internal error"
**Severity:** Low
**Evidence:** `ai-briefing` returns `400` for its catch-all (`ai-briefing/index.ts:365`), `strava-auth`/`strava-sync` also return `400` (`strava-auth/index.ts:146`, `strava-sync/index.ts:318`), but `generate-plan`/`parse-plan` return `500` for the equivalent catch-all (`generate-plan/index.ts:322`, `parse-plan/index.ts:274`).
**Why it matters:** A generic unexpected-exception catch is a server-side fault, not a client-side one — `500` is the more correct code, and any future client logic that branches on 4xx-vs-5xx (e.g. "don't retry on 4xx, do retry on 5xx") will behave inconsistently across functions for the same class of failure.
**Fix:** Standardize the catch-all fallback status to `500` across all five functions (keep the specific `400`/`401`/`429` responses for the cases that are genuinely the caller's fault).
**Effort:** S

---

## 2. Idempotency

### F2 — `strava-sync`'s batch insert is all-or-nothing on a unique-constraint collision, and the in-memory dedupe guard doesn't cover concurrent syncs
**Severity:** Medium
**Evidence:**
- `workouts.strava_activity_id` has a DB-level `unique` constraint (`supabase-schema.sql:27`), so exact duplicate rows can't land in the table — good.
- But `strava-sync/index.ts:218-225` dedupes by first `SELECT`-ing existing `strava_activity_id`s, then building an `inserts` array of everything not already present, then does one `supabase.from('workouts').insert(inserts)` (`strava-sync/index.ts:304`) — a single multi-row INSERT statement. If two sync requests race (both read the same "existing" set before either has inserted), the second one's INSERT hits the unique constraint on whichever activity the first request already committed, and **the entire statement fails atomically** — not just the colliding row. Every other genuinely-new activity in that second batch fails to sync too, and the raw Postgres unique-violation error is returned to the client (compounding with F4 above).
- This is a real, reachable race, not just theoretical: `StravaContext.tsx:63-64` guards against concurrent `triggerSync()` calls with an in-memory `syncing` flag, but that flag is per-tab React state. Auto-sync fires once per session load (`StravaContext.tsx:42-50`) with no server-side lock, so two browser tabs (or a tab reload racing an in-flight auto-sync) each run their own `syncing=false → true` cycle independently and can call `strava-sync` concurrently for the same user.
**Why it matters:** A user who opens Vexr in two tabs (or reloads during an in-flight auto-sync) can have a sync silently fail to import a batch of activities that should have synced cleanly, consume one of their 3/hr rate-limit slots for nothing, and see a raw DB error message.
**Fix:** Replace the plain `.insert(inserts)` with `.upsert(inserts, { onConflict: 'strava_activity_id', ignoreDuplicates: true })` so a collision on one row doesn't fail the rest of the batch, and the pre-check `SELECT` becomes redundant (can be dropped, or kept as a cheap early-exit for `count: 0`).
**Effort:** S

### F3 — no duplicate-submission protection on `ai-briefing` generation
**Severity:** Low
**Evidence:** The 24h cache check (`ai-briefing/index.ts:189-207`) only protects against duplicate work when a cached row already exists and `force` is false. Two scenarios bypass it: (a) a user's very first briefing ever (no cache row yet) — two rapid requests (double-click, or a client retry after a slow-but-successful response) both see no cache, both pass the rate-limit check if under the limit, both call Claude, and both `insert` into `ai_briefings` (`ai-briefing/index.ts:336-342`); (b) any `force: true` "Regenerate" double-click does the same, since `force` skips the cache read entirely.
**Why it matters:** Each duplicate is a wasted Claude API call (real cost) and consumes one of the user's 5/hr rate-limit slots for a redundant result. The 9-row prune (`ai-briefing/index.ts:344-354`) cleans up the extra row eventually, but the money's already spent by then.
**Fix:** Not worth a distributed lock for this traffic pattern — cheapest fix is client-side: disable the "Regenerate" button while a request is in flight (check whether `AICoach.tsx` already does this; if not, add it). Server-side, a short-lived "generation in progress" marker (e.g. a row inserted before the Claude call and checked at the top) would close the race fully if it recurs in practice.
**Effort:** S (client-side) / M (server-side lock)

**Confirmed non-issue:** `generate-plan` and `parse-plan` are pure generate-and-return functions — neither writes plan/session data itself (confirmed via `GeneratePlanModal.tsx` and `ImportModal.tsx`, which persist to `training_plans`/`training_sessions`/`workouts` client-side only after the user reviews and confirms). A double-submit of either just costs an extra Claude call and rate-limit slot, not a duplicate business record. `strava-auth`'s connection write is a genuine `upsert(..., { onConflict: 'user_id' })` (`strava-auth/index.ts:117-129`), so re-running it with the same or a new code is naturally idempotent at the DB level; a replayed *same* authorization code would fail earlier at Strava's token-exchange step (one-time-use codes), which is already handled as a normal error response.

---

## 3. Timeouts and external calls

**Confirmed present and consistent.** Every one of the four Claude API call sites uses the same
pattern — `AbortController` + `setTimeout(() => controller.abort(), 30000)` + `clearTimeout` right
after the `fetch` resolves:
- `ai-briefing/index.ts:154-170` (race-predictor mode)
- `ai-briefing/index.ts:307-323` (weekly briefing)
- `generate-plan/index.ts:229-245`
- `parse-plan/index.ts:179-195`

An aborted or slow-to-fail fetch throws, which is caught by the outer `try/catch` in all four
functions and turned into a normal structured error response — no hang, no unbounded wait.

### Minor — no stale-cache fallback when a forced refresh's Claude call fails
**Severity:** Low / informational
**Evidence:** `ai-briefing/index.ts:188-207` only reads the cache when `force` is false. If a user explicitly refreshes (`force: true`) and the Claude call then times out or errors, the function falls straight to the generic error response even though a previous (slightly stale) briefing already exists in `ai_briefings` for that user.
**Why it matters:** Pure UX nicety, not a correctness bug — the non-force path already serves a 24h cache, so most of the time users aren't hitting this. Worth a note only because the task specifically asks about "fallback behavior if the API is slow or down," and today that fallback is "show an error" rather than "show the last known briefing with a staleness indicator."
**Fix:** Optional — on Claude failure in the force path, fall back to returning the most recent cached row with `cached: true, stale: true` instead of a hard error.
**Effort:** S

---

## 4. Rate limiting

**`api_rate_limits` is checked before every write/external-call path** — all five functions call a
`checkRateLimit` helper before doing any Anthropic/Strava work (`ai-briefing/index.ts:64-80,
124,210`, `generate-plan/index.ts:44-55,86`, `parse-plan/index.ts:43-54,85`,
`strava-auth/index.ts:11-27,103`, `strava-sync/index.ts:11-27,128`). There's no code path in any
function that reaches the Anthropic or Strava API without going through this check first — the
"only checked in some code paths" scenario the task asks about doesn't apply here structurally.

The **already-documented** issue is `03-security-rls.md` F1: `api_rate_limits`' RLS policy lets a
user delete/manage their own ledger rows directly via the Supabase client, bypassing the mechanism
entirely from outside the edge functions. That's a client-side/RLS bypass, not a backend-service
bug, so it isn't repeated here — see that doc for the fix. The finding below is a *separate*,
purely server-side gap in the same mechanism.

### F1 — `checkRateLimit`'s check-then-insert is not atomic — concurrent requests can exceed the limit
**Severity:** Medium
**Evidence:** The identical helper is duplicated in all five functions (`ai-briefing/index.ts:64-80`, `generate-plan/index.ts:44-55`, `parse-plan/index.ts:43-54`, `strava-auth/index.ts:11-27`, `strava-sync/index.ts:11-27`):
```ts
const { count } = await supabase.from('api_rate_limits')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId).eq('function_name', functionName).gte('called_at', windowStart)
if ((count ?? 0) >= limit) return false
await supabase.from('api_rate_limits').insert({ user_id: userId, function_name: functionName })
return true
```
This is a read-then-write with no transaction, advisory lock, or DB-level constraint (e.g. no unique index that would make a 6th row in a rolling window fail). If a user (or a simple script) fires several requests to the same function concurrently, each one can read the same `count` (e.g. 4, under a limit of 5) before any of them has inserted, and all of them pass the check — the limit only holds under strictly sequential calls.
**Why it matters:** This is the mechanism protecting real Anthropic API spend (`ai-briefing`, its race-predictor mode, `generate-plan`, `parse-plan`) and Strava's per-app rate limits (`strava-auth`, `strava-sync`, where excessive calls risk Strava throttling the app for every user, not just the one abusing it). A user doesn't need any special access to exploit this — just firing a handful of parallel `fetch` calls from the browser console is enough to exceed the intended per-hour cap, independent of the RLS-based bypass in F1 of the security doc.
**Fix:** Make the check atomic. Simplest option: replace the ledger-of-rows approach with a single upsert-and-increment using a Postgres function (`SECURITY DEFINER`, called via RPC) that does the count check and insert inside one statement/transaction — e.g. `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING ...` semantics, or a `SELECT ... FOR UPDATE` row lock scoped to `(user_id, function_name)`. This is also the natural place to fix `03-security-rls.md` F1 at the same time, since moving the increment into a `SECURITY DEFINER` function removes the need for direct client INSERT/DELETE access to the table.
**Effort:** M

---

## 5. Logging

### F5 — `ai-briefing`/`generate-plan`/`parse-plan` never log the user id, even on error
**Severity:** Medium
**Evidence:** Compared logging across all five functions directly:
- `strava-auth` and `strava-sync` log at nearly every checkpoint, including the resolved user id (`strava-auth/index.ts:95`: `console.log('[strava-auth] Vexr user:', user?.id ?? 'NOT FOUND', ...)`; `strava-sync/index.ts:120`: same pattern).
- `ai-briefing`, `generate-plan`, and `parse-plan` log **only** on error, and none of those error lines include `user.id` anywhere — e.g. `ai-briefing/index.ts:362`: `console.error('[ai-briefing] error:', message)`, same shape in `generate-plan/index.ts:319` and `parse-plan/index.ts:271`.
**Why it matters:** These three functions are exactly the ones with an external dependency most likely to fail in production (Claude timeouts, malformed/truncated JSON from the model — both already have dedicated error branches). When a user reports "my AI coach briefing / plan generation failed," the only server-side signal is a log line with no user id and no distinguishing context, so debugging requires cross-referencing request timestamps in Supabase's function invocation logs instead of a simple grep by user id.
**Fix:** Include `user.id` in every `console.error` in these three functions (it's already available at that point in the handler in all failure branches after auth succeeds — for pre-auth failures like a missing `ANTHROPIC_API_KEY`, log without it). No prompts, tokens, or other PII need to be added — just the id already used for the DB queries.
**Effort:** S

### Minor — real name logged in `strava-auth`
**Severity:** Low
**Evidence:** `strava-auth/index.ts:115,136` log `athleteName` (the Strava-provided first/last name) via `console.log` twice.
**Why it matters:** Minor PII-in-logs; low impact since it's the user's own name tied to their own connect action, but unnecessary — `athlete_id` alone is sufficient for debugging the upsert.
**Fix:** Drop `athleteName` from the log lines, keep `tokens.athlete?.id`.
**Effort:** S

**Confirmed not an issue:** none of the five functions log full prompts, the `ANTHROPIC_API_KEY`, access/refresh tokens, or full JWTs. `strava-auth/index.ts:39` explicitly truncates the OAuth `code` to 6 characters before logging it, and Anthropic/Strava error bodies are truncated to 200–500 characters before logging (`ai-briefing/index.ts:174`, `generate-plan/index.ts:249,266`, `parse-plan/index.ts:199,216`), which keeps accidental prompt/content leakage into logs bounded even if an upstream error body happened to echo request content back.

---

## 6. Cold start / stateless correctness

**Confirmed clean — no findings.** Checked every function for module-level mutable state that
could leak between invocations on a warm instance:
- The only module-scope values are `ALLOWED_ORIGINS` (computed once from an env var — read-only,
  safe to share) and pure constants (rate limits, PMC decay constants, day-offset maps).
- Every `createClient(...)` call happens **inside** the request handler, scoped to that request's
  `Authorization` header (`ai-briefing/index.ts:97-101`, `generate-plan/index.ts:72-76`,
  `parse-plan/index.ts:71-75`, `strava-auth/index.ts:88-92`, `strava-sync/index.ts:113-117`) — no
  shared/cached Supabase client instance that could carry one user's auth context into another
  user's invocation on a warm instance.
- Rate limiting and briefing caching are both backed by the database (`api_rate_limits`,
  `ai_briefings`), not in-memory counters or caches, so correctness doesn't depend on which
  instance (cold or warm) handles a given request.

No changes needed here.
