-- "Phòng họp": lets the founder watch delegated sub-tasks appear live as
-- they start/finish, stop a run-away chain, and inject new instructions
-- mid-run. The chat transcript itself needs no new schema — every
-- delegated sub-task is already a real row in `tasks` (see
-- delegate_to_agent in agent-runner.ts) — it just needs an easy way to
-- group "everything that happened because of 1 original Giao việc" in one
-- query instead of walking parent_task_id by hand.

alter table tasks add column if not exists root_task_id uuid references tasks(id);
alter table tasks add column if not exists stop_requested boolean not null default false;

-- Backfill existing rows: a root task points at itself; everything else
-- inherits its parent's root, propagated down MAX_DELEGATION_DEPTH (4)
-- levels — bounded loop instead of a recursive CTE since depth is capped
-- in application code (agent-runner.ts) anyway.
update tasks set root_task_id = id where parent_task_id is null and root_task_id is null;

do $$
begin
  for i in 1..5 loop
    update tasks t
    set root_task_id = p.root_task_id
    from tasks p
    where t.parent_task_id = p.id
      and t.root_task_id is null
      and p.root_task_id is not null;
  end loop;
end $$;

-- Founder's mid-run messages ("chen ngang") — read by whichever agent is
-- currently in its tool-calling round loop for this session (see
-- agent-runner.ts, checked once per round) and appended as an extra
-- conversation turn. Not tied to one specific agent_id because, in a
-- delegation chain, the founder is steering the SESSION, not a single
-- department.
create table if not exists task_messages (
  id uuid primary key default gen_random_uuid(),
  root_task_id uuid not null references tasks(id) on delete cascade,
  text text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table task_messages enable row level security;

create policy "task_messages_select" on task_messages
  for select to authenticated using (
    public.is_chairman()
    or root_task_id in (
      select t.id from tasks t
      join agents a on a.id = t.agent_id
      where a.business_unit_id = public.current_user_business_unit_id()
    )
  );

create policy "task_messages_insert" on task_messages
  for insert to authenticated with check (
    public.is_chairman()
    or root_task_id in (
      select t.id from tasks t
      join agents a on a.id = t.agent_id
      where a.business_unit_id = public.current_user_business_unit_id()
    )
  );

-- tasks_update_own_unit (0003) already lets any signed-in user in the same
-- business unit flip stop_requested on a task row directly — no new RPC
-- needed for the "Dừng ngay" button.

-- Add both tables to the realtime publication so "Phòng họp" can subscribe
-- to postgres_changes (same mechanism as agents in migration 0009) —
-- lets a delegated sub-task's card appear the instant it's inserted
-- ('in_progress') and update the instant it finishes ('done'/'failed'),
-- without polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_messages'
  ) then
    alter publication supabase_realtime add table public.task_messages;
  end if;
end $$;
