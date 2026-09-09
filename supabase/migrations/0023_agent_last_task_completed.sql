-- Lets the org chart show a "vừa xong việc" (just contributed) marker on
-- whichever agent card most recently finished a task — including a
-- subordinate that only ran because the CEO delegated to it. Without this,
-- a delegated agent's real contribution (already a real task row under its
-- own agent_id — see delegate_to_agent in agent-runner.ts, and "Lịch sử
-- giao việc") is only visible if you manually open that agent's own panel;
-- there's no visual cue on the org chart itself pointing you there.
alter table agents add column if not exists last_task_completed_at timestamptz;

-- set_agent_status (migration 0009) already runs as SECURITY DEFINER so any
-- authenticated user whose task is driving that agent can flip its status —
-- reused here rather than adding a second RPC, since every place that calls
-- it already passes 'idle' or 'error' at the exact moment a task finishes
-- (success or failure) and 'running' when one starts. No changes needed in
-- agent-runner.ts.
create or replace function public.set_agent_status(p_agent_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_unit_id uuid;
begin
  select business_unit_id into v_business_unit_id from agents where id = p_agent_id;
  if v_business_unit_id is null then
    return;
  end if;
  if not (public.is_chairman() or v_business_unit_id = public.current_user_business_unit_id()) then
    raise exception 'not allowed to update this agent';
  end if;
  update agents
  set status = p_status,
      last_task_completed_at = case when p_status in ('idle', 'error') then now() else last_task_completed_at end
  where id = p_agent_id;
end;
$$;
