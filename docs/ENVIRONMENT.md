# Environment Variables

Single source of truth for every environment variable Vexr uses, across both places it runs:
**Vercel** (frontend, `VITE_*`, baked into the client bundle at build time) and **Supabase**
(edge function secrets, server-side only, never shipped to the browser). See
[`docs/review/11-deployment.md`](review/11-deployment.md) §1 for the audit that produced this doc.

Never mix the two groups up: a `VITE_`-prefixed var is public (visible in browser dev tools) the
moment it's built, so it must never hold a secret. Anything in the Supabase table below must never
be prefixed `VITE_` or referenced from `src/`.

## Vercel / frontend (`VITE_*`)

Set these in the Vercel project's Environment Variables settings for production/preview, and in
`.env.local` (gitignored — copy from `.env.example`) for local development.

| Var | Required | Used in | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | `src/lib/supabase.ts`, `StravaContext.tsx`, `ImportModal.tsx`, `GeneratePlanModal.tsx`, `RacePredictor.tsx`, `StravaCallback.tsx`, `AICoach.tsx` | App throws a visible "Configuration error" at startup and refuses to render if missing — see `src/lib/supabase.ts`. |
| `VITE_SUPABASE_ANON_KEY` | Yes | same call sites | Same startup check as above. |
| `VITE_STRAVA_CLIENT_ID` | No | `ProfileSettingsModal.tsx`, `Onboarding.tsx` | App still boots without it; the "Connect Strava" button just builds a broken OAuth URL. |
| `VITE_STRAVA_REDIRECT_URI` | No | `ProfileSettingsModal.tsx`, `Onboarding.tsx` | Must match the callback URL registered in the Strava API app settings for the target domain. |
| `VITE_SENTRY_DSN` | No | `src/lib/sentry.ts` | Frontend error tracking. Unset = no-op (no Sentry account required to run the app). |

**Never set `VITE_STRAVA_CLIENT_SECRET`** — it's a server-side-only secret (see the Supabase table
below); a `VITE_`-prefixed version would ship it to every browser.

## Supabase / edge functions

Set with `supabase secrets set VAR=value`, or via the Supabase dashboard (Edge Functions →
Secrets). Never put these in a frontend `.env` file.

| Var | Required | Used in | Notes |
|---|---|---|---|
| `SUPABASE_URL` | Auto | all 6 functions | Injected automatically by the Supabase runtime for every function — never set manually. |
| `SUPABASE_ANON_KEY` | Auto | all 6 functions | Same — auto-injected. |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | `_shared/rateLimit.ts` (all 6 functions, via `checkRateLimit`/`releaseRateLimit`) | Auto-injected. Used only for the `api_rate_limits` service-role client, scoped to that one table. |
| `ANTHROPIC_API_KEY` | Yes | `ai-briefing`, `race-predictor`, `generate-plan`, `parse-plan` | Explicitly checked (`if (!x) throw`) — these functions fail loudly, not silently, if unset. |
| `STRAVA_CLIENT_ID` | Yes | `strava-auth`, `strava-sync` | Explicitly checked at request time. |
| `STRAVA_CLIENT_SECRET` | Yes | `strava-auth`, `strava-sync` | Server-side only — never in a `VITE_` var. |
| `ALLOWED_ORIGIN` | No | all 6 functions, via `_shared/cors.ts` | Comma-separated allowed browser origins for CORS. If unset, only localhost dev origins and `*.vercel.app` previews are allowed (fails closed — see `cors.ts`). Bearer-JWT auth is the real security boundary regardless; this only controls which origins can read the response. |
| `SENTRY_DSN` | No | `_shared/errorTracking.ts` (all 6 functions) | Edge function error tracking. Unset = no-op. |

## Adding a new variable

1. Add it to this table (correct group — Vercel vs Supabase).
2. Frontend: add it to `.env.example` with a blank/placeholder value.
3. If it's required for the app to function at all (not just one feature), add a startup check
   that names the missing variable explicitly — don't let it fail later with a confusing error.
   `src/lib/supabase.ts` is the existing pattern to follow.
