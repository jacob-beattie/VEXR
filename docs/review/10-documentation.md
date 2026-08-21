# Vexr — Documentation & Onboarding Review

Assesses whether someone other than the original author — including future-them in a year —
could safely pick up this codebase from its documentation alone: CLAUDE.md accuracy, README
setup instructions, PMC/training-load domain docs, edge function contracts, and stale
TODO/dead-code markers.

**Bottom line:** partially. The PMC engine (CTL/ATL/TSB) is unusually well documented for a
solo project. But CLAUDE.md and README have drifted from the live database schema in ways that
would break onboarding for Strava sync and user onboarding specifically, and none of the 5 edge
functions have a request/response contract independent of their implementation.

---

## 1. CLAUDE.md accuracy

**Stale file-structure claim, reintroduced by its own fix commit.** CLAUDE.md:58-59 lists
`dashboard/ — StatCard, WeeklyLoadChart, FitnessChart, UpcomingWorkouts` under
`src/components/`. That directory doesn't exist — `StatCard` is now a local function inline in
`src/pages/Dashboard.tsx:655`. The folder was deleted in `af2c033` ("Remove unused code...",
2026-05-15), then this exact stale line was **re-added** by `8e13c8c` ("Fix CLAUDE.md
inaccuracies in file structure, test count, and profiles schema", 2026-06-29) — the commit
explicitly meant to correct CLAUDE.md drift introduced a new instance of it. This is the
single most misleading line in the file, since it was wrong both before and after the
dedicated accuracy pass.

**Database schema drift (CLAUDE.md vs. `supabase-schema.sql`):**
- `profiles` (CLAUDE.md:87) lists `max_hr`, `onboarding_completed` — neither column appears in
  `supabase-schema.sql`. CLAUDE.md:148 itself documents this as a manual, out-of-band step
  ("run `ALTER TABLE profiles ADD COLUMN onboarding_completed boolean default false;`") that was
  never backported to the schema file — directly violating the project's own rule at
  CLAUDE.md:34 ("All schema changes must also be reflected in `supabase-schema.sql`").
- `workouts` (CLAUDE.md:88) lists `distance_meters, calories, elevation_gain, avg_power,
  avg_pace` — none appear in `supabase-schema.sql`'s `create table workouts` (lines 15-31) or
  any later `ALTER TABLE`. These columns are real and used by Strava sync
  (`src/types/index.ts:27-33`), just never synced back to the schema file.
- `strava_connections` (CLAUDE.md:89) is documented as a live table, but its
  `create table` in `supabase-schema.sql:33-51` is entirely **commented out** ("Run this if the
  table doesn't already exist") — the canonical schema file doesn't actually define a table
  the app depends on for Strava auth.
- `api_rate_limits` (CLAUDE.md:102) claims columns `request_count, window_start`. The real
  schema (`supabase-schema.sql:278-284`) defines `id, user_id, function_name, called_at` — a
  different mechanism entirely (one row per call, counted via `.gte('called_at', windowStart)`
  in `supabase/functions/strava-auth/index.ts:17-23`). CLAUDE.md's description matches neither
  the schema nor the implementation.
- `profiles.avatar_url` (`supabase-schema.sql:329`, used in `ProfileSettingsModal.tsx` and
  `Sidebar.tsx`) is a real, shipped column absent from CLAUDE.md entirely — a shipped feature
  invisible to documentation.
- Storage bucket policies for avatars (`supabase-schema.sql:331-339`) are also commented out
  ("run once in Supabase dashboard or via migration") rather than tracked as live SQL.
- `roadmap.txt:87` claims "17 tables"; actual count is 16 (15 live `create table` statements +
  `strava_connections` commented out).

**Tech stack drift.** CLAUDE.md:14 states "No Tailwind — all styles are inline," but
`package.json` devDependencies include `tailwindcss@^4.2.2`, `@tailwindcss/vite@^4.2.2`,
`autoprefixer`, and `postcss`. No `tailwind.config` or `@import "tailwindcss"` was found in
`index.css`/`vite.config.ts`, suggesting these are vestigial dependencies rather than an
active-use contradiction — but it's still manifest-level drift against an explicit claim.

**Accurate / not discrepant:**
- Edge functions list (CLAUDE.md:72-78) matches `supabase/functions/` exactly (5 functions +
  `_shared/cors.ts`).
- Test file count ("27 test files," CLAUDE.md:165) matches `npx vitest run` (27 files, 275
  tests — CLAUDE.md doesn't state a total test count so there's no direct contradiction there).
- Pages/routes and the Features Shipped section (CLAUDE.md:126-157) match `src/pages/*.tsx`
  with no missing or extra routes found.

---

## 2. README setup instructions (followed literally)

**Env vars: one instruction is wrong and a security foot-gun.** README:93-98 tells a fresh
developer to set `VITE_STRAVA_CLIENT_SECRET=your_strava_client_secret` in `.env.local`. This
var is never read anywhere in `src/` — only the non-`VITE_`-prefixed `STRAVA_CLIENT_SECRET` is
read server-side (`supabase/functions/strava-auth/index.ts:44`,
`strava-sync/index.ts:162`). Any `VITE_`-prefixed variable gets bundled into the client-side JS
by Vite, so following this instruction literally would ship the Strava client secret to the
browser. The repo's actual `.env.local` confirms this was never really used — it holds only 4
vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRAVA_CLIENT_ID`,
`VITE_STRAVA_REDIRECT_URI`), no client secret.

**Missing edge-function secret.** README:126-129 documents setting `STRAVA_CLIENT_SECRET` and
`ANTHROPIC_API_KEY` as Supabase secrets, but never mentions `STRAVA_CLIENT_ID` — yet
`supabase/functions/strava-auth/index.ts:43,49` reads `Deno.env.get('STRAVA_CLIENT_ID')` and
throws `'STRAVA_CLIENT_ID secret is not set on this edge function'` if absent. A fresh dev
following the README exactly hits this runtime error with no guidance on how to fix it.

**Undocumented optional var.** `ALLOWED_ORIGIN` is read in all 5 edge functions (e.g.
`ai-briefing/index.ts:4`) and appears nowhere in README or CLAUDE.md. It's optional (falls back
to allow-all in `_shared/cors.ts:16-19`), so not a blocker, but it's an undocumented
production-CORS knob.

**No Supabase local-dev workflow documented — and none exists to document.** README never
mentions `supabase start`, local Postgres, seeding, or `supabase/migrations/`. This matches
reality: there is no `supabase/config.toml` and no `supabase/migrations/` directory, only
`supabase/.temp/` and `supabase/functions/`. Schema changes go straight to the live project via
MCP (`apply_migration`, per CLAUDE.md:30-36), with `supabase-schema.sql` as the only tracked
schema artifact. Per §1, that file has already drifted — so README's instruction to "run the
SQL schema from `supabase-schema.sql` in the SQL editor" would today produce a database
**missing** `strava_connections`, `profiles.max_hr`, `profiles.onboarding_completed`, and 5
`workouts` columns, silently breaking Strava sync, onboarding, and Strava-imported workout
fields on a fresh setup.

**Edge function deployment: accurate.** README:131-139 lists all 5
`supabase functions deploy ... --no-verify-jwt` commands, matching all 5 directories under
`supabase/functions/`.

**npm scripts: accurate.** `npm run dev`, `npm test`, `npm run test:watch` referenced in
README all exist in `package.json`. (`lint`, `build`, `preview` scripts exist but aren't
mentioned — minor omission, not incorrect.)

**Stale test count.** README:160 states "264 tests across 26 files." Actual:
`npx vitest run` → 275 tests, 27 files. The number was accurate when commit `7de7629` landed
(2026-06-29 19:17) and was copied into README/CLAUDE.md/roadmap.txt by `297d096` the same day
— but CLAUDE.md was later corrected to "27 test files" by `8e13c8c`, while README and
`roadmap.txt:88` were never updated and still show 264/26.

**Deployment section:** consistent with `vercel.json` at repo root; no contradictions found.

**Verdict:** a fresh clone would get further than nothing, but would hit at least one silent
data-loss-shaped bug (missing schema columns) and one runtime crash (`STRAVA_CLIENT_ID` unset)
if the README were followed literally end-to-end, plus one instruction that would leak a
secret into the client bundle if actually acted on.

---

## 3. PMC / training-load domain documentation

`src/lib/calculateMetrics.ts` (128 lines) is well documented in-repo:
- Named constants with rationale inline: `CTL_K = 1 - Math.exp(-1/42) // 42-day time constant
  (Fitness)` (line 5), `ATL_K = 1 - Math.exp(-1/7) // 7-day time constant (Fatigue)` (line 6).
- JSDoc-style comments on `buildTssByDay` (31-34), `runPMC` (45-52, including the exact update
  formula `CTL = CTL + (TSS - CTL) * CTL_K`), and `calculatePMC` (96-106, explaining
  warmup/window/exclusion-of-planned-workouts behavior).
- `README.md:187-201` has a dedicated "CTL/ATL/TSB Calculations" section spelling out the same
  exponential-decay formulas and one-line definitions (CTL = Fitness, ATL = Fatigue, TSB =
  Form).
- `CLAUDE.md:116-124` repeats the same summary and points to the canonical engine location.

This is a genuine strength — CTL/ATL/TSB is documented consistently in three places (code,
README, CLAUDE.md) and someone unfamiliar with PMC methodology could follow the exponential
averaging from the code comments alone.

**Gap: TSS/IF, the input to the PMC engine, is undocumented.** `src/lib/tss.ts` (73 lines) has
zero comments. `computeSimpleTSS`, `blockIF`, and `computeStructuredTSS` implement the standard
TrainingPeaks formula `duration_hours × IF² × 100`, but nothing in the file, README, or
CLAUDE.md ever states that "IF" means Intensity Factor, or explains why the intensity term is
squared (a deliberate quadratic penalty for high-intensity effort in the TrainingPeaks
methodology), or how swim TSS derives from a per-100m pace ratio. A reader can follow the *what*
of `calculateMetrics.ts` from in-repo comments alone, but must bring outside TrainingPeaks
domain knowledge to understand the *why* of `tss.ts`.

---

## 4. Edge function documentation

None of the 5 functions have a standalone README or header docstring describing request shape,
response shape, auth requirements, or error codes. All rely on inline step-marker comments
(e.g. `// ── 1. Parse request body ──`) that aid a top-to-bottom read but don't substitute for a
contract.

| Function | Verdict | Evidence |
|---|---|---|
| `ai-briefing` (368 lines) | Partially documented | Body destructured ad hoc at `index.ts:116`, no typed interface for the `mode: 'race_predictor'` branch (documented only in CLAUDE.md:146, not in the function); response shapes (`{narrative}`, `{briefing, generated_at, cached}`, `{error}`) only discoverable via grep of `JSON.stringify(...)` call sites (183, 202, 316, 357, 364) |
| `generate-plan` (325 lines) | Partially documented | Request destructure typed inline at `index.ts:95` (pins input shape via TS) but no doc comment; error responses (`Invalid sport`, `Invalid level`, `Rate limit exceeded...`) only discoverable by grepping `JSON.stringify({ error: ...` |
| `parse-plan` (277 lines) | Partially documented | Same pattern — typed destructure at `index.ts:94`, no docstring, error codes require reading the file |
| `strava-auth` (149 lines) | Undocumented | `const { code } = body` (line 38) has no type annotation at all; response/error shapes only visible by reading the whole file |
| `strava-sync` (322 lines) | Undocumented | No top-level doc; the Strava→Vexr sport-type mapping table (`mapStravaType`, `index.ts:29-40`) is domain knowledge buried in a private function with no explanatory comment |

`_shared/cors.ts` (24 lines) is short enough to read directly, but has no header explaining the
CORS policy intent beyond one inline comment on the Vercel-preview regex (line 12). No
`supabase/functions/*/README.md` exists anywhere.

**Verdict:** understanding any edge function's contract requires reading its full
implementation; none are documented independently of the code.

---

## 5. Stale TODO/FIXME/commented-out code

**TODO/FIXME/XXX/HACK markers: none found.** A repo-wide search across `src/`, `supabase/`,
and root docs turned up zero hits — a positive finding, no lingering markers to triage.

**Commented-out code blocks (3+ lines) in `.ts`/`.tsx`:** only one match,
`src/test/edge-helpers/aiBriefing.test.ts:8-10`, which on inspection is a 3-line explanatory
comment, not dead code — a false positive, not a real finding.

**Real dead-code-as-comments in `supabase-schema.sql`** (the canonical schema doc, so worth
flagging even though it's SQL, not application code):
- `supabase-schema.sql:33-44` — a full commented-out `create table strava_connections (...)`
  block ("Run this if the table doesn't already exist"). Not legacy — it's the closest thing to
  documentation for a table that only exists live (see §1) — but it means the schema file
  contradicts the project's own rule that schema changes are tracked as live SQL, not comments.
- `supabase-schema.sql:331-339` — commented-out storage bucket + RLS policies for avatar
  uploads, same pattern: real, shipped infra (avatar upload is in active use) represented only
  as an inert comment rather than tracked SQL.

**Stale prose (not code comments, but factually wrong text a maintainer should fix or
remove):**
- README.md:160 / roadmap.txt:88 — "264 tests across 26 files," wrong since the suite grew to
  275 tests / 27 files sometime after `297d096` landed on 2026-06-29 19:58. CLAUDE.md was
  patched; these two were not.
- CLAUDE.md:58-59 — the `components/dashboard/` file-structure claim from §1, stale since
  2026-05-15 and reintroduced 2026-06-29 by the very commit meant to fix such issues.

Neither is old in absolute terms (~1-2 days as of 2026-07-01), but both are concretely wrong
right now and cost-free to fix.

---

## Recommendations, roughly in priority order

1. Reconcile `supabase-schema.sql` with the live database: add `profiles.max_hr`,
   `profiles.onboarding_completed`, the 5 missing `workouts` columns, and uncomment
   `strava_connections` + the avatar storage policies as live `CREATE TABLE`/`CREATE POLICY`
   statements. This is the highest-value fix — it's the one gap that breaks a fresh setup
   silently rather than loudly.
2. Fix README:93-98 to drop `VITE_STRAVA_CLIENT_SECRET` and add `STRAVA_CLIENT_ID` to the
   edge-function secrets list (README:126-129).
3. Remove the stale `dashboard/` line from CLAUDE.md:58-59 and correct the test count in
   README.md:160 / roadmap.txt:88 to 275/27.
4. Add a short header comment to each edge function (`supabase/functions/*/index.ts`) stating
   request body shape, success response shape, and error codes — even 10 lines per function
   would remove the "must read full implementation" gap in §4.
5. Add a one-line comment to `src/lib/tss.ts` defining IF (Intensity Factor) and noting the
   quadratic-penalty rationale for `IF² × 100`, matching the documentation quality already
   present in `calculateMetrics.ts`.
