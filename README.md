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
- 🔒 **Production Hardening** — React error boundary, password reset flow, per-user rate limiting on Strava and AI edge functions, 30s fetch timeouts on all Claude API calls

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

Create a `.env.local` file in the root:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_STRAVA_CLIENT_ID=your_strava_client_id
VITE_STRAVA_CLIENT_SECRET=your_strava_client_secret
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/strava/callback
```

### 3. Set up Supabase

- Create a new Supabase project
- Run the SQL schema from `supabase-schema.sql` in the SQL editor
- Enable Email auth in Authentication settings
- Disable email confirmations for local development

### 4. Set up Supabase Edge Function secrets

```bash
supabase secrets set STRAVA_CLIENT_SECRET=your_strava_client_secret
supabase secrets set ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 5. Deploy Edge Functions

```bash
supabase functions deploy strava-auth --no-verify-jwt
supabase functions deploy strava-sync --no-verify-jwt
supabase functions deploy ai-briefing --no-verify-jwt
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
