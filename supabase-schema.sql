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
-- Run this if the table doesn't already exist:
-- create table strava_connections (
--   id uuid default gen_random_uuid() primary key,
--   user_id uuid references profiles(id) on delete cascade unique,
--   access_token text not null,
--   refresh_token text not null,
--   expires_at bigint not null,
--   athlete_id bigint not null,
--   athlete_name text,
--   updated_at timestamp with time zone default now()
-- );

-- Add athlete_name if the table exists but the column doesn't:
-- alter table strava_connections add column if not exists athlete_name text;

-- RLS for strava_connections:
-- alter table strava_connections enable row level security;
-- create policy "Users can manage own strava connection" on strava_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can view own workouts" on workouts for select using (auth.uid() = user_id);
create policy "Users can insert own workouts" on workouts for insert with check (auth.uid() = user_id);
create policy "Users can update own workouts" on workouts for update using (auth.uid() = user_id);
create policy "Users can delete own workouts" on workouts for delete using (auth.uid() = user_id);
create policy "Users can view own plans" on training_plans for select using (auth.uid() = user_id);
create policy "Users can manage own plans" on training_plans for all using (auth.uid() = user_id);
create policy "Users can manage own library" on workout_library for all using (auth.uid() = user_id);

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

create policy "Users can manage own benchmarks" on fitness_benchmarks for all using (auth.uid() = user_id);
create policy "Users can manage own zones" on training_zones for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

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
  for all using (auth.uid() = user_id);

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
  for all using (auth.uid() = user_id);

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
  for all using (auth.uid() = user_id);

-- Hydration logs (one row per user per day)
create table hydration_logs (
  user_id uuid references auth.users not null,
  date    date not null,
  liters  float not null default 0,
  primary key (user_id, date)
);
alter table hydration_logs enable row level security;
create policy "Users manage own hydration logs" on hydration_logs
  for all using (auth.uid() = user_id);

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
  for all using (auth.uid() = user_id);

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
  for select using (auth.role() = 'authenticated');

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

-- ── Profile avatar ────────────────────────────────────────────────────────────
alter table profiles add column if not exists avatar_url text;

-- Storage bucket for profile avatars (run once in Supabase dashboard or via migration)
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
--   on conflict (id) do nothing;
-- create policy "Users can upload their own avatar" on storage.objects
--   for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
-- create policy "Users can update their own avatar" on storage.objects
--   for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
-- create policy "Avatars are publicly readable" on storage.objects
--   for select using (bucket_id = 'avatars');
