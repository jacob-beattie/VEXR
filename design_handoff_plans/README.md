# Handoff: Training Plans Page + Import Flow

## Overview
A **Training Plans** page for VEXR that lets athletes view, manage, and import structured training plans. The centrepiece is a multi-step **Import Modal** that accepts a plan as a PDF, HTML file, or pasted text, parses it, and presents a structured review screen before committing sessions to the calendar.

## About the Design Files
`Plans.html` is a **high-fidelity design prototype** — open in a browser to see all interactions and the full 3-step import flow. Your task is to recreate this as TypeScript/React pages inside the existing VEXR codebase, backed by Supabase.

## Fidelity
**High-fidelity.** The prototype uses VEXR's exact color tokens, typography, spacing, card patterns, and interaction styles. Recreate pixel-accurately using the existing design system (`src/lib/colors.ts`, existing component patterns, etc.).

---

## Files to Create / Modify

### New files
```
src/components/plans/ImportModal.tsx
src/components/plans/PlanCard.tsx
src/components/plans/ImportReviewScreen.tsx
```

### Modify existing
```
src/components/plans/PlansPage.tsx   ← replace current stub with new design
src/pages/Plans.tsx                  ← already wired; keep Supabase fetch logic
```

### Already registered
`/plans` route and sidebar nav entry (`≡ Training Plans`) already exist in `src/App.tsx` and `src/components/layout/Sidebar.tsx`.

---

## Page Layout

Uses VEXR's standard shell: sidebar + scrollable content area. Content padding: `32px 36px` desktop, `20px 16px` mobile.

### Header Row
- Left: title `"Training Plans"` (`fontSize: 22, fontWeight: 800`) + subtitle `"Manage and review your structured training blocks"` (`fontSize: 13, color: COLORS.muted`)
- Right: `"+ Import Plan"` button — **purple glow style** (see Button Styles below)

---

## Empty State

Shown when `plans.length === 0`.

Centred layout, `minHeight: 400`:
- Animated pulsing double-ring icon (CSS `animation: pulse-ring 3s ease-in-out infinite`), containing `≡` glyph
- Heading: `"Your Training Plans"` (`fontSize: 22, fontWeight: 800`)
- Subtext: `"Import a plan from your coach or build your own structured training block."` (`fontSize: 14, color: COLORS.muted, maxWidth: 280, lineHeight: 1.6`)
- CTA: `"Import Plan"` — purple glow button

---

## Plan Cards (Populated State)

Grid: `display: flex, flexDirection: column, gap: 14`. Each card:

```
background: COLORS.card
border: 1px solid COLORS.border
borderRadius: 14px
padding: 22px 24px
position: relative, overflow: hidden
```

**Top accent bar** (`height: 2, position: absolute, top 0, left 0, right 0`):
- Active: `linear-gradient(90deg, #9333ea, #00e5ff)` with glow
- Completed: `COLORS.green`
- Archived: `COLORS.subtle`

**Content layout:** `display: flex, justifyContent: space-between, alignItems: flex-start`

**Left section:**
- Plan name: `fontSize: 16, fontWeight: 800` + status badge inline
- Race info: `fontSize: 12, color: #f59e0b (amber), fontWeight: 600` — `⬡ {raceName} · {raceDate}`
- Progress bar: `maxWidth: 320, height: 5, background: COLORS.subtle, borderRadius: 4`. Fill:
  - Active: `linear-gradient(90deg, #9333ea, #00e5ff60)` with `boxShadow: 0 0 8px #9333ea90`
  - Completed: `COLORS.green`
  - Archived: `COLORS.muted`
- Progress label: `"Week X of Y · Z% complete"` in `DM Mono, fontSize: 10, color: COLORS.muted`

**Right:** Three-dot menu button (`⋯`), `fontSize: 18, color: COLORS.muted`.

### Status Badge
```
display: inline-flex, alignItems: center
padding: 3px 9px, borderRadius: 20px
fontSize: 10, fontWeight: 700
letterSpacing: 0.06em, textTransform: uppercase
fontFamily: DM Mono
```

| Status | Background | Color |
|--------|-----------|-------|
| active | `#9333ea25` | `#a855f7` |
| complete | `#00e5ff18` | `#00e5ff` |
| archived | `#ffffff0d` | `COLORS.muted` |

---

## Import Modal

Opens as a full-screen overlay (`position: fixed, inset: 0, background: rgba(0,0,0,0.6), backdropFilter: blur(6px), zIndex: 100`).

Modal box:
```
background: #0f1319
border: 1px solid COLORS.border
borderRadius: 18px
width: 680px (Steps 1–2) / 820px (Step 3)
maxHeight: 88vh
boxShadow: 0 32px 80px #00000088, 0 0 0 1px #9333ea18
animation: fadeSlideUp 0.25s ease
```

Click outside to dismiss.

---

### Step 1 — Upload

**Header:** `"Import Training Plan"` + `"Step 1 of 3 — Upload your plan"` subtext + `×` close button.

**Upload type tabs** (PDF / HTML / Text):
- `display: flex, borderBottom: 1px solid COLORS.border`
- Each tab: flex 1, `padding: 9px 0, textAlign: center, fontSize: 13, fontWeight: 600`
- Active tab: `color: COLORS.text` + `2px bottom border, color: #9333ea, boxShadow: 0 0 8px #9333ea`

**Drag-and-drop zone** (PDF and HTML tabs):
```
border: 2px dashed COLORS.subtle
borderRadius: 12px
padding: 40px 24px
textAlign: center
cursor: pointer
```
Hover / drag-over: `borderColor: #9333ea70, background: #9333ea08`

Contents: upload arrow icon + heading `"Drop your {TYPE} here"` + subtext + `"Browse files"` secondary button + size limit note.

**Text tab:** `<textarea>` with placeholder `"Paste your training plan here..."`, `rows: 10`, resizable.

**Date inputs** (`display: grid, gridTemplateColumns: 1fr 1fr, gap: 14`):
- "Plan Start Date" — `<input type="date">`
- "Race Date" — `<input type="date">`

Input style:
```
background: COLORS.bg
border: 1px solid COLORS.border
borderRadius: 8px, padding: 10px 14px
color: COLORS.text, fontSize: 13
focus: borderColor: #9333ea70
```

**Plan Name** (optional): `<input type="text">`, same style, placeholder `"e.g. Ironman 70.3 Build Phase"`.

**Footer:** Full-width `"Parse Plan →"` purple glow button, `padding: 14px`.

---

### Step 2 — Parsing

Replaces modal content entirely. `display: flex, flexDirection: column, alignItems: center, justifyContent: center, padding: 60px 40px, minHeight: 340`.

**Spinner:** 64×64 circle, `border: 3px solid #9333ea20, borderTop: 3px solid #9333ea`, `animation: spin 0.9s linear infinite`. Centre glyph `≡`.

**Sequential messages** — appear one at a time (~900ms apart):
1. `"Reading your plan..."`
2. `"Extracting sessions..."`
3. `"Mapping training zones..."`

Each appeared message:
- Small circle icon (`✓`, `background: #9333ea25, border: 1px solid #9333ea60, color: #9333ea`)
- Text: most recent = `color: COLORS.text, fontWeight: 600`; prior = `color: COLORS.muted`
- `animation: msgAppear 0.35s ease` (fade + slide from left)

Pending (next) message: pulsing empty circle + muted text preview.

**Progress bar:** `width: 280, height: 3, background: COLORS.subtle`. Fill advances `33% → 66% → 100%` as each message appears. Color: `linear-gradient(90deg, #9333ea, #00e5ff80)` with glow.

Auto-advance to Step 3 after ~3.2 seconds.

---

### Step 3 — Review

Modal widens to `820px`.

**Header:**
- Plan name (bold, `fontSize: 17`)
- Summary stats row: `{N} sessions · {N} weeks · {dateRange} · {raceName}` — each as `value (bold, DM Mono) + label (muted, small)`
- `×` close button

**Sport filter tabs** (`padding: 14px 28px, gap: 6`):

| Key | Label | Dot color |
|-----|-------|-----------|
| all | All | — |
| swim | Swim | `#38bdf8` |
| bike | Bike | `#4ade80` |
| run | Run | `#fb923c` |
| sc | S&C | `#a855f7` |
| brick | Brick | `#f59e0b` |

Tab style: `padding: 7px 14px, borderRadius: 8, fontSize: 12, fontWeight: 600`. Active: `background: #9333ea20, border: 1px solid #9333ea50, color: #9333ea`.

**Column headers** (above session list):
`Sport · Session · Date · Duration · Target · (conflict)`
`fontSize: 10, fontWeight: 700, color: COLORS.muted, letterSpacing: 0.08em, uppercase, DM Mono`

Grid: `24px 90px 1fr 90px 70px 110px 80px`

**Week rows** (collapsible):
```
display: flex, alignItems: center, gap: 8
padding: 10px 16px
background: #0d1017
borderRadius: 8, border: 1px solid COLORS.border
cursor: pointer
```
Contents: chevron (rotates 90° when open) + `"Week N"` label + session count (muted, DM Mono) + conflict badge if any (`⚠ N conflict`, amber).

**Session rows:**
```
display: grid
gridTemplateColumns: 24px 90px 1fr 90px 70px 110px 80px
alignItems: center, gap: 12
padding: 11px 16px
borderRadius: 8, border: 1px solid transparent
```
Hover: `background: #ffffff05, borderColor: COLORS.border`

Columns:
1. **Conflict icon** — `⚠` in amber if session has a conflict
2. **Sport tag** — coloured dot (8×8, with matching glow) + sport label in sport colour (`DM Mono, fontSize: 10, uppercase`)
3. **Title** — `fontSize: 13, fontWeight: 500`, truncated
4. **Date** — `fontSize: 11, color: COLORS.muted, DM Mono`
5. **Duration** — same style
6. **Target metric** — `fontSize: 11, color: COLORS.accent, DM Mono`, `background: #00e5ff10, borderRadius: 4, padding: 2px 7px`
7. **Conflict badge** — `"conflict"` pill in amber (only if conflicting)

**Footer:**
```
padding: 16px 28px
borderTop: 1px solid COLORS.border
display: flex, alignItems: center, justifyContent: space-between
```
- Left: conflict summary text — `"⚠ N conflicts detected — sessions overlap with existing calendar entries"` (`⚠` in amber)
- Right: `"Import N Sessions →"` purple glow button

---

## Button Styles

### Purple Glow Button (primary CTA)
```css
background: #9333ea;
border: none;
border-radius: 10px;
color: #fff;
font-weight: 700;
box-shadow: 0 0 18px #9333ea55, 0 2px 8px #0008;
transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
```
Hover: `background: #7e22ce, box-shadow: 0 0 28px #9333ea88, transform: translateY(-1px)`

---

## Animations

```css
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-ring {
  0%   { opacity: 0.6; transform: scale(1); }
  50%  { opacity: 1;   transform: scale(1.04); }
  100% { opacity: 0.6; transform: scale(1); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes msgAppear {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

---

## Data Model (Supabase)

The `training_plans` table already exists. Extend it:

```sql
alter table training_plans
  add column if not exists race_name   text,
  add column if not exists race_date   date,
  add column if not exists start_date  date,
  add column if not exists source      text default 'manual', -- 'manual' | 'import'
  add column if not exists raw_text    text;  -- original uploaded content for re-parsing
```

New table for imported sessions:

```sql
create table training_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  plan_id         uuid references training_plans(id) on delete cascade,
  week_number     int not null,
  sport           text not null check (sport in ('swim','bike','run','sc','brick','other')),
  title           text not null,
  scheduled_date  date,
  duration_min    int,
  target_metric   text,
  notes           text,
  status          text default 'pending' check (status in ('pending','completed','skipped')),
  has_conflict    boolean default false,
  created_at      timestamptz default now()
);
alter table training_sessions enable row level security;
create policy "Users manage own sessions" on training_sessions
  for all using (auth.uid() = user_id);
```

---

## Plan Import — Backend

The parsing step (Step 2) calls a Supabase Edge Function:

```
POST /functions/v1/parse-plan
Body: { content: string, contentType: 'pdf' | 'html' | 'text', startDate: string, raceDate: string }
Returns: { sessions: ParsedSession[], planName: string, raceName: string, conflicts: string[] }
```

The function should:
1. Send content to Claude (`claude-haiku-4-5`) with a structured prompt to extract sessions
2. Map sessions to `{week, sport, title, date, duration, metric}`
3. Check against existing `training_sessions` / `workouts` for date conflicts
4. Return the structured list

The review screen (Step 3) displays the returned data before the user confirms and writes to Supabase.

---

## State to Manage

```ts
// Plans page
plans: TrainingPlan[]           // from Supabase

// Import modal
importStep: 1 | 2 | 3
uploadTab: 'pdf' | 'html' | 'text'
formData: { startDate: string, raceDate: string, planName: string }
fileContent: string | null       // pasted text or extracted file content
parsedSessions: ParsedSession[]  // returned from edge function
sportFilter: string              // 'all' | 'swim' | 'bike' | 'run' | 'sc' | 'brick'
openWeeks: Record<number, boolean>
```

---

## Sport Colours

```ts
const SPORT_COLORS = {
  swim:  '#38bdf8',
  bike:  '#4ade80',
  run:   '#fb923c',
  sc:    '#a855f7',
  brick: '#f59e0b',
}
```

---

## Design Tokens

```ts
// src/lib/colors.ts
bg:        "#0a0c0f"
surface:   "#111318"
card:      "#161b22"
border:    "#1e2530"
accent:    "#00e5ff"
accentDim: "#00e5ff22"
green:     "#00ff9d"
orange:    "#ff6b2b"
purple:    "#a855f7"
text:      "#e8edf5"
muted:     "#5a6478"
subtle:    "#2a3040"

// Plans-specific additions
purpleAction: "#9333ea"   // primary CTA, active states, progress bars
amber:        "#f59e0b"   // race dates, conflict warnings
```

Typography:
- Body: `'DM Sans', 'Helvetica Neue', sans-serif`
- Numbers / labels / metrics: `'DM Mono', monospace`

---

## Files in This Package

| File | Purpose |
|------|---------|
| `Plans.html` | Full hi-fi prototype — open in browser to see all interactions |
| `README.md` | This document |

---

## Notes for Claude Code

- The `TrainingPlan` type in `src/types/index.ts` will need `race_name`, `race_date`, `start_date`, and `source` fields added
- The existing `PlansPage.tsx` is a stub — replace it entirely with the new design; keep the props interface (`plans`, `onRefresh`) compatible with `src/pages/Plans.tsx`
- Import modal should be a separate component (`ImportModal.tsx`) rendered as a portal or conditionally mounted in `PlansPage`
- Step 2 simulates an async parse — wire this to the `parse-plan` edge function in production
- Step 3's session list can be long — ensure the modal content area is `overflow-y: auto` with a fixed max height
- Use the `isMobile` hook from `src/hooks/useIsMobile.ts` — on mobile, the review screen should stack columns and reduce grid to essential fields only (sport, title, duration)
- The `≡` nav icon for Training Plans is already in the sidebar; no sidebar changes needed
