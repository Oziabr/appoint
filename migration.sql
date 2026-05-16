-- ══════════════════════════════════════════════════════════════
--  appoint — Supabase migration (merged, appt_ prefixed)
--
--  All tables are prefixed with appt_ so this project shares
--  a single Supabase project (and auth.users) with others.
--
--  Run in: Dashboard → SQL Editor → Run
--  Idempotent: safe to re-run on a blank or existing schema.
-- ══════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists "btree_gist";

-- ── appt_hosts ────────────────────────────────────────────────
-- One row per host; id = auth.users.id (shared auth)
create table if not exists appt_hosts (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  bio         text,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

-- ── appt_meeting_types ────────────────────────────────────────
create table if not exists appt_meeting_types (
  id               uuid primary key default uuid_generate_v4(),
  host_id          uuid not null references appt_hosts(id) on delete cascade,
  name             text not null,
  description      text,
  duration_min     int  not null check (duration_min > 0),
  -- hidden from guest; subtracted from window when checking fit
  post_meeting_min int  not null default 0 check (post_meeting_min >= 0),
  -- interval between slot start times (e.g. 10 → :00 :10 :20 …)
  step_min         int  not null default 10 check (step_min > 0),
  color            text not null default '#4f7c6e',
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on column appt_meeting_types.post_meeting_min is
  'Buffer after meeting ends; counted against host availability but not shown to guest';
comment on column appt_meeting_types.step_min is
  'Interval between slot start times; default 10 for <60 min, 30 for longer';

-- ── appt_availability_windows ─────────────────────────────────
-- Weekly recurring blocks; times in host local timezone
-- day: 0 = Sunday … 6 = Saturday
create table if not exists appt_availability_windows (
  id          uuid primary key default uuid_generate_v4(),
  host_id     uuid not null references appt_hosts(id) on delete cascade,
  day         smallint not null check (day between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

-- ── appt_bookings ─────────────────────────────────────────────
create table if not exists appt_bookings (
  id              uuid primary key default uuid_generate_v4(),
  host_id         uuid not null references appt_hosts(id) on delete cascade,
  meeting_type_id uuid not null references appt_meeting_types(id) on delete cascade,
  guest_name      text not null,
  guest_email     text not null,
  guest_notes     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'confirmed'
                  check (status in ('confirmed', 'cancelled')),
  created_at      timestamptz not null default now(),
  -- database-enforced: no two confirmed bookings overlap for the same host
  exclude using gist (
    host_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed')
);

-- ── INDEXES ───────────────────────────────────────────────────
create index if not exists appt_meeting_types_host       on appt_meeting_types(host_id);
create index if not exists appt_availability_host_day    on appt_availability_windows(host_id, day);
create index if not exists appt_bookings_host_starts     on appt_bookings(host_id, starts_at);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table appt_hosts                enable row level security;
alter table appt_meeting_types        enable row level security;
alter table appt_availability_windows enable row level security;
alter table appt_bookings             enable row level security;

-- Drop and recreate policies so re-runs are safe
do $$ begin
  drop policy if exists "appt: public read hosts"          on appt_hosts;
  drop policy if exists "appt: host write own row"         on appt_hosts;
  drop policy if exists "appt: public read active types"   on appt_meeting_types;
  drop policy if exists "appt: host manage types"          on appt_meeting_types;
  drop policy if exists "appt: public read availability"   on appt_availability_windows;
  drop policy if exists "appt: host manage availability"   on appt_availability_windows;
  drop policy if exists "appt: host manage bookings"       on appt_bookings;
  drop policy if exists "appt: guest insert booking"       on appt_bookings;
  drop policy if exists "appt: guest read booking"         on appt_bookings;
end $$;

create policy "appt: public read hosts"
  on appt_hosts for select using (true);
create policy "appt: host write own row"
  on appt_hosts for all using (auth.uid() = id);

create policy "appt: public read active types"
  on appt_meeting_types for select using (active = true);
create policy "appt: host manage types"
  on appt_meeting_types for all using (auth.uid() = host_id);

create policy "appt: public read availability"
  on appt_availability_windows for select using (true);
create policy "appt: host manage availability"
  on appt_availability_windows for all using (auth.uid() = host_id);

create policy "appt: host manage bookings"
  on appt_bookings for all using (auth.uid() = host_id);
create policy "appt: guest insert booking"
  on appt_bookings for insert with check (true);
create policy "appt: guest read booking"
  on appt_bookings for select using (true);

-- ── FUNCTION: booked ranges for a host in a UTC window ────────
create or replace function appt_booked_ranges(
  p_host_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer as $$
  select starts_at, ends_at
  from   appt_bookings
  where  host_id   = p_host_id
    and  status    = 'confirmed'
    and  starts_at >= p_from
    and  ends_at   <= p_to
$$;

-- ── TRIGGER: auto-create appt_hosts row on signup ─────────────
-- Uses conflict-safe insert so other projects' triggers are unaffected.
create or replace function _appt_on_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.appt_hosts (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists appt_on_auth_user_created on auth.users;
create trigger appt_on_auth_user_created
  after insert on auth.users
  for each row execute procedure _appt_on_new_user();

-- ══════════════════════════════════════════════════════════════
--  STAGING TABLES  (appt_stage_* prefix)
--
--  Identical schema to production; live in the same Supabase
--  project. Activated in the frontend via ?env=stage.
--  No trigger needed — staging shares auth.users with prod;
--  host rows are created manually or via the dashboard UI.
-- ══════════════════════════════════════════════════════════════

-- ── appt_stage_hosts ──────────────────────────────────────────
create table if not exists appt_stage_hosts (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  bio         text,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

-- ── appt_stage_meeting_types ──────────────────────────────────
create table if not exists appt_stage_meeting_types (
  id               uuid primary key default uuid_generate_v4(),
  host_id          uuid not null references appt_stage_hosts(id) on delete cascade,
  name             text not null,
  description      text,
  duration_min     int  not null check (duration_min > 0),
  post_meeting_min int  not null default 0 check (post_meeting_min >= 0),
  step_min         int  not null default 10 check (step_min > 0),
  color            text not null default '#4f7c6e',
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── appt_stage_availability_windows ──────────────────────────
create table if not exists appt_stage_availability_windows (
  id          uuid primary key default uuid_generate_v4(),
  host_id     uuid not null references appt_stage_hosts(id) on delete cascade,
  day         smallint not null check (day between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

-- ── appt_stage_bookings ───────────────────────────────────────
create table if not exists appt_stage_bookings (
  id              uuid primary key default uuid_generate_v4(),
  host_id         uuid not null references appt_stage_hosts(id) on delete cascade,
  meeting_type_id uuid not null references appt_stage_meeting_types(id) on delete cascade,
  guest_name      text not null,
  guest_email     text not null,
  guest_notes     text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'confirmed'
                  check (status in ('confirmed', 'cancelled')),
  created_at      timestamptz not null default now(),
  exclude using gist (
    host_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed')
);

-- ── staging indexes ───────────────────────────────────────────
create index if not exists appt_stage_meeting_types_host    on appt_stage_meeting_types(host_id);
create index if not exists appt_stage_availability_host_day on appt_stage_availability_windows(host_id, day);
create index if not exists appt_stage_bookings_host_starts  on appt_stage_bookings(host_id, starts_at);

-- ── staging RLS ───────────────────────────────────────────────
alter table appt_stage_hosts                enable row level security;
alter table appt_stage_meeting_types        enable row level security;
alter table appt_stage_availability_windows enable row level security;
alter table appt_stage_bookings             enable row level security;

do $$ begin
  drop policy if exists "appt_stage: public read hosts"          on appt_stage_hosts;
  drop policy if exists "appt_stage: host write own row"         on appt_stage_hosts;
  drop policy if exists "appt_stage: public read active types"   on appt_stage_meeting_types;
  drop policy if exists "appt_stage: host manage types"          on appt_stage_meeting_types;
  drop policy if exists "appt_stage: public read availability"   on appt_stage_availability_windows;
  drop policy if exists "appt_stage: host manage availability"   on appt_stage_availability_windows;
  drop policy if exists "appt_stage: host manage bookings"       on appt_stage_bookings;
  drop policy if exists "appt_stage: guest insert booking"       on appt_stage_bookings;
  drop policy if exists "appt_stage: guest read booking"         on appt_stage_bookings;
end $$;

create policy "appt_stage: public read hosts"
  on appt_stage_hosts for select using (true);
create policy "appt_stage: host write own row"
  on appt_stage_hosts for all using (auth.uid() = id);

create policy "appt_stage: public read active types"
  on appt_stage_meeting_types for select using (active = true);
create policy "appt_stage: host manage types"
  on appt_stage_meeting_types for all using (auth.uid() = host_id);

create policy "appt_stage: public read availability"
  on appt_stage_availability_windows for select using (true);
create policy "appt_stage: host manage availability"
  on appt_stage_availability_windows for all using (auth.uid() = host_id);

create policy "appt_stage: host manage bookings"
  on appt_stage_bookings for all using (auth.uid() = host_id);
create policy "appt_stage: guest insert booking"
  on appt_stage_bookings for insert with check (true);
create policy "appt_stage: guest read booking"
  on appt_stage_bookings for select using (true);

-- ── staging booked_ranges function ───────────────────────────
create or replace function appt_stage_booked_ranges(
  p_host_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer as $$
  select starts_at, ends_at
  from   appt_stage_bookings
  where  host_id   = p_host_id
    and  status    = 'confirmed'
    and  starts_at >= p_from
    and  ends_at   <= p_to
$$;

-- ── staging teardown helper ───────────────────────────────────
-- Call this to wipe staging data between test runs.
-- Does NOT touch auth.users or prod tables.
create or replace function appt_stage_reset()
returns void language sql security definer as $$
  truncate appt_stage_bookings,
           appt_stage_availability_windows,
           appt_stage_meeting_types,
           appt_stage_hosts
  restart identity cascade;
$$;

-- ── avatar_source column ──────────────────────────────────────
-- Added for profile picture selection (initials | gravatar)
alter table appt_hosts
  add column if not exists avatar_source text not null default 'initials'
  check (avatar_source in ('initials','gravatar'));

alter table appt_stage_hosts
  add column if not exists avatar_source text not null default 'initials'
  check (avatar_source in ('initials','gravatar'));
