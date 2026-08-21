# Vexr — Security & RLS Review

Read-only review of RLS policies (checked live against the Supabase project, not just
`supabase-schema.sql`), edge function auth, secrets, CORS, and input validation. Findings use:
**Severity** (Blocker/High/Medium/Low) · **Evidence** · **Why it matters** · **Fix** · **Effort** (S/M/L).

---

## Summary

**No Blocker-severity findings.** RLS is enabled on all 16 `public` tables with no `USING (true)`
policy on user-owned data (the one `USING (true)` policy, on `food_database`, is an intentionally
public read-only reference table with no INSERT/UPDATE/DELETE policy at all, so it's correctly
locked down). Every edge function validates the Bearer token via `supabase.auth.getUser()` and
derives the user ID from the verified token — none trust a `user_id` from the request body — and
none use the service-role key, so RLS applies as a second layer even inside edge functions. No
secrets are committed in the working tree or anywhere in git history.

The one finding worth fixing before real users rely on the app is **F1**: `api_rate_limits` grants
users full `ALL`-command RLS on their own rows, which means any authenticated user can delete or
backdate their own rate-limit ledger directly via the Supabase client (not through the edge
function) and completely bypass the `strava-sync`/`strava-auth`/`ai-briefing`/`generate-plan`/
`parse-plan` rate limits — the only enforcement mechanism protecting paid Anthropic API usage and
Strava's own per-app rate limits from a single user's abuse.

---

## 1. RLS status and policies, by table

All tables below have `relrowsecurity = true` (confirmed via `pg_class`, not just
`supabase-schema.sql`, which is not fully in sync with the live schema — see note at the end).

| Table | Policy | Command | Scope |
|---|---|---|---|
| `profiles` | 3 policies | SELECT/UPDATE/INSERT | `auth.uid() = id` |
| `workouts` | 4 policies | SELECT/INSERT/UPDATE/DELETE | `auth.uid() = user_id` |
| `training_plans` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `training_sessions` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `workout_library` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `fitness_benchmarks` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `training_zones` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `strava_connections` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` (explicit `USING` + `WITH CHECK`) |
| `ai_briefings` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `goals` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `nutrition_logs` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `nutrition_targets` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `hydration_logs` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `nutrition_custom_foods` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` |
| `api_rate_limits` | 1 policy (`for all`) | ALL | `auth.uid() = user_id` — **see F1** |
| `food_database` | 1 policy | SELECT only | `to authenticated using (true)` — intentional, no write policy exists for any role |
| `storage.objects` (`avatars` bucket) | 3 policies | SELECT (public) / INSERT / UPDATE | Public read; write scoped via `split_part(name, '.', 1) = auth.uid()::text` — verified against the actual upload code (`ProfileSettingsModal.tsx:241`, path is always `${user.id}.${ext}`), so a user cannot construct a filename that overwrites another user's avatar |

For every policy declared as `for all using (X)` with no explicit `with_check`, Postgres applies
`X` as the `WITH CHECK` too — confirmed this isn't a gap, since it means a user also can't `UPDATE`
a row to reassign its `user_id` to someone else (the new row would fail the same check). No table
relies on an implicit/missing `WITH CHECK` to its detriment.

**Supabase's own advisors** (`get_advisors`) additionally flag, at WARN level:
- `avatars` bucket's public SELECT policy allows listing all files in the bucket (not just fetching
  by known key) — low impact since avatar filenames are just `<user-id>.<ext>`, not sensitive, but
  technically over-broad. **Low**, no fix required unless you want to lock listing down.
- Leaked password protection (HaveIBeenPwned check) is disabled in Supabase Auth settings. **Low**,
  cheap to turn on in the dashboard (Auth → Policies), no code change needed.

---

## 2. `api_rate_limits` and `goals` — cross-user access and service-role bypass

**No edge function uses the service-role key.** All five (`ai-briefing`, `generate-plan`,
`parse-plan`, `strava-auth`, `strava-sync`) construct their Supabase client with
`SUPABASE_ANON_KEY` plus the caller's own `Authorization` header
(e.g. `strava-sync/index.ts:113-117`), so every query they run — including the rate-limit
check/insert — is itself subject to RLS as the calling user. There is no privileged code path that
bypasses RLS by design anywhere in the edge functions.

**`goals`**: scoped correctly. `Dashboard.tsx:394,399` call `.update()`/`.delete()` by `id` alone
without an extra `.eq('user_id', ...)` filter, but that's fine — RLS enforces ownership
independently, so even a guessed/enumerated `goals.id` belonging to another user returns zero rows
affected.

### F1 — `api_rate_limits` is directly writable/deletable by the user it's meant to constrain
**Severity:** High
**Evidence:**
- `supabase-schema.sql:286-287` / live policy: `create policy "Users can manage own rate limits" on api_rate_limits for all using ((select auth.uid()) = user_id)` — grants SELECT, INSERT, UPDATE, **and DELETE** on a user's own rows.
- All five edge functions read/write this table using the anon key + the user's own JWT (e.g. `ai-briefing/index.ts:70-78`), i.e. exactly the same credential the browser already holds for direct Supabase access — there's no privileged key involved that the client doesn't also have.
- The frontend never queries `api_rate_limits` directly today (confirmed — no references in `src/`), but nothing prevents it: the same `supabase-js` client instance already authenticated in the browser can issue `supabase.from('api_rate_limits').delete().eq('function_name', 'strava-sync')` (or `strava-auth` / `ai-briefing` / `ai-briefing-predictor` / `generate-plan` / `parse-plan`) at any time, straight from devtools or a modified client build.
**Why it matters:** This table is the *only* enforcement mechanism for `strava-sync` (3/hr), `strava-auth` (5/hr), `ai-briefing` (5/hr), the race-predictor mode (10/hr), `generate-plan` (5/hr), and `parse-plan` (5/hr). A user can delete their own rows before each call (or immediately after hitting the limit) and get unlimited calls to endpoints that: (a) hit Strava's API on the app's behalf, where excessive calls risk Strava rate-limiting or suspending the app's OAuth client for *all* users, not just the abuser, and (b) call the Anthropic API with `ANTHROPIC_API_KEY`, i.e. this is a direct, uncapped path to run up the project's Claude API bill. RLS is doing exactly what it's designed to do here (owner can manage their own row) — the bug is that a rate-limit ledger is exactly the kind of row a user should *not* be able to manage, since the whole point is that it constrains them, not that they own it.
**Fix:** Remove client-manageable RLS from this table entirely. Two options: (1) Switch the edge functions' rate-limit read/insert calls to a service-role client (kept isolated to just that one call) and drop the public RLS policy on `api_rate_limits` down to "no policy" (deny-all for `anon`/`authenticated`, since a table with RLS enabled and zero policies denies all access to those roles) — this is the minimal change and keeps every other query in the edge functions on the user-scoped anon client. (2) Alternatively, keep RLS but restrict the policy to `SELECT` only for `authenticated`, and do all INSERT/DELETE via a `SECURITY DEFINER` Postgres function (similar pattern to `handle_new_user`) that the edge function calls via RPC, so the row can only be mutated through server-controlled logic. Option 1 is less code.
**Effort:** S

---

## 3. Edge function auth — JWT verification vs. trusting client-supplied `user_id`

All five edge functions follow the same correct pattern, matching CLAUDE.md's documented ES256
workaround:

1. Check for a `Bearer` token in the `Authorization` header, return 401 if missing (`strava-auth/index.ts:81-86`, `strava-sync/index.ts:105-111`, `ai-briefing/index.ts:89-95`, `generate-plan/index.ts:65-70`, `parse-plan/index.ts:64-69`).
2. Create a Supabase client scoped to that token and call `supabase.auth.getUser()`, which validates the JWT against Supabase's auth server (supports ES256, unlike the built-in Deno runtime verifier) — return 401 if invalid.
3. Use `user.id` **from the verified token** for every subsequent query and for the rate-limit key. None of the five functions read a `user_id` (or equivalent) out of the request body and use it for anything — I checked each request body's destructured fields (`strava-auth`: `code`; `strava-sync`: no body; `ai-briefing`: `force`, `mode`, race-predictor fields; `generate-plan`: `sport`, `raceDistance`, `raceDate`, `startDate`, `preferredDays`, `level`, `goalTime`, `athleteProfile`; `parse-plan`: `content`, `contentType`, `startDate`, `raceDate`, `planName`) and none of them include a user/owner identifier that gets used for authorization.

No findings here — this is a consistently correct pattern across all five functions.

---

## 4. Secrets in the repo

Checked the working tree and full git history (`git log --all -p -- '*.env*'`, plus a grep across
`.ts`/`.tsx`/`.js`/`.json`/`.toml` for Anthropic key prefixes, `service_role`, raw JWT patterns, and
inline secret assignments):

- No `.env*` file has ever been committed (`.env`, `.env.local` are gitignored; `.env.local` on
  disk only contains `VITE_`-prefixed client-safe values — Supabase URL, anon key, Strava client
  ID, Strava redirect URI — all of which are meant to be public/client-exposed).
- No hardcoded `ANTHROPIC_API_KEY`, `STRAVA_CLIENT_SECRET`, or Supabase service-role key anywhere
  in source or edge functions — all read via `Deno.env.get(...)`.
- `.mcp.json` (contains the project ref) is gitignored and was never committed.

No findings here.

---

## 5. CORS configuration

**Evidence:** `supabase/functions/_shared/cors.ts:1-16` (`parseAllowedOrigins`, `isOriginAllowed`, `getCorsHeaders`).

- `ALLOWED_ORIGIN` (a Supabase secret) is parsed into a list, plus `localhost:5173`/`:3000` are
  always allowed for local dev.
- Any `https://*.vercel.app` origin is explicitly allowed via regex (added in commit `b05a309`,
  intentionally, for preview deployments) — commit message correctly notes CORS isn't the security
  boundary here since auth is enforced by Bearer JWT inside each handler regardless of origin.
- **If `ALLOWED_ORIGIN` is unset**, `getCorsHeaders` falls back to `'*'` (`cors.ts:18-19`:
  `allowedOrigins.length === 0 ? '*' : ...`). This is a silent fail-open: a misconfigured or
  not-yet-set secret means every origin is allowed, with no error or log to signal it.

### F2 — CORS silently opens to `*` if the `ALLOWED_ORIGIN` secret isn't set
**Severity:** Low
**Evidence:** `cors.ts:18-19`.
**Why it matters:** Since auth is genuinely enforced by JWT validation inside every handler (confirmed in §3), a wide-open CORS policy alone doesn't let an attacker read another user's data or forge requests as them without already possessing that user's access token — so this isn't an auth bypass. But it does mean a misconfiguration (secret not set, or accidentally deleted) degrades silently to "any website can call these functions" instead of failing loudly, which is worse than either failing closed or logging a warning.
**Fix:** Either fail closed (return no CORS headers / reject non-matching origins) when `ALLOWED_ORIGIN` is empty, or at minimum `console.warn` once per cold start so it shows up in `get_logs`. Also worth confirming directly (via the Supabase dashboard, not verifiable through the tools available here) that `ALLOWED_ORIGIN` is actually set in the live project's edge function secrets today.
**Effort:** S

---

## 6. Input validation on edge function request bodies

| Function | Validation |
|---|---|
| `strava-auth` | Only reads `code`; no schema needed beyond presence check (`index.ts:38-40`). Fine — it's a single opaque string handed to Strava's token endpoint. |
| `strava-sync` | No request body used at all. Fine. |
| `ai-briefing` | `force`/`mode` read with safe defaults if `req.json()` throws (`index.ts:112-120`). Race-predictor mode destructures `ctl`/`ftp`/`runPace`/`css`/`sport`/`predictions` straight into a prompt string with no type/range validation — see F3 below. |
| `generate-plan` | Solid: whitelists `sport` (`VALID_SPORTS`) and `level` (`VALID_LEVELS`), bounds-checks `raceDistance` length, validates both dates parse and that `raceDate > startDate` (`index.ts:112-143`). `athleteProfile` (ctl/ftp/thresholdPace/css/primarySport) is **not** validated — see F3. |
| `parse-plan` | Validates `content` is a non-empty string ≤ 80,000 chars, whitelists `contentType`, validates `startDate`/`raceDate` parse (`index.ts:102-126`). No schema library (zod etc.) is used anywhere, but the hand-rolled checks are equivalent in coverage for these simple shapes. |

### F3 — Unvalidated numeric/string fields flow into the Anthropic prompt in `ai-briefing` (predictor mode) and `generate-plan`
**Severity:** Low
**Evidence:**
- `ai-briefing/index.ts:131-135` — `ctl`, `ftp`, `runPace`, `css`, `sport`, `predictions` are destructured from the request body with a type assertion (`as { ... }`) but no runtime check, then interpolated directly into `racePrompt` (`index.ts:140-152`).
- `generate-plan/index.ts:95-110,153-156` — same pattern for `athleteProfile.ctl`/`.ftp`/`.thresholdPace`/`.css`.
**Why it matters:** Since these values only feed a prompt used to generate content back to the *same* authenticated user (never written to a shared table, never rendered for another user, and RLS still scopes any DB reads/writes to that user), the blast radius is limited to that user manipulating their own AI output — not a cross-user or data-integrity issue. It's here for completeness per the review's input-validation question, not because it's a serious risk today. If this prompt or its output is ever fed into a second AI call, cached and later displayed to other users, or used to make a business decision (e.g. auto-adjusting training zones), that assumption would need revisiting.
**Fix:** Optional hardening: coerce/clamp `ctl`/`ftp` to expected numeric ranges and cap string field lengths before interpolating into the prompt, consistent with the validation style already used in `generate-plan`'s top-level fields.
**Effort:** S

---

## 7. Other observations (not asked for directly, noted for completeness)

- **`workouts.plan_id` and `training_sessions.plan_id` have no ownership check at the FK level** — the foreign key only requires the referenced `training_plans.id` to exist, not that it belongs to the same `user_id`. A user could set `plan_id` on their own workout to another user's plan UUID (if they somehow obtained it) via a direct PostgREST call. RLS still fully protects the *other* user's data (they can't read/write the other plan or its sessions), and the only concrete effect is that the *attacker's own* workout row would cascade-delete if the other plan is deleted later — self-inflicted, not a real cross-tenant risk given plan UUIDs aren't exposed anywhere unguessable. **Severity: Low, informational only** — not worth a dedicated fix unless you want a `CHECK`/trigger enforcing same-owner `plan_id`.
- `supabase-schema.sql` is out of date relative to the live schema in ways that go beyond this review's scope (e.g. `profiles.max_hr`/`avatar_url`, `workouts.distance_meters`/`calories`/`elevation_gain`/`avg_power`/`avg_pace` exist live but several are missing from the `alter table` blocks in the file, and `api_rate_limits` live columns are `id`/`user_id`/`function_name`/`called_at` while CLAUDE.md's file-structure description says `request_count`/`window_start`). Not a security issue, but flagging since CLAUDE.md's own rule says every schema change must be reflected there — worth a follow-up pass to resync the file with `list_tables`/`pg_policies` output before it drifts further.
