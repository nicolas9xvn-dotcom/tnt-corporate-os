// Mirrors the Phase 1 schema in supabase/migrations/0001_init_schema.sql.
// TODO: replace with generated types once the project is linked (`supabase gen types typescript`).

export type UserRole = "chairman" | "ceo" | "staff";
export type BusinessUnitStatus = "active" | "coming_soon";
export type TaskStatus = "pending" | "in_progress" | "done" | "failed";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface BusinessUnit {
  id: string;
  organization_id: string;
  name: string;
  status: BusinessUnitStatus;
  ceo_title: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  business_unit_id: string;
  name: string;
  code: string | null;
  created_at: string;
}

export interface Agent {
  id: string;
  department_id: string;
  name: string;
  role: string | null;
  reports_to: string | null;
  system_prompt: string | null;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  business_unit_id: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  agent_id: string;
  created_by: string | null;
  title: string;
  status: TaskStatus;
  input: string | null;
  output: string | null;
  created_at: string;
}

export interface KnowledgeEntry {
  id: string;
  business_unit_id: string;
  department_id: string | null;
  text: string;
  created_by: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  business_unit_id: string;
  text: string;
  created_by: string | null;
  created_at: string;
}

export interface Decision {
  id: string;
  title: string;
  context: string | null;
  recommendation: string | null;
  decision: string | null;
  reason: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string | null;
  action: string;
  target: string | null;
  input: string | null;
  output: string | null;
  created_at: string;
}

// Shape used by the CEO Command Center tree view.
export interface DepartmentWithAgents extends Department {
  agents: Agent[];
}

export interface BusinessUnitWithTree extends BusinessUnit {
  departments: DepartmentWithAgents[];
}
