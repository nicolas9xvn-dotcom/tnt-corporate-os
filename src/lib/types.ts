// Mirrors the Phase 1 schema in supabase/migrations/0001_init_schema.sql.
// TODO: replace with generated types once the project is linked (`supabase gen types typescript`).

export type UserRole = "chairman" | "ceo" | "staff";
export type BusinessUnitStatus = "active" | "coming_soon";
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "approval_required"
  | "done"
  | "failed"
  | "rejected";
export type AgentLevel = "executive" | "director" | "manager" | "specialist";
export type AgentStatus =
  | "active"
  | "idle"
  | "running"
  | "waiting"
  | "warning"
  | "error"
  | "approval_required"
  | "offline";
export type ApprovalLevel = 1 | 2 | 3;

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
  business_unit_id: string;
  department_id: string | null;
  name: string;
  role: string | null;
  level: AgentLevel | null;
  status: AgentStatus;
  approval_level: ApprovalLevel | null;
  responsibilities: string[] | null;
  tools: unknown | null;
  kpi: unknown | null;
  escalation_note: string | null;
  reports_to: string | null;
  system_prompt: string | null;
  // Standing style/quality rule, set by the founder (see house-rules.ts) —
  // prepended to every future call to this agent, separate from the
  // rolling task-history memory which can get pushed out over time.
  house_rules: string | null;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  business_unit_id: string | null;
  created_at: string;
}

// One file uploaded to the "task-attachments" Storage bucket for a task
// awaiting approval — `path` is "{task_id}/{filename}" inside that bucket.
export interface TaskAttachment {
  path: string;
  name: string;
  mimeType: string;
}

export interface Task {
  id: string;
  agent_id: string;
  created_by: string | null;
  title: string;
  status: TaskStatus;
  input: string | null;
  output: string | null;
  attachments: TaskAttachment[] | null;
  // Set when this task was created by another agent delegating part of its
  // own task down the org chart (see agent-runner.ts) — points at that
  // parent task, null for a task the user created directly.
  parent_task_id: string | null;
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
  // Every agent in this business unit, flat (including department-less
  // executives) — used to render the reports_to org chart.
  agents: Agent[];
}

// A node in the reports_to org chart (see org-chart.tsx).
export interface AgentTreeNode extends Agent {
  children: AgentTreeNode[];
}
