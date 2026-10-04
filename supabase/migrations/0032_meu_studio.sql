-- MỀU Studio MVP (founder approved 2026-10-04): a dedicated area inside TNT OS
-- for producing MỀU episodes — episode board, per-shot storyboard, a prompt
-- builder that follows MỀU Canon v1.1 (docs/meu-studio/), clip QC reviews,
-- and a hand-off to the existing content_calendar. Video generation itself
-- stays manual in Dola (no API), video files stay in Google Drive.
--
-- Episodes are scoped to a business unit (MỀU Studio, migration 0031) with
-- the same RLS shape as content_calendar; shots and reviews inherit access
-- from their episode. Run after 0031.

create table if not exists meu_episodes (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  code text not null, -- T01, T02…
  title text not null,
  signature_state text not null default 'icon' check (signature_state in (
    'icon', 'danh_da', 'fashionista', 'de_gian', 'ngu', 'an_ngon', 'nail_queen'
  )),
  status text not null default 'idea' check (status in (
    'idea', 'script', 'keyframe', 'video', 'edit', 'posted'
  )),
  synopsis text,
  setting text, -- where it happens, e.g. "a pink-and-white nail table"
  sound text,
  overlay_text text, -- 大阪弁 overlay, added in CapCut
  refs text[] not null default '{}', -- extra reference images: 'nail_file', 'paw'
  content_calendar_id uuid references content_calendar(id) on delete set null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meu_episodes_business_unit_id_idx on meu_episodes (business_unit_id);

create table if not exists meu_shots (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references meu_episodes(id) on delete cascade,
  position int not null,
  framing text, -- shot size + camera, e.g. "medium shot, static camera"
  action text not null, -- one primary action per shot
  created_at timestamptz not null default now()
);
create index if not exists meu_shots_episode_id_idx on meu_shots (episode_id);

create table if not exists meu_clip_reviews (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references meu_episodes(id) on delete cascade,
  clip_label text not null, -- e.g. T07-v2-1
  checks jsonb not null default '{}'::jsonb, -- QC item key -> true/false (Canon §8)
  passed boolean not null default false,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists meu_clip_reviews_episode_id_idx on meu_clip_reviews (episode_id);

alter table meu_episodes enable row level security;
alter table meu_shots enable row level security;
alter table meu_clip_reviews enable row level security;

create policy "meu_episodes_all" on meu_episodes
  for all to authenticated
  using (public.is_chairman() or business_unit_id = public.current_user_business_unit_id())
  with check (public.is_chairman() or business_unit_id = public.current_user_business_unit_id());

create policy "meu_shots_all" on meu_shots
  for all to authenticated
  using (exists (
    select 1 from meu_episodes e
    where e.id = episode_id
      and (public.is_chairman() or e.business_unit_id = public.current_user_business_unit_id())
  ))
  with check (exists (
    select 1 from meu_episodes e
    where e.id = episode_id
      and (public.is_chairman() or e.business_unit_id = public.current_user_business_unit_id())
  ));

create policy "meu_clip_reviews_all" on meu_clip_reviews
  for all to authenticated
  using (exists (
    select 1 from meu_episodes e
    where e.id = episode_id
      and (public.is_chairman() or e.business_unit_id = public.current_user_business_unit_id())
  ))
  with check (exists (
    select 1 from meu_episodes e
    where e.id = episode_id
      and (public.is_chairman() or e.business_unit_id = public.current_user_business_unit_id())
  ));
