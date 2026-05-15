# Handoff: Social Page

## Overview
A new **Social** page for the VEXR training app. Athletes can follow each other, react to workouts with kudos, comment on activities, compete on a weekly behaviour-based leaderboard, and discover new athletes to follow.

## About the Design Files
`Social.html` is a **high-fidelity design prototype** built in HTML/React — a reference for intended look and behaviour, not production code. Your task is to **recreate this design as a TypeScript/React page** inside the existing VEXR codebase, following all established patterns (Supabase, existing contexts, `COLORS` tokens, etc.).

## Fidelity
**High-fidelity.** Uses VEXR's exact colour tokens, typography, card patterns, and interaction styles. Recreate pixel-accurately using the codebase's existing design system.

---

## File to Create
```
src/pages/Social.tsx
```

Register in `src/App.tsx` at `/social` (lazy-loaded, same pattern as other pages).

Add to sidebar nav in `src/components/layout/Sidebar.tsx`:
```ts
{ path: '/social', icon: '⊛', label: 'Social' }
```

Add to `pageTitles` in `src/App.tsx`:
```ts
'/social': { title: 'Social', subtitle: 'Your training community' },
```

---

## Page Layout

Standard shell: sidebar + scrollable content area, `padding: '28px 32px'` desktop / `'20px 16px'` mobile.

### Tab Bar
Three tabs below the page title, tab underline style:
- **Feed** — activity stream
- **Leaderboard** — weekly score rankings
- **Discover** — suggested athletes + search

Active tab: `color: COLORS.accent`, `borderBottom: 2px solid COLORS.accent`
Inactive: `color: COLORS.muted`, no border

---

## Tab 1: Feed

### Active This Week Strip (toggleable via user setting)
Horizontal scroll row of athlete avatar circles (`width/height: 46px, borderRadius: 50%`).  
Each has a sport-colour ring border (`border: 2px solid [sportColor]90`) and a small sport emoji dot in the bottom-right corner (`width: 13px, height: 13px, border: 2px solid COLORS.bg`).  
Below each circle: athlete's first name in `fontSize: 9, color: COLORS.muted`.

### Activity Card
`background: COLORS.card, border: 1px solid COLORS.border, borderRadius: 13`  
Top accent bar: `height: 2, background: [sportColor], opacity: 0.7`

**Header row** (`padding: 15px 18px`):
- Avatar (40px) + gradient matching athlete colours
- Name (`fontSize: 13, fontWeight: 700`) + sport badge (pill: `background: [sportColor]20, color: [sportColor], fontSize: 10, fontWeight: 700`)
- Timestamp (`fontSize: 11, color: COLORS.muted`)
- **Follow / Following** button (right-aligned):
  - Unfollowed: `background: COLORS.accent+'15', border: 1px solid COLORS.accent+'55', color: COLORS.accent`
  - Following: `background: none, border: 1px solid COLORS.border, color: COLORS.muted`

**Workout title** (`fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em'`)  
Optional workout note: italic, `fontSize: 12, color: COLORS.muted`, left border `2px solid COLORS.subtle`

**GPS Map Placeholder** (optional, toggleable):
- `height: 130px, background: COLORS.subtle, borderRadius: 9`
- Diagonal stripe SVG pattern (`COLORS.border` lines on `COLORS.subtle` bg)
- Bezier curve SVG path in sport colour with glow `drop-shadow`
- Start/end dot circles
- "GPS Route" label top-right: `background: COLORS.card+'cc', fontSize: 9`

**Stats row** — 4-column grid, `borderTop` and `borderBottom: 1px solid COLORS.border`:
- Each cell: value in `DM Mono, fontSize: 15, fontWeight: 800` + unit `fontSize: 10`
- Label: `fontSize: 9, textTransform: uppercase, letterSpacing: 0.06em, color: COLORS.muted`
- Vertical dividers between cells

**Action row** (`padding: 10px 14px`):
| Button | Icon | Behaviour |
|--------|------|-----------|
| Kudos | 💪 + count | Toggle kudos on/off. Active: sport-colour bg tint + border. Count updates live. Pop animation on activate. |
| Comment | 💬 + count | Toggle comment thread. Active: `COLORS.accentDim` bg + accent border. |
| Segments | ⟁ Segments | Decorative — future feature |
| Share | ↗ | Decorative |

**Comment thread** (shown when expanded):
- `borderTop: 1px solid COLORS.border, padding: 12px 16px`
- Each comment: 28px avatar + author name (`fontSize: 12, fontWeight: 700`) + timestamp + comment text (`fontSize: 12, color: COLORS.muted`)
- Input row: current user's 28px avatar + text input + send button (`→`)
- Send on Enter key or button click

---

## Tab 2: Leaderboard

### Score Formula
**Weekly Score = 40% Consistency + 30% Quality Execution + 20% Aerobic Efficiency + 10% Recovery Compliance**

All component scores are 0–100. Composite score = weighted sum.

Component colours:
| Component | Weight | Colour |
|-----------|--------|--------|
| Consistency | 40% | `COLORS.green` #00ff9d |
| Quality Execution | 30% | `COLORS.orange` #ff6b2b |
| Aerobic Efficiency | 20% | `COLORS.accent` #00e5ff |
| Recovery Compliance | 10% | `COLORS.purple` #a855f7 |

### Grade thresholds
| Score | Grade | Colour |
|-------|-------|--------|
| ≥ 90 | Elite | #FFD700 |
| ≥ 80 | Advanced | `COLORS.green` |
| ≥ 70 | Solid | `COLORS.accent` |
| ≥ 55 | Building | `COLORS.orange` |
| < 55 | Beginner | `COLORS.muted` |

### Formula Legend Card
Segmented bar (`height: 8px, borderRadius: 5`) split by weighted width for each component. Legend below with coloured squares + `"40% Consistency"` etc.

### Leaderboard Rows
Each row is a **clickable button** that expands an inline breakdown. Rows:

- Rank (medal emoji for top 3, number for rest)
- Avatar (34px)
- Name + sport
- 4 mini-bars stacked (one per component): `height: 3px` each with coloured 8px square label, fills to component score %
- Composite score: `fontSize: 20, fontWeight: 900, DM Mono` in grade colour
- Grade label: `fontSize: 9, fontWeight: 700`
- Weekly delta: `+N` green / `-N` orange, `fontSize: 11, DM Mono`

Current user row: `background: COLORS.accentDim`, name in `COLORS.accent`

**Expanded breakdown** (inline below row, `background: COLORS.surface`):
4-column grid of mini-cards, one per component:
- Top accent bar in component colour
- Component name label
- Score value: `fontSize: 22, fontWeight: 900` in component colour
- Weighted points: `+N pts (X% weight)`
- Progress bar

### Your Score Card (bottom)
- Composite score `fontSize: 28` + grade + rank
- 4 horizontal bars (full width), one per component
- Width = component score %, colour = component colour
- Each row: label (130px) + bar + score value + weighted pts
- Tip text: personalised coaching insight about highest-leverage improvement

---

## Tab 3: Discover

### Suggested Athletes Grid
2-column grid of athlete cards:
- Avatar (42px) + name + sport
- Key metric (FTP / pace / CSS) in `DM Mono, fontSize: 16, fontWeight: 800`
- Metric label + follower count
- Follow / Following toggle button (full width, bottom of card)

### Find Athletes
Search input + button at bottom of the tab.

---

## Data Model (Supabase)

### `social_follows`
```sql
create table social_follows (
  follower_id uuid references auth.users not null,
  following_id uuid references auth.users not null,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);
alter table social_follows enable row level security;
create policy "Users manage own follows" on social_follows
  for all using (auth.uid() = follower_id);
```

### `activity_kudos`
```sql
create table activity_kudos (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references workouts not null,
  user_id uuid references auth.users not null,
  created_at timestamptz default now(),
  unique (workout_id, user_id)
);
alter table activity_kudos enable row level security;
create policy "Users manage own kudos" on activity_kudos
  for all using (auth.uid() = user_id);
```

### `activity_comments`
```sql
create table activity_comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references workouts not null,
  user_id uuid references auth.users not null,
  text text not null,
  created_at timestamptz default now()
);
alter table activity_comments enable row level security;
create policy "Followers can comment" on activity_comments
  for all using (auth.uid() = user_id);
```

### `weekly_scores`
```sql
create table weekly_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  week_start date not null,
  score int not null,
  consistency int not null,
  quality int not null,
  aerobic int not null,
  recovery int not null,
  unique (user_id, week_start)
);
alter table weekly_scores enable row level security;
create policy "Users read own scores + followed athletes" on weekly_scores
  for select using (
    auth.uid() = user_id or
    exists (select 1 from social_follows where follower_id = auth.uid() and following_id = user_id)
  );
```

### Score Computation (edge function or cron)
Compute weekly on Sunday night per user:
```
score = ROUND(consistency * 0.40 + quality * 0.30 + aerobic * 0.20 + recovery * 0.10)
```

Component scoring logic (implement in edge function):
- **Consistency**: % of planned sessions completed that week × 100
- **Quality Execution**: average % of target TSS hit across completed sessions × 100
- **Aerobic Efficiency**: aerobic decoupling metric from long sessions (lower = better, normalised 0–100)
- **Recovery Compliance**: % of easy/rest days correctly executed × 100

---

## Design Tokens (from `src/lib/colors.ts`)
```ts
bg:        "#0a0c0f"
surface:   "#111318"
card:      "#161b22"
border:    "#1e2530"
accent:    "#00e5ff"   // active states, current user
green:     "#00ff9d"   // consistency, run
orange:    "#ff6b2b"   // quality execution, ride
purple:    "#a855f7"   // recovery, brick
text:      "#e8edf5"
muted:     "#5a6478"
subtle:    "#2a3040"
```

Typography:
- Body: `'Inter', 'Helvetica Neue', sans-serif`
- All numeric metrics: `'DM Mono', monospace`

---

## Workout Type Colours
```ts
run:   { icon: '🏃', color: COLORS.green  }
ride:  { icon: '🚴', color: COLORS.orange }
swim:  { icon: '🏊', color: COLORS.accent }
brick: { icon: '⚡',  color: COLORS.purple }
```

---

## Files in This Package
| File | Purpose |
|------|---------|
| `Social.html` | Full hi-fi prototype — open in a browser to see all interactions |
| `README.md` | This document |

---

## Notes for Claude Code
- The feed should query workouts from followed athletes via a join on `social_follows`
- Kudos and comment counts should be real-time (Supabase realtime subscriptions)
- Weekly scores should be precomputed server-side — don't compute them client-side in the feed
- The leaderboard row expansion uses local UI state only (no extra data fetching on expand)
- Active-this-week strip: query followed athletes who have at least 1 workout in the current ISO week
- The `isMobile` hook (`src/hooks/useIsMobile.ts`) collapses the feed to single column and hides map previews by default on mobile
- Use the same lazy-load import pattern as all other pages in `src/App.tsx`
