-- Lets the dashboard show, live, which agent is currently processing a
-- task (pulsing node + glowing edge in network-view.tsx) — real activity,
-- not a decorative animation.

-- 1. set_agent_status(): a narrow SECURITY DEFINER RPC that only ever
--    touches the `status` column. Needed because the existing "agents_write"
--    RLS policy restricts full-row UPDATEs on agents to chairman/ceo only
--    (it protects sensitive fields like system_prompt/approval_level) — but
--    any authenticated user in the same business unit is already allowed to
--    create tasks for an agent (see tasks_insert), so they should be able to
--    flip that agent's status while their task runs too.
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
  update agents set status = p_status where id = p_agent_id;
end;
$$;

grant execute on function public.set_agent_status(uuid, text) to authenticated;

-- 2. Add agents to the realtime publication so browser clients can
--    subscribe to postgres_changes on it (network-view.tsx does this to
--    update the node's pulsing dot live, across any open session).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agents'
  ) then
    alter publication supabase_realtime add table public.agents;
  end if;
end $$;
