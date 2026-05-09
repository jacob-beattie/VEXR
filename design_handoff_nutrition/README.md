# Handoff: Nutrition Page

## Overview
A new **Nutrition** page for the VEXR training app. It lets athletes track daily calories, macronutrients, hydration, and logged meals. It lives alongside the existing Dashboard, Calendar, Analytics, AI Coach, Plans, and Library pages.

## About the Design Files
`Nutrition.html` is a **high-fidelity design prototype** built in plain HTML/React — it is a reference for the intended look and behavior, not production code. Your task is to **recreate this design as a proper TypeScript/React page** inside the existing VEXR codebase, following all established conventions (Supabase for data, existing contexts, the same `COLORS` tokens, component patterns, etc.).

## Fidelity
**High-fidelity.** The prototype uses VEXR's exact color tokens, typography, spacing, card patterns, and interaction styles. Recreate it pixel-accurately using the existing design system (`src/lib/colors.ts`, existing component patterns from `src/pages/Dashboard.tsx`, etc.).

---

## File to Create
```
src/pages/Nutrition.tsx
```
Register the route in `src/App.tsx` at `/nutrition` (lazy-loaded, same pattern as other pages).

Add to the sidebar nav in `src/components/layout/Sidebar.tsx`:
```ts
{ path: '/nutrition', icon: '◉', label: 'Nutrition' }
```

Add to `pageTitles` in `src/App.tsx`:
```ts
'/nutrition': { title: 'Nutrition', subtitle: 'Track your daily fuel and macros' },
```

Add to `bottomNavItems` in `src/App.tsx` if desired (may need to replace an existing item due to space).

---

## Page Layout

The page uses VEXR's standard shell: sidebar + scrollable content area with `padding: '28px 32px'`. Mobile uses `padding: '20px 16px'`.

### Top: Page title
Matches Dashboard greeting row style:
- Title: `fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em'` — "Nutrition"
- Subtitle: `fontSize: 13, color: COLORS.muted, fontWeight: 500` — "Track your daily fuel and macros"

### Date Navigator
A row with ← / → buttons and a centred date label. Shows "Today / Yesterday / Tomorrow" for ±1 days, otherwise the formatted date string. A "TODAY" button appears when not on the current day.

Button style: `background: COLORS.card, border: 1px solid COLORS.border, borderRadius: 8, padding: '7px 13px', fontSize: 13`

### Stat Cards Row (4 cards)
Identical to Dashboard's `StatCard` component. One card per macro:

| Card | Label | Value | Unit | Accent color |
|------|-------|-------|------|--------------|
| 1 | Calories | total consumed | kcal | `COLORS.accent` (#00e5ff) |
| 2 | Protein | grams consumed | g | `COLORS.green` (#00ff9d) |
| 3 | Carbohydrates | grams consumed | g | `COLORS.orange` (#ff6b2b) |
| 4 | Fat | grams consumed | g | `COLORS.purple` (#a855f7) |

Sub-text: `"X remaining"` or `"Target reached"` depending on progress. Grid: `repeat(4, 1fr)` desktop, `1fr 1fr` mobile.

### Main Two-Column Grid
`gridTemplateColumns: '56% 1fr', gap: 20` on desktop. Single column on mobile.

---

## Components

### Left Column

#### 1. Daily Summary Card
`background: COLORS.card, border: 1px solid COLORS.border, borderRadius: 12, padding: '20px 24px'`  
Top accent bar: `height: 2, background: COLORS.accent, opacity: 0.65`  
Section label: `fontSize: 11, fontWeight: 700, color: COLORS.muted, letterSpacing: '0.1em', textTransform: 'uppercase'` — "DAILY SUMMARY"

Layout: `display: flex, gap: 28, alignItems: 'flex-start'`

**Left: Calorie Ring (SVG)**
- Outer track: `r=66, strokeWidth=11, stroke: COLORS.subtle`
- Progress arc: same r, `strokeLinecap: 'round'`, color:
  - `COLORS.orange` if over target
  - `COLORS.green` if ≥ 85% of target
  - `COLORS.accent` otherwise
- Centre text: consumed kcal in `fontSize: 28, fontWeight: 900, fontFamily: 'DM Mono, monospace'`
- Below: "kcal eaten" `fontSize: 10, color: COLORS.muted`
- Below: "X left" / "+X over" in ring color, `fontSize: 11, fontWeight: 700`
- Canvas: 164×164px

**Right: Macro bars (flex column, gap 14)**  
Each bar:
- Label row: label in `fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: COLORS.muted` + value `consumed / target` in `DM Mono` (consumed turns `COLORS.orange` when over)
- Progress track: `height: 5, background: COLORS.subtle, borderRadius: 4`
- Fill: macro color, `transition: width 0.5s ease`

**Below macro bars: Macro Split** (only when cal > 0)  
A single segmented bar `height: 7, borderRadius: 4` split into three sections (Protein/Carbs/Fat %) with a legend below. Each legend item: coloured 8×8 rounded square + label + bold % value.

#### 2. Hydration Card
`background: COLORS.card, borderRadius: 12, padding: '18px 20px'`  
Top accent: `height: 2, background: COLORS.accent, opacity: 0.7`  
Target: 3.0L. Unit: 250ml per cup.

- Header: "HYDRATION" label + `"X.XX L / 3L"` in `COLORS.accent, DM Mono`
- Cup grid: 12 cups, `width: 30, height: 34, borderRadius: 6`. Filled cups: `background: COLORS.accent + '20', outline: 1px solid COLORS.accent + '70'`. Clicking cup N sets hydration to `(N+1) × 0.25L`
- Progress bar: `height: 5, background: COLORS.accent`
- Two buttons: `"− 250ml"` (secondary) / `"+ 250ml"` (accent-tinted). Each step ±0.25L.

---

### Right Column

#### 3. Meal Log Card
`background: COLORS.card, borderRadius: 12, padding: '18px 20px'`  
Top accent: `height: 2, background: linear-gradient(90deg, COLORS.orange, COLORS.green, COLORS.purple, COLORS.accent)`

Four meal sections: **Breakfast** (☀ orange), **Lunch** (◑ green), **Dinner** (☽ purple), **Snacks** (⊙ accent).

**Each Meal Section:**
- Toggle button (collapses/expands): icon + label + total kcal (when items exist) + ▲/▼ indicator
- Collapsed: just the header row
- Expanded: list of food items + "+ Add Food" button

**Food item row:**
- Name: `fontSize: 12, fontWeight: 600, COLORS.text`
- Macro badges: `P Xg` green, `C Xg` orange, `F Xg` purple — `fontSize: 10`
- Calorie: `fontSize: 14, fontWeight: 800, DM Mono`
- Remove (×) button: `opacity: 0.45`, increases on hover

**Add Food button:** `border: 1px dashed [mealColor]45`, hover increases opacity and adds `[mealColor]0e` background.

#### 4. Workout Fuel Guide Card
`background: COLORS.card, borderRadius: 12, padding: '18px 20px'`  
Top accent: `height: 2, background: linear-gradient(90deg, COLORS.orange, COLORS.accent, COLORS.green)`

Three phases:
| Phase | Time hint | Color | Tips |
|-------|-----------|-------|------|
| Pre-Workout | 2–3h before | `COLORS.orange` | Low fibre, moderate-high carbs; Rice + chicken or oats; Avoid fats and high fibre |
| During | > 60 min sessions | `COLORS.accent` | 30–60g carbs/hour; Gels, dates, or isotonic drinks; 500–750ml water per hour |
| Recovery | Within 30 min | `COLORS.green` | 3:1 carb-to-protein ratio; Whey shake + banana; Rehydrate: 1.5× sweat loss |

Each phase: `3px` vertical coloured left bar + label (bold, phase color) + time hint (muted) + 3 bullet points with `◆` (7px) in phase color.

---

## Add Food Modal
Opens when "Add Food" is clicked for a meal. Full-screen dimmed overlay (`rgba(0,0,0,0.65)`), centred card `width: 440, borderRadius: 16, padding: 24`.

- Title: "Add Food · [MealLabel]" — meal name in its meal color
- Search input: filters food list in real time
- Results list (max 9): each row shows name + `cal P# C# F#` values. Selected row: `COLORS.accentDim` background + accent border
- Selected food preview: mini card with cal/protein/carbs/fat in their respective colors using DM Mono
- "Add to [Meal]" button: uses meal's color as background. Disabled when nothing selected.

### Food Database
Seed with at least these items (cal / protein / carbs / fat in grams):
```
Oats (100g)             380  13  64   7
Banana                   89   1  23   0
Whey Protein Shake      150  30   5   2
Chicken Breast (200g)   330  62   0   7
Brown Rice (150g)       195   4  41   2
Sweet Potato (200g)     172   4  40   0
Salmon (180g)           372  50   0  18
Avocado (half)          160   2   9  15
Greek Yogurt (200g)     130  20   9   1
Mixed Vegetables         80   4  15   1
Eggs (2 large)          156  14   1  10
Whole Milk (300ml)      186   9  14  11
Pasta (150g dry)        564  19 112   2
Bread (2 slices)        160   6  30   2
Peanut Butter (2 tbsp)  190   7   6  16
Energy Gel (1x)         100   0  25   0
Recovery Bar            240  20  28   6
Tuna (1 can, 150g)      165  37   0   2
Cottage Cheese (200g)   168  24   8   4
Almonds (30g)           174   6   6  15
Rice Cakes (3x)         105   2  22   1
Blueberries (150g)       86   1  21   0
Quinoa (180g cooked)    222   8  40   4
```

---

## Data Model (Supabase)

Suggested table: `nutrition_logs`
```sql
create table nutrition_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  date        date not null,
  meal        text not null check (meal in ('breakfast','lunch','dinner','snacks')),
  food_name   text not null,
  calories    int not null,
  protein     int not null default 0,
  carbs       int not null default 0,
  fat         int not null default 0,
  created_at  timestamptz default now()
);
alter table nutrition_logs enable row level security;
create policy "Users manage own logs" on nutrition_logs
  for all using (auth.uid() = user_id);
```

Suggested table: `nutrition_targets`
```sql
create table nutrition_targets (
  user_id          uuid primary key references auth.users,
  calorie_target   int default 2800,
  protein_target   int default 175,
  carbs_target     int default 320,
  fat_target       int default 85
);
alter table nutrition_targets enable row level security;
create policy "Users manage own targets" on nutrition_targets
  for all using (auth.uid() = user_id);
```

Hydration can use a similar `hydration_logs` table keyed by date, or store it as a single `float` column in a daily log row.

---

## Design Tokens (from `src/lib/colors.ts`)
```ts
bg:        "#0a0c0f"
surface:   "#111318"
card:      "#161b22"
border:    "#1e2530"
accent:    "#00e5ff"   // calories, hydration
accentDim: "#00e5ff22"
green:     "#00ff9d"   // protein
orange:    "#ff6b2b"   // carbs, pre-workout
purple:    "#a855f7"   // fat, dinner
text:      "#e8edf5"
muted:     "#5a6478"
subtle:    "#2a3040"
```

Typography:
- Body: `'Inter', 'Helvetica Neue', sans-serif`
- Numbers: `'DM Mono', monospace` — always use for calorie, macro, and metric values

---

## State to Manage
```ts
// Per-day, per-user (from Supabase)
meals: { breakfast: FoodItem[], lunch: FoodItem[], dinner: FoodItem[], snacks: FoodItem[] }
hydration: number  // litres, e.g. 1.5

// From user's nutrition_targets row
targets: { calorieTarget: number, proteinTarget: number, carbsTarget: number, fatTarget: number }

// Local UI
dateOffset: number          // days from today
addFoodModal: string | null // active meal key
```

---

## Files in This Package
| File | Purpose |
|------|---------|
| `Nutrition.html` | Full hi-fi prototype — open in a browser to see the intended design and interactions |
| `README.md` | This document |

---

## Notes for Claude Code
- Reuse the existing `StatCard` pattern from `src/pages/Dashboard.tsx` — extract it to `src/components/ui/StatCard.tsx` if you haven't already
- The `isMobile` hook is at `src/hooks/useIsMobile.ts` — use it for responsive layout (stack columns, adjust font sizes)
- Follow the lazy-load import pattern in `src/App.tsx` for the new page
- The `TopBar` component in `src/components/layout/TopBar.tsx` is used on all non-dashboard pages — add the `/nutrition` entry to `pageTitles` in `App.tsx`
- DM Mono is already loaded via Google Fonts in the app
