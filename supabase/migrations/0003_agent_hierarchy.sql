-- TNT AI Corporate OS — Agent hierarchy (Executive layer + digital-employee fields)
-- Decision: Option A — level lives on `agents`, department_id becomes nullable so
-- executive-level agents (e.g. CEO of a business unit) can sit above all departments.
-- Since department_id can now be null, agents need a direct business_unit_id — it can
-- no longer always be derived by joining through departments.

alter table agents
  add column if not exists business_unit_id uuid references business_units (id) on delete cascade,
  add column if not exists level text,
  add column if not exists status text not null default 'idle',
  add column if not exists approval_level smallint,
  add column if not exists responsibilities text[],
  add column if not exists tools jsonb,
  add column if not exists kpi jsonb,
  add column if not exists escalation_note text;

-- Backfill business_unit_id for any pre-existing rows from their department, then
-- require it going forward (in practice this table was empty when this ran).
update agents a
set business_unit_id = d.business_unit_id
from departments d
where a.department_id = d.id
  and a.business_unit_id is null;

alter table agents
  alter column department_id drop not null,
  alter column business_unit_id set not null;

alter table agents drop constraint if exists agents_level_check;
alter table agents add constraint agents_level_check
  check (level in ('executive', 'director', 'manager', 'specialist'));

alter table agents drop constraint if exists agents_status_check;
alter table agents add constraint agents_status_check
  check (status in ('active', 'idle', 'running', 'waiting', 'warning', 'error', 'approval_required', 'offline'));

alter table agents drop constraint if exists agents_approval_level_check;
alter table agents add constraint agents_approval_level_check
  check (approval_level is null or approval_level in (1, 2, 3));

-- executive agents float above all departments; every other level must belong to one.
alter table agents drop constraint if exists agents_level_department_check;
alter table agents add constraint agents_level_department_check
  check (
    (level = 'executive' and department_id is null)
    or (level <> 'executive' and department_id is not null)
  );

-- Makes the AME29 seed script (0004) idempotent — safe to re-run.
alter table agents drop constraint if exists agents_business_unit_id_name_key;
alter table agents add constraint agents_business_unit_id_name_key unique (business_unit_id, name);

create index if not exists agents_business_unit_id_idx on agents (business_unit_id);

-- Same idempotency guarantee for business_units, used by the seed script's upsert.
alter table business_units drop constraint if exists business_units_organization_id_name_key;
alter table business_units add constraint business_units_organization_id_name_key
  unique (organization_id, name);

-- RLS: agents/tasks used to be scoped by joining through departments, which breaks
-- for department-less executive agents. Re-point both at agents.business_unit_id.
drop policy if exists "agents_select" on agents;
create policy "agents_select" on agents
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

drop policy if exists "agents_write" on agents;
create policy "agents_write" on agents
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );

drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks
  for select to authenticated using (
    public.is_chairman()
    or agent_id in (select id from agents where business_unit_id = public.current_user_business_unit_id())
  );

drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks
  for insert to authenticated with check (
    public.is_chairman()
    or agent_id in (select id from agents where business_unit_id = public.current_user_business_unit_id())
  );

drop policy if exists "tasks_update_own_unit" on tasks;
create policy "tasks_update_own_unit" on tasks
  for update to authenticated using (
    public.is_chairman()
    or agent_id in (select id from agents where business_unit_id = public.current_user_business_unit_id())
  );
