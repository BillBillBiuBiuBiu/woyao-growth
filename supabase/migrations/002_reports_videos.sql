-- game_videos: metadata for uploaded videos (actual files go to Supabase Storage)
create table if not exists game_videos (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references profiles(id) on delete cascade,
  student_id  uuid references students(id) on delete set null,
  title       text not null default '',
  storage_path text not null,
  size_bytes  bigint,
  duration_s  integer,
  status      text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'error')),
  created_at  timestamptz default now()
);

alter table game_videos enable row level security;
create policy "coaches manage own videos" on game_videos for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

-- Storage bucket for game videos (run once, idempotent via DO block)
-- NOTE: Run this in Supabase dashboard → Storage → New bucket if bucket doesn't exist:
--   Name: game-videos, Private: true, File size limit: 2048 MB
-- RLS policy for storage:
--   Allow authenticated users to upload to game-videos bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('game-videos', 'game-videos', false, 2147483648, array['video/mp4','video/quicktime','video/x-msvideo','video/webm'])
  on conflict (id) do nothing;

create policy "coaches upload videos" on storage.objects for insert
  to authenticated with check (bucket_id = 'game-videos');
create policy "coaches read own videos" on storage.objects for select
  to authenticated using (bucket_id = 'game-videos' and auth.uid()::text = (storage.foldername(name))[1]);

-- reports: growth reports written by coaches, readable by linked parents
create table if not exists reports (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references profiles(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  game_id       text,  -- text to match games.id type (no FK constraint)
  title         text not null default '',
  scene         text not null default 'training' check (scene in ('training', 'match', 'period_summary')),
  plan          text not null default 'basic' check (plan in ('basic', 'vip', 'supervip')),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  summary       text not null default '',
  strengths     text not null default '',
  weaknesses    text not null default '',
  coach_comment text not null default '',
  published_at  timestamptz,
  created_at    timestamptz default now()
);

alter table reports enable row level security;
create policy "coaches manage own reports" on reports for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
-- Parents read published reports for their linked students (uses security definer to avoid cycle)
create policy "parents read linked reports" on reports for select
  using (status = 'published' and public.auth_is_parent_of(student_id));
