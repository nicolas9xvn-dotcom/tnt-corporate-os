-- Lets a founder/staff hand an agent a task WITHOUT waiting for it to
-- finish in the browser ("giao việc chạy nền") — items sit here until a
-- Vercel Cron job (or the "Xử lý hàng đợi ngay" button, for testing / a
-- Hobby-plan account whose cron only fires once a day) drains them by
-- calling the same runAgentConversation used everywhere else. Kept as a
-- separate table from `tasks` rather than a new status value on it, since
-- a queue item doesn't have an agent-visible task row (and isn't part of
-- any delegation chain) until it actually starts running.
create table if not exists task_queue (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id),
  input text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  created_by uuid references users(id),
  result_task_id uuid references tasks(id),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table task_queue enable row level security;

create policy "task_queue_select" on task_queue
  for select to authenticated using (
    public.is_chairman()
    or agent_id in (select id from agents where business_unit_id = public.current_user_business_unit_id())
  );

create policy "task_queue_insert" on task_queue
  for insert to authenticated with check (
    public.is_chairman()
    or agent_id in (select id from agents where business_unit_id = public.current_user_business_unit_id())
  );

-- Needed for the "Xử lý hàng đợi ngay" manual-trigger server action, which
-- runs with the CALLER's own session (not service-role) — same scope as
-- select above, so it can only ever flip status on queue items already
-- visible to it. The Cron route uses the service-role key instead and
-- bypasses this entirely.
create policy "task_queue_update" on task_queue
  for update to authenticated using (
    public.is_chairman()
    or agent_id in (select id from agents where business_unit_id = public.current_user_business_unit_id())
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_queue'
  ) then
    alter publication supabase_realtime add table public.task_queue;
  end if;
end $$;
