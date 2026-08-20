-- TNT AI Corporate OS — Phase 1 schema
-- Mirrors the table list in tnt-corporate-os-kien-truc.md section 3.
-- Run this after 0000 (none) and before 0002_rls_policies.sql.

create extension if not exists "pgcrypto";

-- One row: "TNT Corporation".
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists business_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  status text not null default 'coming_soon' check (status in ('active', 'coming_soon')),
  ceo_title text,
  created_at timestamptz not null default now()
);
create index if not exists business_units_organization_id_idx on business_units (organization_id);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units (id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (business_unit_id, name)
);
create index if not exists departments_business_unit_id_idx on departments (business_unit_id);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id) on delete cascade,
  name text not null,
  role text,
  reports_to uuid references agents (id) on delete set null,
  system_prompt text,
  created_at timestamptz not null default now()
);
create index if not exists agents_department_id_idx on agents (department_id);
create index if not exists agents_reports_to_idx on agents (reports_to);

-- Mirrors auth.users; one row per authenticated person, created by the
-- handle_new_user trigger below (see 0002_rls_policies.sql for RLS).
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('chairman', 'ceo', 'staff')),
  business_unit_id uuid references business_units (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists users_business_unit_id_idx on users (business_unit_id);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'failed')),
  input text,
  output text,
  created_at timestamptz not null default now()
);
create index if not exists tasks_agent_id_idx on tasks (agent_id);

create table if not exists knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units (id) on delete cascade,
  department_id uuid references departments (id) on delete set null,
  text text not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_entries_business_unit_id_idx on knowledge_entries (business_unit_id);

-- Reports up to the corporate/HĐQT level.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units (id) on delete cascade,
  text text not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reports_business_unit_id_idx on reports (business_unit_id);

-- Decision log for the HĐQT meeting room (Phase 1: corporate-level only).
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  context text,
  recommendation text,
  decision text,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references users (id) on delete set null,
  action text not null,
  target text,
  input text,
  output text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_actor_idx on audit_log (actor);
create index if not exists audit_log_created_at_idx on audit_log (created_at);
