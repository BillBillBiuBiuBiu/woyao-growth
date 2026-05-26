-- Run this in Supabase → SQL Editor → New query

-- Games table
create table if not exists games (
  id             text primary key,
  created_at     timestamptz default now(),
  user_id        uuid references auth.users(id) on delete set null,
  home_team      text not null,
  away_team      text not null,
  home_score     int  not null default 0,
  away_score     int  not null default 0,
  quarter_scores jsonb not null default '[]',
  event_count    int  not null default 0,
  duration       int  not null default 0,
  source         text not null default 'live' -- 'live' | 'review'
);

-- Game events table (full play-by-play)
create table if not exists game_events (
  id          text primary key,
  game_id     text not null references games(id) on delete cascade,
  seq         int  not null,
  player_id   text not null,
  player_name text not null,
  player_num  text not null,
  team        text not null,
  cat         text not null,
  pts         int  not null default 0,
  quarter     int  not null default 1,
  game_clock  int  not null default 0,
  video_ts    real not null default 0,
  note        text not null default ''
);

create index if not exists game_events_game_id on game_events(game_id);

-- Clip storage metadata
create table if not exists game_clips (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  game_id     text not null references games(id) on delete cascade,
  file_path   text not null,
  public_url  text not null,
  size_bytes  int  not null default 0,
  label       text not null default ''
);

create index if not exists game_clips_game_id on game_clips(game_id);

-- Storage bucket for highlight clips
insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict (id) do nothing;

-- RLS: allow anonymous read of games/events/clips
-- (change to auth-gated policies once auth is wired up)
alter table games        enable row level security;
alter table game_events  enable row level security;
alter table game_clips   enable row level security;

-- Permissive policies for MVP (no auth yet)
create policy "allow all games"       on games        for all using (true) with check (true);
create policy "allow all events"      on game_events  for all using (true) with check (true);
create policy "allow all clips"       on game_clips   for all using (true) with check (true);
create policy "allow clip uploads"    on storage.objects for insert with check (bucket_id = 'clips');
create policy "allow clip reads"      on storage.objects for select using (bucket_id = 'clips');
create policy "allow clip deletes"    on storage.objects for delete using (bucket_id = 'clips');
