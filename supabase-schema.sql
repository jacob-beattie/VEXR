-- Users profile (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  sport text default 'triathlon',
  ftp integer default 200,
  run_pace text default '5:00',
  css text default '1:45',
  race_goal text,
  race_date date,
  created_at timestamp with time zone default now()
);

-- Workouts
create table workouts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  type text not null check (type in ('run', 'ride', 'swim', 'strength', 'rest')),
  date date not null,
  duration_minutes integer,
  tss integer default 0,
  zone text,
  notes text,
  planned boolean default false,
  structure jsonb,
  strava_activity_id bigint unique,
  heart_rate_avg integer,
  heart_rate_max integer,
  created_at timestamp with time zone default now()
);

-- Strava OAuth connections (one row per user)
create table strava_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade unique,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  athlete_id bigint not null,
  athlete_name text,
  updated_at timestamp with time zone default now()
);

alter table strava_connections enable row level security;
create policy "Users can manage own strava connection" on strava_connections for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Training Plans
create table training_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  sport text not null,
  total_weeks integer not null,
  current_week integer default 0,
  status text default 'upcoming' check (status in ('active', 'complete', 'upcoming')),
  created_at timestamp with time zone default now()
);

-- Workout Library
create table workout_library (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  type text not null,
  duration_minutes integer,
  tss integer default 0,
  description text,
  created_at timestamp with time zone default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table workouts enable row level security;
alter table training_plans enable row level security;
alter table workout_library enable row level security;

create policy "Users can view own profile" on profiles for select using ((select auth.uid()) = id);
create policy "Users can update own profile" on profiles for update using ((select auth.uid()) = id);
create policy "Users can insert own profile" on profiles for insert with check ((select auth.uid()) = id);
create policy "Users can view own workouts" on workouts for select using ((select auth.uid()) = user_id);
create policy "Users can insert own workouts" on workouts for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own workouts" on workouts for update using ((select auth.uid()) = user_id);
create policy "Users can delete own workouts" on workouts for delete using ((select auth.uid()) = user_id);
create policy "Users can manage own plans" on training_plans for all using ((select auth.uid()) = user_id);
create policy "Users can manage own library" on workout_library for all using ((select auth.uid()) = user_id);

-- Fitness Benchmarks (FTP / run pace / CSS history)
create table fitness_benchmarks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  metric text not null check (metric in ('ftp', 'pace', 'css')),
  value text not null,
  recorded_at timestamp with time zone default now()
);

-- Training Zones (cycling auto-calc, running + swimming manual)
create table training_zones (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  sport text not null check (sport in ('cycling', 'running', 'swimming')),
  zone_number integer not null,
  zone_name text not null,
  min_value text,
  max_value text,
  updated_at timestamp with time zone default now()
);

alter table fitness_benchmarks enable row level security;
alter table training_zones enable row level security;

create policy "Users can manage own benchmarks" on fitness_benchmarks for all using ((select auth.uid()) = user_id);
create policy "Users can manage own zones" on training_zones for all using ((select auth.uid()) = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$;

-- Prevent direct RPC calls — only the trigger should invoke this
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Training Plans import ──────────────────────────────────────────────────
alter table training_plans
  add column if not exists race_name  text,
  add column if not exists race_date  date,
  add column if not exists start_date date,
  add column if not exists source     text default 'manual',
  add column if not exists raw_text   text;

create table if not exists training_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  plan_id        uuid references training_plans(id) on delete cascade,
  week_number    int not null,
  sport          text not null check (sport in ('swim','bike','run','sc','brick','other')),
  title          text not null,
  scheduled_date date,
  duration_min   int,
  target_metric  text,
  notes          text,
  status         text default 'pending' check (status in ('pending','completed','skipped')),
  has_conflict   boolean default false,
  created_at     timestamptz default now()
);
alter table training_sessions enable row level security;
create policy "Users manage own sessions" on training_sessions
  for all using ((select auth.uid()) = user_id);

-- Link workouts back to training_plans so calendar entries cascade on plan delete
alter table workouts
  add column if not exists plan_id uuid references training_plans(id) on delete cascade;

-- Ensure training_sessions.plan_id FK has ON DELETE CASCADE
alter table training_sessions
  drop constraint if exists training_sessions_plan_id_fkey,
  add constraint training_sessions_plan_id_fkey
    foreign key (plan_id)
    references training_plans(id)
    on delete cascade;

-- Strava-synced workout fields: strava-sync writes these on every synced activity.
alter table workouts add column if not exists distance_meters integer;
alter table workouts add column if not exists calories        integer;
alter table workouts add column if not exists elevation_gain  integer;
alter table workouts add column if not exists avg_power       integer;
alter table workouts add column if not exists avg_pace        text;

-- ─── Nutrition ────────────────────────────────────────────────────────────────

-- Daily food logs
create table nutrition_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  date       date not null,
  meal       text not null check (meal in ('breakfast','lunch','dinner','snacks')),
  food_name  text not null,
  calories   int not null,
  protein    int not null default 0,
  carbs      int not null default 0,
  fat        int not null default 0,
  created_at timestamptz default now()
);
alter table nutrition_logs enable row level security;
create policy "Users manage own nutrition logs" on nutrition_logs
  for all using ((select auth.uid()) = user_id);

-- Per-user macro targets
create table nutrition_targets (
  user_id        uuid primary key references auth.users,
  calorie_target int default 2800,
  protein_target int default 175,
  carbs_target   int default 320,
  fat_target     int default 85
);
alter table nutrition_targets enable row level security;
create policy "Users manage own nutrition targets" on nutrition_targets
  for all using ((select auth.uid()) = user_id);

-- Hydration logs (one row per user per day)
create table hydration_logs (
  user_id uuid references auth.users not null,
  date    date not null,
  liters  float not null default 0,
  primary key (user_id, date)
);
alter table hydration_logs enable row level security;
create policy "Users manage own hydration logs" on hydration_logs
  for all using ((select auth.uid()) = user_id);

-- Per-user custom foods
create table nutrition_custom_foods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  name       text not null,
  calories   int not null,
  protein    int not null default 0,
  carbs      int not null default 0,
  fat        int not null default 0,
  created_at timestamptz default now()
);
alter table nutrition_custom_foods enable row level security;
create policy "Users manage own custom foods" on nutrition_custom_foods
  for all using ((select auth.uid()) = user_id);

-- Global food database (shared, read-only for all authenticated users)
create table food_database (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  calories int not null,
  protein  int not null default 0,
  carbs    int not null default 0,
  fat      int not null default 0
);
alter table food_database enable row level security;
create policy "Authenticated users can read food database" on food_database
  for select to authenticated using (true);

insert into food_database (name, calories, protein, carbs, fat) values
  ('Oats (100g)', 380, 13, 64, 7),
  ('Banana', 89, 1, 23, 0),
  ('Whey Protein Shake', 150, 30, 5, 2),
  ('Chicken Breast (200g)', 330, 62, 0, 7),
  ('Brown Rice (150g)', 195, 4, 41, 2),
  ('Sweet Potato (200g)', 172, 4, 40, 0),
  ('Salmon (180g)', 372, 50, 0, 18),
  ('Avocado (half)', 160, 2, 9, 15),
  ('Greek Yogurt (200g)', 130, 20, 9, 1),
  ('Mixed Vegetables', 80, 4, 15, 1),
  ('Eggs (2 large)', 156, 14, 1, 10),
  ('Whole Milk (300ml)', 186, 9, 14, 11),
  ('Pasta (150g dry)', 564, 19, 112, 2),
  ('Bread (2 slices)', 160, 6, 30, 2),
  ('Peanut Butter (2 tbsp)', 190, 7, 6, 16),
  ('Energy Gel (1x)', 100, 0, 25, 0),
  ('Recovery Bar', 240, 20, 28, 6),
  ('Tuna (1 can, 150g)', 165, 37, 0, 2),
  ('Cottage Cheese (200g)', 168, 24, 8, 4),
  ('Almonds (30g)', 174, 6, 6, 15),
  ('Rice Cakes (3x)', 105, 2, 22, 1),
  ('Blueberries (150g)', 86, 1, 21, 0),
  ('Quinoa (180g cooked)', 222, 8, 40, 4);

-- ── API rate limits ───────────────────────────────────────────────────────────
create table if not exists api_rate_limits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  function_name text not null,
  called_at    timestamptz default now() not null
);
create index if not exists idx_api_rate_limits on api_rate_limits(user_id, function_name, called_at);
alter table api_rate_limits enable row level security;
-- No policies: this is a rate-limit ledger, not user-owned data — the whole point is that it
-- constrains the user, so they must not be able to read/insert/update/delete it directly via the
-- anon-key client (RLS enabled + zero policies = deny-all for anon/authenticated). Edge functions
-- read/write it via a scoped service-role client instead (see checkRateLimit() in
-- supabase/functions/_shared/rateLimit.ts).

-- Atomic check-and-increment, called via RPC from checkRateLimit(). A plain select-count-then-
-- insert from JS is two round trips with no transaction, so concurrent requests from the same
-- user could all read the same under-limit count before any of them inserted, letting all of
-- them through. This function does the check and insert inside one statement/transaction,
-- serialized by a per-(user_id, function_name) advisory lock, so only one caller wins the race.
create or replace function check_and_increment_rate_limit(
  p_user_id uuid,
  p_function_name text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - (p_window_seconds || ' seconds')::interval;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_function_name));

  select count(*) into v_count
  from api_rate_limits
  where user_id = p_user_id
    and function_name = p_function_name
    and called_at >= v_window_start;

  if v_count >= p_limit then
    return false;
  end if;

  insert into api_rate_limits (user_id, function_name) values (p_user_id, p_function_name);
  return true;
end;
$$;

-- `revoke ... from public` alone is NOT sufficient on this project: Supabase's default
-- privileges grant EXECUTE on every new public-schema function directly to `anon` and
-- `authenticated` (not via the PUBLIC pseudo-role), so both roles could otherwise call this
-- SECURITY DEFINER function directly via PostgREST (/rest/v1/rpc/check_and_increment_rate_limit)
-- and bypass RLS to insert arbitrary api_rate_limits rows for any user_id — confirmed via
-- `set role anon; select check_and_increment_rate_limit(...)` succeeding before the explicit
-- revoke below was added. Must revoke from anon/authenticated explicitly, not just public.
revoke all on function check_and_increment_rate_limit(uuid, text, integer, integer) from public;
revoke execute on function check_and_increment_rate_limit(uuid, text, integer, integer) from anon, authenticated;
grant execute on function check_and_increment_rate_limit(uuid, text, integer, integer) to service_role;

-- Refunds a rate-limit reservation checkRateLimit() made when the underlying Claude call
-- subsequently failed to produce a usable result (network error, timeout, non-2xx, or
-- malformed output) — called from releaseRateLimit() in supabase/functions/_shared/rateLimit.ts.
-- Without this, an Anthropic-side failure still burns one of the user's hourly requests,
-- compounding an outage with Vexr's own rate limit. Deletes the single most-recent reservation
-- for this (user_id, function_name) pair, serialized by the same advisory lock
-- check_and_increment_rate_limit uses, so a concurrent legitimate insert can't be deleted out
-- from under it mid-check.
create or replace function release_rate_limit_slot(
  p_user_id uuid,
  p_function_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_function_name));

  delete from api_rate_limits
  where id = (
    select id from api_rate_limits
    where user_id = p_user_id
      and function_name = p_function_name
    order by called_at desc
    limit 1
  );
end;
$$;

-- Same anon/authenticated-default-privilege gap as check_and_increment_rate_limit above — a
-- caller reachable via PostgREST could otherwise delete arbitrary users' rate-limit rows
-- directly (including their own, defeating the rate limit entirely). Revoke explicitly.
revoke all on function release_rate_limit_slot(uuid, text) from public;
revoke execute on function release_rate_limit_slot(uuid, text) from anon, authenticated;
grant execute on function release_rate_limit_slot(uuid, text) to service_role;

-- ── Performance indexes ───────────────────────────────────────────────────────
-- Composite (user_id, date) covers both user-only and date-range queries
create index if not exists idx_workouts_user_date        on workouts(user_id, date);
create index if not exists idx_workouts_plan_id          on workouts(plan_id);
create index if not exists idx_training_plans_user_id    on training_plans(user_id);
create index if not exists idx_training_sessions_user_id on training_sessions(user_id);
create index if not exists idx_training_sessions_plan_id on training_sessions(plan_id);
create index if not exists idx_workout_library_user_id   on workout_library(user_id);
create index if not exists idx_fitness_benchmarks_user_id on fitness_benchmarks(user_id);
create index if not exists idx_training_zones_user_id    on training_zones(user_id);
-- Composite (user_id, date) for nutrition_logs: date-scoped meal lookups
create index if not exists idx_nutrition_logs_user_date  on nutrition_logs(user_id, date);
create index if not exists idx_nutrition_custom_foods_user_id on nutrition_custom_foods(user_id);
create index if not exists idx_ai_briefings_user_id on ai_briefings(user_id);
create index if not exists idx_goals_user_id on goals(user_id);

-- ── AI Briefings ──────────────────────────────────────────────────────────────
create table if not exists ai_briefings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  briefing     text not null,
  generated_at timestamptz default now()
);
alter table ai_briefings enable row level security;
create policy "Users can manage own briefings" on ai_briefings
  for all using ((select auth.uid()) = user_id);

-- ── Season Goals ──────────────────────────────────────────────────────────────
create table if not exists goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  text       text not null,
  completed  boolean default false,
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "Users can manage own goals" on goals
  for all using ((select auth.uid()) = user_id);

-- ── Onboarding & profile fields added out-of-band ─────────────────────────────
-- Backported: applied directly via mcp__supabase__apply_migration and never reflected here —
-- see CLAUDE.md's project rule that schema changes must also land in this file.
alter table profiles add column if not exists onboarding_completed boolean default false;
alter table profiles add column if not exists max_hr integer;

-- ── Profile avatar ────────────────────────────────────────────────────────────
alter table profiles add column if not exists avatar_url text;

-- Storage bucket for profile avatars
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
-- Filenames are stored as "<user_id>.<ext>" (no folder prefix), so ownership is checked via
-- split_part(name, '.', 1) rather than storage.foldername(name) (which splits on "/" and would
-- never match a flat filename).
create policy "Users can upload their own avatar" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = split_part(name, '.', 1));
create policy "Users can update their own avatar" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = split_part(name, '.', 1));
-- No SELECT policy: the bucket is public, so GET-by-known-filename already works via the
-- public object URL (/storage/v1/object/public/avatars/<name>), which bypasses RLS entirely.
-- A broad `for select using (bucket_id = 'avatars')` policy is not needed for that and only
-- adds the ability to list/enumerate every filename in the bucket via the Storage API — removed
-- per Supabase security advisor (public_bucket_allows_listing).
