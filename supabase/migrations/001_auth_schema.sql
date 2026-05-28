-- Phase 1 productization: auth + multi-tenant schema
-- Run in Supabase → SQL Editor

-- User profiles (linked 1:1 to auth.users)
create table if not exists profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  role     text not null check (role in ('coach', 'parent', 'org_admin')),
  name     text not null default '',
  phone    text not null default '',
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "users read own profile"   on profiles for select using (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id);
create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);

-- Students managed by coaches
create table if not exists students (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  age         int,
  gender      text check (gender in ('male', 'female', 'unknown')),
  class_name  text not null default '',
  avatar_url  text,
  plan        text not null default 'basic' check (plan in ('basic', 'vip', 'supervip')),
  player_name text not null default '',   -- matches game_events.player_name for stats lookup
  created_at  timestamptz default now()
);

alter table students enable row level security;
-- Coaches can manage their own students
create policy "coaches manage own students" on students for all using (
  coach_id = auth.uid()
) with check (coach_id = auth.uid());
-- Parents can read students they're linked to
create policy "parents read linked students" on students for select using (
  exists (select 1 from parent_student where student_id = students.id and parent_id = auth.uid())
);

-- Parent ↔ student relationships
create table if not exists parent_student (
  parent_id  uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  primary key (parent_id, student_id)
);

alter table parent_student enable row level security;
create policy "parents read own links"  on parent_student for select using (parent_id = auth.uid());
create policy "coaches read student links" on parent_student for select using (
  exists (select 1 from students where id = student_id and coach_id = auth.uid())
);
create policy "coaches insert parent links" on parent_student for insert with check (
  exists (select 1 from students where id = student_id and coach_id = auth.uid())
);

-- Invite codes for parents (coach generates, parent redeems)
create table if not exists student_invites (
  code        text primary key,
  student_id  uuid not null references students(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  used_at     timestamptz
);

alter table student_invites enable row level security;
create policy "coaches manage invites" on student_invites for all using (created_by = auth.uid());
create policy "anyone redeem invite"   on student_invites for select using (true);
create policy "anyone mark used"       on student_invites for update using (true);

-- Link games to coaches (nullable for backward compat with existing demo data)
alter table games add column if not exists coach_id uuid references profiles(id) on delete set null;
create index if not exists games_coach_id on games(coach_id);
