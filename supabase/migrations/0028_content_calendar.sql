-- Founder's request: a real content/campaign calendar so Content Director
-- and the social-platform agents (TikTok/Facebook/Instagram) know what
-- stage a piece of content is at instead of duplicating or missing posts —
-- same shape as knowledge_entries/reports (business-unit scoped, simple
-- CRUD), plus a new read-only agent tool (get_content_calendar).
create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  title text not null,
  platform text not null check (platform in ('tiktok', 'facebook', 'instagram', 'google_maps', 'khac')),
  scheduled_date date not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'posted')),
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists content_calendar_business_unit_id_idx on content_calendar (business_unit_id);

alter table content_calendar enable row level security;

create policy "content_calendar_select" on content_calendar
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

create policy "content_calendar_insert" on content_calendar
  for insert to authenticated with check (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

create policy "content_calendar_update" on content_calendar
  for update to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

-- New agent tool (get_content_calendar, see agent-runner.ts) — read-only,
-- lets these agents check upcoming/scheduled content before proposing new
-- content so they don't duplicate or contradict a plan already in motion.
alter table agents add column if not exists can_read_content_calendar boolean not null default false;

update agents
set can_read_content_calendar = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name in ('Content Director', 'TikTok Agent', 'Facebook Agent', 'Instagram Agent');
