# Deployment & Production-Readiness Review

Scope: not "does it build," but "does it survive being live" — env var handling, environment
separation, observability, rollback safety, and deploy gating. Checked the actual repo state
(`vercel.json`, `README.md`, `package.json`, `.env.local`, `supabase/functions/*`) plus the live
Supabase project via MCP (`list_migrations`, `get_advisors`).

**Bottom line: Vexr is ready to compile and ready to demo, not ready for unattended production.**
There's no CI, no environment separation, no error monitoring, and schema history isn't fully
captured in version control. For a solo project at pre-launch/early-user scale this is a normal
place to be — but each gap below is a specific, plausible way a bad deploy or a missing secret
turns into either silent data risk or a support ticket with no diagnostic trail.

## 1. Environment variables — documented but unvalidated, fails silently on the frontend

**Frontend (Vite, `VITE_*`, consumed at build time into the client bundle):**

| Var | Used in |
|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts:3`, `StravaContext.tsx`, `ImportModal.tsx`, `GeneratePlanModal.tsx`, `RacePredictor.tsx`, `StravaCallback.tsx`, `AICoach.tsx` |
| `VITE_SUPABASE_ANON_KEY` | same call sites |
| `VITE_STRAVA_CLIENT_ID` | `ProfileSettingsModal.tsx:1061`, `Onboarding.tsx:225` |
| `VITE_STRAVA_REDIRECT_URI` | `ProfileSettingsModal.tsx:1061`, `Onboarding.tsx:225` |

**Edge functions (Supabase secrets, server-side only):**

| Var | Used in |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | auto-injected by Supabase runtime, all 5 functions |
| `ANTHROPIC_API_KEY` | `ai-briefing`, `generate-plan`, `parse-plan` |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | `strava-auth`, `strava-sync` |
| `ALLOWED_ORIGIN` | all 5 functions, via `_shared/cors.ts` |

This list exists (README §2/§4) but there is **no `.env.example` file in the repo** — a fresh
clone has to reverse-engineer the full var list from the README prose, and if the README drifts
from the code (see below), there's no machine-checked source of truth.

**README documentation bug:** README.md:96 tells a new dev to put `VITE_STRAVA_CLIENT_SECRET` in
`.env.local`. Any `VITE_`-prefixed var is inlined into the client bundle by Vite — a real Strava
client secret set this way would ship to every browser. It's not currently exploitable (grepped
`import.meta.env` across `src/` — nothing references `VITE_STRAVA_CLIENT_SECRET`, and the actual
`.env.local` doesn't set it), so this is a docs bug, not a live leak. But it's the kind of
copy-paste trap that bites the next person who follows the README literally. Fix: delete that line
from README §2 — the secret only belongs in Supabase edge function secrets (README §4, which
already has it correctly).

**Startup failure mode — fails confusingly, not loudly:**

```ts
// src/lib/supabase.ts
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

No presence check. If `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing on a Vercel deploy
(unset, misspelled, or forgotten for a new preview environment), `createClient` throws during
**module evaluation** — before `main.tsx` calls `createRoot(...).render(...)`. `ErrorBoundary`
(`src/components/ErrorBoundary.tsx`) only catches errors thrown during React render/lifecycle; a
throw at import time happens before React ever mounts, so the boundary never sees it. Net result:
blank white screen, no user-facing message, nothing in Sentry (there is none — see §3), only a
stack trace in the browser console that a real user will never open. The same class of gap exists
for `VITE_STRAVA_CLIENT_ID`/`VITE_STRAVA_REDIRECT_URI`, just lower blast radius — Strava connect
button silently builds a broken OAuth URL instead of crashing the app.

Edge functions are better: `ANTHROPIC_API_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` are all
explicitly checked with `if (!x) throw new Error(...)` (`ai-briefing/index.ts:138`,
`strava-auth/index.ts:49-50`) and return a real error to the caller instead of failing opaquely.
`SUPABASE_URL`/`SUPABASE_ANON_KEY` use a bare `!` non-null assertion with no check, but those are
auto-injected by the Supabase runtime for every function, not user-supplied, so the risk there is
close to zero.

**Recommendation:** add a `.env.example` (frontend vars only — never put edge function secrets in
a file that could get committed), and add one `if (!supabaseUrl || !supabaseAnonKey) { document.body.innerHTML = ...; throw ... }`
style guard at the top of `src/lib/supabase.ts` so a misconfigured deploy shows a visible message
instead of a blank page.

## 2. Environments — one Supabase project, no local/staging/production split

There is exactly one Supabase project (`fsskwaazmoidayqtsipy`), and it is production. This is
already explicit in `CLAUDE.md`: *"There is no separate dev/staging project — `apply_migration`
and `execute_sql` act directly on the live project."* Confirmed against the live project: **1**
row in `list_migrations` (`20260629082412_fix_rls_perf_security_and_indexes`) against **16**
tables in `supabase-schema.sql` — the schema was substantially built by hand (SQL editor /
`execute_sql`) before migration tracking started, so there is no migration history that
reconstructs the current schema from empty. `supabase-schema.sql` is the actual source of truth,
maintained by hand and by convention (per `CLAUDE.md` + your own memory note requiring it updated
before every commit), not by replaying migrations.

Practical consequences:
- **Local development runs against production data.** `npm run dev` connects to whatever
  `VITE_SUPABASE_URL` is in `.env.local`, which is the same URL Vercel production uses. There is
  no local Supabase stack (`supabase start`) configured or documented — README §3 says "create a
  new Supabase project," implying each dev would spin up their own, but nothing enforces or scripts
  that, and this session's own `.env.local` points at the single live project.
- **Any `execute_sql` or `apply_migration` run from Claude Code — including exploratory ones
  during a review or a debugging session — hits production data directly**, no matter whether the
  intent was "just checking." `CLAUDE.md` already gates destructive-looking calls behind a
  confirm-first rule, which is the right mitigation given there's no sandbox to fall back on.
- **A fresh clone can't spin up a matching environment from source alone.** `supabase-schema.sql`
  should be replayable end-to-end (README §3 says "Run the SQL schema... in the SQL editor"), but
  it isn't validated by CI against a fresh database (see §5), so schema drift between what's in the
  file and what's actually live would only surface the next time someone tries a from-scratch setup.

**Recommendation:** not urgent to stand up a full staging project for a solo pre-launch app — the
cost (Supabase project, secrets, Strava OAuth app duplicate) is real and the current confirm-first
discipline is a reasonable stopgap. Worth doing before onboarding real users at any volume: at
minimum, a local Supabase stack (`supabase start`, Docker-based, free) so day-to-day dev/debugging
doesn't touch prod rows at all, reserving the live project for actual deploys.

## 3. Monitoring / error tracking — none

Grepped for Sentry, Bugsnag, Rollbar, Datadog, LogRocket, and generic "error tracking" across the
repo: zero matches. The only error-visibility mechanisms that exist are:

- `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) — catches React render errors and shows a
  reload prompt, but doesn't report anywhere; the error is gone once the user reloads.
- `console.log`/`console.error` calls scattered through edge functions (e.g. `strava-auth`'s
  `[strava-auth] ...` logs), visible only via `get_logs` / Supabase dashboard, and only if someone
  goes looking.
- Whatever Vercel's own build/runtime logs capture for the frontend — not application errors, just
  deploy and serverless-function-level failures.

**There is currently no path from "a production bug just happened" to "Jacob finds out."** A
runtime exception in a component outside any try/catch, a failed edge function invocation, an
unhandled promise rejection in `StravaContext`'s auto-sync — all of these are invisible until a
user hits the bug and reports it, if they bother to. Given the app is pre-monetization/solo-run,
that's a real but bounded risk today; it stops being bounded the moment there's a paying tier,
since a silently-failing Strava sync or AI briefing becomes a churn reason nobody hears about.

**Recommendation:** Sentry's free tier covers this well and fits the stack directly — a browser
SDK wrapping `ErrorBoundary` plus `Sentry.captureException` in each edge function's catch block
would close this gap in under an hour of work. Not urgent to do today, but it should land before
any paid tier ships, since paying users churning silently is a materially worse failure mode than
free users doing so.

## 4. Rollback — Vercel is safe, Supabase schema changes are not

**Vercel (frontend):** low risk. Vercel deployments are immutable and atomic; rolling back is a
one-click "promote a previous deployment" action in the dashboard, and `vercel.json` here is
minimal (just an SPA rewrite rule) with nothing deploy-specific to worry about.

**Supabase (schema):** the actual risk. Two compounding issues:

1. **Forward-only migrations, no down-migration convention.** `apply_migration` (per `CLAUDE.md`'s
   own workflow rule) is used for all DDL, but nothing in the repo defines or requires a paired
   rollback migration. If a migration that alters or drops a column ships with a bug, undoing it
   means hand-writing a reverse migration under pressure, not running a known-good rollback script.
   `supabase-schema.sql:176` already has one real example of this shape —
   `drop constraint if exists training_sessions_plan_id_fkey` as part of an idempotent
   re-definition — which is fine as a "make this script re-runnable" pattern, but it's not a
   safety net for a *bad* migration; it's just how the file re-applies itself.
2. **Only 1 of the schema's ~16 tables' worth of DDL exists as an actual migration** (see §2) — the
   rest lives only in `supabase-schema.sql` as a point-in-time snapshot maintained by hand. That
   means Supabase's own migration history can't be used to diff "what changed" or replay to an
   earlier schema state; `supabase-schema.sql` plus git history is the only record, and it's only
   as accurate as the discipline of updating it on every change (which `CLAUDE.md` mandates, but is
   a process rule, not a technical guarantee).

Data-level rollback (bad `UPDATE`/`DELETE` via `execute_sql`) has no safety net beyond Supabase's
standard point-in-time recovery (PITR), if enabled on the project's plan — worth confirming it is,
since that's the only real undo button for a destructive data mistake once it's committed.

**Recommendation:** the existing `CLAUDE.md` rule (confirm before any migration that alters/drops
existing columns/tables, or any data-mutating `execute_sql`) is the right control for a solo
project and should stay the primary defense — it's cheaper than building a formal down-migration
system. Two low-cost additions worth it before scaling up schema changes: (a) confirm PITR / daily
backups are on for the project (Supabase dashboard, not code), and (b) for any migration that
drops or alters a column going forward, write the reverse `ALTER` as a comment in the same
migration file so a rollback isn't invented from scratch during an incident.

## 5. CI — none; deploy is fully automatic and fully unguarded

There is no `.github/workflows/` directory and no CI config of any kind in the repo. `package.json`
scripts:

```json
"dev": "vite",
"build": "tsc -b && vite build",
"lint": "eslint .",
"preview": "vite preview",
"test": "vitest run",
"test:watch": "vitest"
```

`npm run build` does run `tsc -b` first, so **type errors do block a Vercel deploy** — Vercel's
build step is `build`, and a failing `tsc -b` fails the build, which fails the deploy. That's the
one real gate that exists today, and it's a side effect of the build command, not an intentional
CI check.

**Nothing runs `npm test` or `npm run lint` before a deploy.** README.md:160 states 264 tests
across 26 test files exist and pass locally, which is a real, meaningful test suite — but per
`vercel.json` / README §"Deployment", the flow is "Vercel auto-deploys on every push to main." A
commit with passing types but a broken `calculatePMC` edge case, a failing `WorkoutsContext` test,
or a lint error introducing an actual bug (unused var masking a real bug, etc.) will deploy to
production untested. The only backstop is running tests manually before pushing, which is a
process discipline, not a guardrail.

**Recommendation:** this is the highest-value, lowest-cost fix in this whole review — a GitHub
Actions workflow that runs `npm test` and `npm run lint` on every push/PR to `main`, blocking merge
(or at minimum posting a status check) on failure, is maybe 15 lines of YAML given the test suite
already exists and passes. It doesn't need to block Vercel's own deploy (that's a bigger lift
involving Vercel's GitHub integration settings), but having a red X on a broken commit before it's
live is a meaningfully different failure mode than finding out from a user.

## Summary

| Area | State | Risk if unaddressed |
|---|---|---|
| Env vars | Documented in README, not validated at runtime, one docs bug (`VITE_STRAVA_CLIENT_SECRET`) | Blank-screen prod outage on a misconfigured deploy, with zero diagnostic trail |
| Environments | Single Supabase project for local + prod | Dev/debugging work can touch live user data |
| Monitoring | None | Bugs are invisible until self-reported by users |
| Rollback | Vercel: safe/atomic. Supabase: forward-only, thin migration history | A bad schema change has no scripted undo |
| CI | None — type-check happens incidentally via the build step; tests/lint never gate a deploy | A red test suite can still ship to production |

None of this is unusual for a solo pre-launch project, and the existing `CLAUDE.md` confirm-first
rule around destructive Supabase operations is already doing real work as a manual safety net. The
one item worth prioritizing before real user growth: **CI running the existing test suite on push**
— the tests already exist, they're just not load-bearing yet.
