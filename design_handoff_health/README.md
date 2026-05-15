# Handoff: Health & Recovery Page

## Overview
A **Health & Recovery** page for VEXR that synthesises biometric data (HRV, RHR, sleep) with training load to produce a daily readiness decision, fatigue status, and personalised training recommendation. It also builds an adaptive recovery profile per session type, learned from the athlete's own physiological responses over time.

## About the Design Files
`Health.html` is a **high-fidelity design prototype** — open in a browser to see all interactions. Your task is to recreate it as a TypeScript/React page inside the existing VEXR codebase.

## Fidelity
**High-fidelity.** Recreate pixel-accurately using VEXR's existing design system.

---

## File to Create
```
src/pages/Health.tsx
```

Register in `src/App.tsx` at `/health`:
```ts
'/health': { title: 'Health & Recovery', subtitle: 'Daily readiness and recovery tracking' },
```

Add to sidebar in `src/components/layout/Sidebar.tsx`:
```ts
{ path: '/health', icon: '♡', label: 'Health' }
```

---

## Page Sections (top to bottom)

### 1. Alert Banner
Dismissible orange banners for exception conditions. Show when:
- HRV dropped >10% over any 5-day window
- RHR elevated >3 bpm above baseline for 3+ consecutive days
- Sleep < 6h for 2+ consecutive nights
- A:C ratio > 1.5

Style: `background: COLORS.orange+'10', borderLeft: 3px solid COLORS.orange`

---

### 2. Daily Readiness Hero (full width)
The primary output. 3-state decision with live subjective input:

**States:**
| State | Label | Emoji | Color |
|-------|-------|-------|-------|
| go | TRAIN NORMALLY | 🟢 | `COLORS.green` |
| modify | MODIFY SESSION | 🟡 | `#f5c518` |
| rest | REST TODAY | 🔴 | `COLORS.orange` |

**Readiness computation:**
```ts
function computeReadiness(fatigueInput: number): 'go' | 'modify' | 'rest' {
  const hrvDev = (todayHRV - hrvBaseline) / hrvBaseline * 100
  const rhrDev = todayRHR - rhrBaseline
  const sleepDev = lastNightSleep - sleepBaseline
  let score = 0
  if (hrvDev < -15) score += 3; else if (hrvDev < -8) score += 2; else if (hrvDev < -3) score += 1
  if (rhrDev > 4) score += 2; else if (rhrDev > 2) score += 1
  if (sleepDev < -1) score += 2; else if (sleepDev < -0.5) score += 1
  if (acRatio > 1.4) score += 2; else if (acRatio > 1.25) score += 1
  score += (fatigueInput - 3) * 0.8
  if (score >= 6) return 'rest'
  if (score >= 3) return 'modify'
  return 'go'
}
```

**Layout:** 3-column grid — status circle (80px) | label + summary + signal badges | subjective slider (1–5)

Signal badges: small pills showing HRV deviation %, RHR deviation, sleep hours deviation, A:C ratio. Coloured green/yellow/orange based on severity.

Subjective slider: `input[type=range]` min=1 max=5. Labels: "Very Fresh" → "Very Tired". Updates readiness status live.

---

### 3. Fatigue Synthesis + Training Recommendation (2-col, 58% / 42%)

**Fatigue Synthesis:**
5 factors rendered as labelled progress bars:
- HRV Status (green/orange)
- RHR (same)
- Sleep
- Training Load
- Subjective (from slider)

Each: icon + label + status word + progress bar (% fill = signal health) + plain text explanation

Fatigue status badge: `Low Fatigue` / `Moderate Fatigue` / `High Fatigue / Overreaching Risk`

**Training Recommendation:**
Cards for each recommendation option (Option A / Option B / Avoid). "Avoid" card has orange border tint. Recommendations change based on readiness state.

---

### 4. HRV Trend + Sleep Analysis (2-col, 58% / 42%)

**HRV Card:**
- SVG line chart, 7 or 14 days (user toggle)
- Dashed baseline line
- Area fill with gradient
- Terminal dot on current value
- Stats: Baseline / Deviation % / 7d Trend (Improving/Stable/Declining)
- Interpretation text

**Sleep Card:**
- SVG bar chart, 7 days
- Bar colour: green if ≥ baseline, yellow if slightly below, orange if < 6.5h
- Dashed baseline line
- Stats: Target / 7d Avg / Sleep Debt / Quality

---

### 5. RHR + Training Load Balance (2-col, 50% / 50%)

**RHR Card:** Same pattern as HRV card. Note: for RHR, "improving" = trending DOWN (lower is better). Invert the trend colour logic.

**Training Load Balance:**
- Horizontal gauge bar (0.5 to 2.0 scale), 4 colour zones
- Triangle marker positioned at current A:C ratio
- Zone colours: muted (undertrain) | green (optimal 0.8–1.3) | yellow (caution 1.3–1.5) | orange (overreaching >1.5)
- Stats: Acute TSS (5d) / Chronic TSS (28d) / A:C Ratio

---

### 6. Adaptive Recovery Profile + Readiness Drift (2-col, 58% / 42%)

**Adaptive Recovery Profile:**

Top section — "Currently Recovering From" callout:
- Shows last session type, hours elapsed, expected recovery time
- Recovery % = weighted formula (see below)
- Progress bar coloured by recovery status

Recovery % formula:
```
recovery% = (hrv_return_pct × 0.60) + (rhr_return_pct × 0.25) + (time_pct × 0.15)

hrv_return_pct  = (todayHRV - postSessionHRV) / (baseline - postSessionHRV) × 100
rhr_return_pct  = (baseline - todayRHR) / (postSessionRHR - baseline) × 100
time_pct        = elapsed_hours / personal_avg_recovery_hours × 100
```

Fallbacks:
- No morning HRV → weight shifts: RHR 40%, time 35%, hrv 25%
- New session type (< 3 samples) → use population average recovery times
- Multiple stacked sessions → compound suppression (add post-session drops)

Bottom section — per-session-type table:
Each row: session type | plain-text note | recovery time | confidence badge

Confidence colours: `High → COLORS.green`, `Medium → #f5c518`, `Low → COLORS.orange`

**Readiness Drift (8-week):**
Two mini line charts stacked:
- Baseline HRV trend (8 weeks of weekly averages): upward = good → `COLORS.green`
- Baseline RHR trend (8 weeks): downward = good → `COLORS.accent`

Show delta over the period. Explanatory note about fitness trajectory vs short-term fatigue.

---

## Data Model (Supabase)

### `daily_checkins`
```sql
create table daily_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  date          date not null,
  hrv_ms        int,
  rhr_bpm       int,
  sleep_hours   numeric(4,2),
  sleep_quality int,           -- 0–100, from device if available
  fatigue_input int,           -- 1–5 subjective slider
  source        text,          -- 'garmin' | 'apple' | 'whoop' | 'oura' | 'manual'
  created_at    timestamptz default now(),
  unique (user_id, date)
);
alter table daily_checkins enable row level security;
create policy "Users manage own checkins" on daily_checkins
  for all using (auth.uid() = user_id);
```

### `recovery_profiles`
```sql
create table recovery_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  session_type     text not null,
  avg_hrv_drop_pct numeric(5,2),
  avg_recovery_h   numeric(5,1),
  sample_count     int default 0,
  confidence       text generated always as (
    case when sample_count >= 6 then 'High'
         when sample_count >= 3 then 'Medium'
         else 'Low' end
  ) stored,
  updated_at       timestamptz default now(),
  unique (user_id, session_type)
);
alter table recovery_profiles enable row level security;
create policy "Users read own profile" on recovery_profiles
  for select using (auth.uid() = user_id);
```

---

## Data Sources

| Signal | Source |
|--------|--------|
| HRV | Garmin Health API, Apple HealthKit, Whoop API, Oura API, or manual entry |
| Resting HR | Same as above |
| Sleep duration/quality | Same as above |
| Training load (A:C) | Computed from existing `workouts` table — already in VEXR |
| Subjective fatigue | In-page slider, stored in `daily_checkins` |

**Recommended integration priority for triathlete audience:**
1. Manual entry (day 1 — no integration needed)
2. Garmin Connect Health API (highest adoption in triathlon)
3. Apple HealthKit (via iOS app wrapper)
4. Whoop / Oura (optional, same schema)

---

## Design Tokens
```ts
COLORS.green    // HRV, sleep good, optimal load
COLORS.orange   // warnings, alerts, rest state
COLORS.accent   // RHR drift chart, info
COLORS.purple   // sleep bars
#f5c518         // yellow — modify state, medium confidence, caution
```

---

## Files in This Package
| File | Purpose |
|------|---------|
| `Health.html` | Full hi-fi prototype — open in browser |
| `README.md` | This document |

---

## Notes for Claude Code
- The readiness computation runs client-side from today's `daily_checkins` row — no server computation needed
- Recovery % for the adaptive profile requires the last session's post-workout HRV reading — store this when a workout is logged (add `post_workout_hrv` column to `workouts` table)
- Baseline values (28-day avg HRV, 28-day avg RHR, 28-day avg sleep) should be computed server-side as a scheduled function and stored — don't recompute on every page load
- The 8-week drift charts need weekly aggregates — add a `weekly_health_summaries` materialised view or compute on the server
- HRV/RHR charts use SVG with `preserveAspectRatio="none"` — match this exactly for responsive scaling
- Use `isMobile` hook to stack columns on mobile
