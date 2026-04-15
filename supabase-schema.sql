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
