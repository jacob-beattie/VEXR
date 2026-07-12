# VEXR

### Train. Track. Perform.

A modern endurance training platform built for triathletes, cyclists, runners and swimmers. Vexr gives athletes the analytics and AI coaching tools previously only available to professional athletes.

---

## What is Vexr?

Vexr is a TrainingPeaks alternative built with a focus on:

- **Better UX** — clean, fast, mobile-first design
- **AI coaching** — personalised weekly briefings powered by Claude
- **Automatic sync** — connect Strava and never log manually again
- **Real metrics** — accurate CTL/ATL/TSB calculations for fitness tracking

---

## Features

### Core

- 📅 **Training Calendar** — month and week view, multi-workout days, planned vs completed, drag-and-drop rescheduling
- 📊 **Performance Dashboard** — personalised greeting, CTL/ATL/TSB stat cards with fitness area chart, weekly load, coming up, AI coach teaser, and season goals
- 📈 **Analytics** — fitness/fatigue/form chart, sport breakdown, volume trends, training monotony, power curve, pace curve, heart rate zones
- 🏋️ **Workout Logger** — simple and structured mode with interval builder, auto-TSS calculation
- 🥗 **Nutrition** — daily calorie/macro/hydration tracking, meal log, SVG calorie ring, workout fuel guide, editable targets, custom food database
- 📚 **Workout Library** — save and reuse workout templates
- 🗓️ **Training Plans** — import plans from PDF/HTML/text, AI-parsed sessions, conflict detection, calendar sync
- 🤖 **AI Plan Generator** — describe your race and fitness, Claude builds a full periodised training plan from scratch

### AI

- 🤖 **AI Coach** — weekly briefings powered by Claude, personalised to your CTL/ATL/TSB and race goal
- 🏁 **Race Predictor** — finish time estimates for running, cycling, swimming and triathlon based on your FTP, threshold pace and CSS
- ✦ **Smart Recommendations** — training phase detection, compliance tracking, CTL trend analysis

### Sync & Data

- 🔄 **Strava Sync** — auto-import workouts with HR, power, pace, distance and elevation
- 📏 **Benchmark Tracking** — FTP, run pace and CSS history with trend charts
- 🎯 **Training Zones** — all zones auto-calculated: cycling from FTP, running from threshold pace, swimming from CSS, heart rate from max HR

### UX

- 📱 **Mobile First** — fully responsive, bottom nav, touch-friendly modals
- 🌙 **Dark Mode** — always dark, optimised for athlete use
- ⚡ **Real-time Sync** — Supabase realtime keeps all views in sync instantly
- 🔒 **Production Hardening** — React error boundaries (root + AI Coach route) wired to optional Sentry error tracking (frontend + all 6 edge functions, no-op unless `VITE_SENTRY_DSN`/`SENTRY_DSN` are set — see `docs/ENVIRONMENT.md`), password reset flow, per-user rate limiting on Strava and AI edge functions (with automatic refund if the Claude call itself fails), 30s fetch timeouts on all Claude API calls, page-level error/retry states across Nutrition, Dashboard widgets, and Profile Settings, fail-loud startup env var validation
- 🛡️ **Type Safety** — TypeScript strict mode, generated Supabase types wired into every query, runtime-validated AI plan JSON

---

## Tech Stack

| Layer          | Technology                               |
| -------------- | ---------------------------------------- |
| Frontend       | React + Vite + TypeScript                |
| Styling        | Inline styles with design system         |
| Charts         | Recharts                                 |
| Routing        | React Router v6                          |
| Backend        | Supabase (PostgreSQL + Auth + Realtime)  |
| Edge Functions | Supabase Edge Functions (Deno)           |
| AI             | Anthropic Claude API (claude-sonnet-4-6) |
| Deployment     | Vercel                                   |
| Testing        | Vitest + @testing-library/react (jsdom)          |
| Dev Tooling    | Supabase MCP (direct DB access in Claude Code) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase account
- A Strava API app (for sync)
- An Anthropic API account (for AI Coach)

### 1. Clone the repo

```bash
git clone https://github.com/jacob-beattie/vexr.git
cd vexr
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local`. See [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) for the full
list of every environment variable Vexr uses — both these frontend/Vercel vars and the Supabase
edge function secrets from step 4 below — in one place, including which are required.

Do **not** add a `VITE_STRAVA_CLIENT_SECRET` var here — any `VITE_`-prefixed variable gets bundled
into client-side JS by Vite, which would ship the Strava client secret to the browser. The client
secret is a server-side-only value; it's set as a Supabase Edge Function secret in step 4 below,
never in `.env.local`.

`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are required — the app fails loudly at startup with a
visible error naming the missing variable if either is absent, instead of a blank white screen.

### 3. Set up Supabase

- Create a new Supabase project
- Run the SQL schema from `supabase-schema.sql` in the SQL editor
- Enable Email auth in Authentication settings
- Disable email confirmations for local development

### 3a. Local development vs. production Supabase

`npm run dev` reads `.env.local`, which by default points at a **local** Supabase stack — not the
shared production project. This matters: without this split, every `npm run dev` session (and
every exploratory query run from Claude Code) hits real user data directly, since there's only one
Supabase project. See `docs/ENVIRONMENT.md` and `docs/review/11-deployment.md` §2 for the full
rationale.

To run against a local stack:

```bash
supabase start   # requires Docker — https://docs.docker.com/get-docker/
supabase status  # copy "API URL" and "anon key" into .env.local
supabase db reset  # (re)applies supabase/migrations/ + supabase/seed.sql to the local database
```

`supabase/migrations/20240101000000_initial_schema.sql` is a hand-kept copy of
`supabase-schema.sql` (the real source of truth) — see the comment at the top of that file for the
sync convention.

If you deliberately need to point local dev at the real production project (e.g. debugging a
production-only issue), copy the values from `.env.production.local` into `.env.local`, or run
`npm run build` locally — Vite loads `.env.production.local` automatically for a production-mode
build, so a real production build always uses real production credentials without touching
`.env.local`.

### 3b. (Optional) Connect Supabase MCP

For direct DB access from Claude Code, create `.mcp.json` in the repo root:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF"
    }
  }
}
```

This lets Claude run queries, apply migrations, check logs, and deploy edge functions without leaving the conversation. `.mcp.json` is gitignored — never commit it.

### 4. Set up Supabase Edge Function secrets

```bash
supabase secrets set STRAVA_CLIENT_ID=your_strava_client_id
supabase secrets set STRAVA_CLIENT_SECRET=your_strava_client_secret
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_api_key
```

`STRAVA_CLIENT_ID` is required — `strava-auth` throws at request time if it's unset. Optionally
set `ALLOWED_ORIGIN` (comma-separated list of allowed origins) to lock down CORS for production;
if unset, only `localhost`/`127.0.0.1` (any port) and `*.vercel.app` preview deployments are
allowed. Bearer-JWT auth inside each function is the real security boundary either way — this
only controls which browser origins can read the response. Optionally set `SENTRY_DSN` for edge
function error tracking (see §3 Monitoring below and `docs/ENVIRONMENT.md`). Full var list,
including the ones auto-injected by the Supabase runtime, is in
[`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

### 5. Deploy Edge Functions

```bash
supabase functions deploy strava-auth --no-verify-jwt
supabase functions deploy strava-sync --no-verify-jwt
supabase functions deploy ai-briefing --no-verify-jwt
supabase functions deploy race-predictor --no-verify-jwt
supabase functions deploy parse-plan --no-verify-jwt
supabase functions deploy generate-plan --no-verify-jwt
```

`--no-verify-jwt` is required because Supabase's runtime verifier only supports HS256 and this project uses ES256 JWTs. Auth is enforced inside each function handler via `supabase.auth.getUser()`.

### 6. Run locally

```bash
npm run dev
```

App runs at `http://localhost:5173`

---

## Testing

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

372 tests across 31 files using Vitest + @testing-library/react. Tests live in `__tests__/` directories beside the files they cover. The Supabase client is mocked via `src/test/mocks/supabase.ts` — a chainable, in-memory query builder that actually filters seeded rows and enforces row-level security (scoped to whichever user `setMockCurrentUser()` sets), rather than returning a canned response regardless of the query shape.

`.github/workflows/ci.yml` runs lint, type check, and the full test suite on every push/PR to `main` — a red test suite or a type error now shows as a failing check on the commit before it can reach production, instead of only surfacing after a manual `npm test` (or not at all). This does not block Vercel's own auto-deploy (a separate, bigger integration); it's a visible gate, not a hard stop, today.

---

## Database Schema

| Table                | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `profiles`           | User profile — name, sport, FTP, pace, CSS, race goal, max HR |
| `workouts`           | All workouts — completed and planned                  |
| `training_plans`     | Multi-week training blocks with import metadata       |
| `training_sessions`  | Individual sessions from imported plans               |
| `workout_library`    | Saved workout templates                               |
| `fitness_benchmarks` | FTP/pace/CSS history over time                        |
| `training_zones`     | Custom training zones per sport                       |
| `strava_connections` | Strava OAuth tokens                                   |
| `ai_briefings`       | Cached AI coaching briefings                          |
| `goals`              | Season goals — text, completed flag, per user         |
| `nutrition_logs`     | Daily food entries per user per meal                  |
| `nutrition_targets`  | Per-user calorie/macro targets                        |
| `hydration_logs`     | Daily hydration (litres) per user                     |
| `nutrition_custom_foods` | User-created food items                           |
| `food_database`      | Global shared food database (read-only)               |
| `api_rate_limits`    | Per-user rate limiting for Strava and AI edge functions |

---

## CTL/ATL/TSB Calculations

Vexr uses the standard Performance Management Chart (PMC) formulas:

```
CTL today = CTL yesterday + (TSS today - CTL yesterday) × (1 - e^(-1/42))
ATL today = ATL yesterday + (TSS today - ATL yesterday) × (1 - e^(-1/7))
TSB today = CTL today - ATL today
```

- **CTL** (Chronic Training Load) = Fitness — 42 day exponential weighted average
- **ATL** (Acute Training Load) = Fatigue — 7 day exponential weighted average
- **TSB** (Training Stress Balance) = Form — how fresh you are

Calculations start from your earliest workout and only include completed workouts (not planned).

---

## Deployment

### Vercel

1. Connect your GitHub repo to Vercel
2. Add all environment variables in Vercel project settings
3. Deploy — Vercel auto-deploys on every push to main

### Update Strava callback for production

In your Strava API settings update the callback domain to your Vercel domain.

### Update Supabase for production

In Supabase Authentication settings update the Site URL and add your Vercel URL to redirect URLs.

---

## Roadmap

See `roadmap.txt` for the full feature roadmap.

**Coming soon:**

- ~~Drag and drop calendar~~ ✅ shipped
- Garmin direct sync
- Whoop/Oura HRV integration
- Auto-TSS from plain English description
- Injury risk score
- Coach tier — manage multiple athletes
- Monetisation — free vs pro tiers

---

## Contributing

This is currently a solo project in active development. If you're an endurance athlete and want to give feedback or report bugs, open an issue on GitHub.

---

## License

MIT

---

Built with ♥ for endurance athletes by endurance athletes.
