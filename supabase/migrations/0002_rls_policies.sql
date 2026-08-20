-- TNT AI Corporate OS — Phase 1 auth wiring + Row Level Security
-- Roles: chairman (full access), ceo (own business_unit), staff (own business_unit, read-mostly).
-- TODO(phase-2): revisit staff write permissions once Executive Board / Red Team roles land.

-- 1. Auto-create a public.users row whenever someone signs up via Supabase Auth.
--    New accounts default to 'staff' with no business unit; a chairman assigns
--    role + business_unit_id manually afterwards (Phase 1 has no admin UI for this yet).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role, business_unit_id)
  values (new.id, new.email, 'staff', null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Helper functions to read the current caller's role/business unit without
--    recursively hitting RLS on public.users (security definer bypasses it).
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_user_business_unit_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select business_unit_id from public.users where id = auth.uid();
$$;

create or replace function public.is_chairman()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'chairman';
$$;

-- 3. Enable RLS everywhere.
alter table organizations enable row level security;
alter table business_units enable row level security;
alter table departments enable row level security;
alter table agents enable row level security;
alter table users enable row level security;
alter table tasks enable row level security;
alter table knowledge_entries enable row level security;
alter table reports enable row level security;
alter table decisions enable row level security;
alter table audit_log enable row level security;

-- organizations: every signed-in user can read; only chairman can write.
create policy "organizations_select_authenticated" on organizations
  for select to authenticated using (true);
create policy "organizations_write_chairman" on organizations
  for all to authenticated using (public.is_chairman()) with check (public.is_chairman());

-- business_units: chairman sees all; ceo/staff see only their own unit.
create policy "business_units_select" on business_units
  for select to authenticated using (
    public.is_chairman() or id = public.current_user_business_unit_id()
  );
create policy "business_units_write_chairman" on business_units
  for all to authenticated using (public.is_chairman()) with check (public.is_chairman());

-- departments: readable within own business unit; chairman or the unit's own
-- ceo can manage departments inside that unit.
create policy "departments_select" on departments
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "departments_write" on departments
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );

-- agents: readable/writable by chairman or the ceo of the owning business unit.
create policy "agents_select" on agents
  for select to authenticated using (
    public.is_chairman()
    or department_id in (
      select id from departments where business_unit_id = public.current_user_business_unit_id()
    )
  );
create policy "agents_write" on agents
  for all to authenticated using (
    public.is_chairman()
    or (
      public.current_user_role() = 'ceo'
      and department_id in (
        select id from departments where business_unit_id = public.current_user_business_unit_id()
      )
    )
  ) with check (
    public.is_chairman()
    or (
      public.current_user_role() = 'ceo'
      and department_id in (
        select id from departments where business_unit_id = public.current_user_business_unit_id()
      )
    )
  );

-- users: everyone can read their own row; chairman reads/writes everyone;
-- inserts happen only via the handle_new_user trigger (no client-side insert policy).
create policy "users_select_self" on users
  for select to authenticated using (id = auth.uid() or public.is_chairman());
create policy "users_update_chairman" on users
  for update to authenticated using (public.is_chairman()) with check (public.is_chairman());

-- tasks: scoped to the business unit the agent belongs to.
create policy "tasks_select" on tasks
  for select to authenticated using (
    public.is_chairman()
    or agent_id in (
      select a.id from agents a
      join departments d on d.id = a.department_id
      where d.business_unit_id = public.current_user_business_unit_id()
    )
  );
create policy "tasks_insert" on tasks
  for insert to authenticated with check (
    public.is_chairman()
    or agent_id in (
      select a.id from agents a
      join departments d on d.id = a.department_id
      where d.business_unit_id = public.current_user_business_unit_id()
    )
  );
create policy "tasks_update_own_unit" on tasks
  for update to authenticated using (
    public.is_chairman()
    or agent_id in (
      select a.id from agents a
      join departments d on d.id = a.department_id
      where d.business_unit_id = public.current_user_business_unit_id()
    )
  );

-- knowledge_entries: read/write scoped to own business unit.
create policy "knowledge_entries_select" on knowledge_entries
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "knowledge_entries_insert" on knowledge_entries
  for insert to authenticated with check (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

-- reports: staff/ceo can file reports for their own unit; chairman reads all.
create policy "reports_select" on reports
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "reports_insert" on reports
  for insert to authenticated with check (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

-- decisions: corporate-level (HĐQT). Only chairman can read/write in Phase 1.
create policy "decisions_chairman_only" on decisions
  for all to authenticated using (public.is_chairman()) with check (public.is_chairman());

-- audit_log: append-only from the backend; only chairman can read.
create policy "audit_log_select_chairman" on audit_log
  for select to authenticated using (public.is_chairman());
create policy "audit_log_insert_authenticated" on audit_log
  for insert to authenticated with check (true);
