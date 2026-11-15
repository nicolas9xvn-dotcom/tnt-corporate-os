import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Live state for the "Văn phòng AI" page (public/tnt-office-live.html):
// agents with their current status, recent tasks, and how many tasks are
// waiting for approval. Read-only and authenticated — uses the viewer's own
// session, so RLS decides what they can see (unlike /api/public/*, which is
// deliberately open). The /api prefix is excluded from proxy.ts, so this
// route checks the session itself.
export const dynamic = "force-dynamic";

const INPUT_SNIPPET = 90;

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase chưa được cấu hình." }, { status: 503 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase chưa được cấu hình." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  const { data: viewer } = await supabase
    .from("users")
    .select("role, business_unit_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer) {
    return NextResponse.json({ error: "Không tìm thấy hồ sơ người dùng." }, { status: 403 });
  }

  const { data: businessUnits } = await supabase.from("business_units").select("id, name").order("name");
  const businessUnit =
    businessUnits?.find((b) => b.id === viewer.business_unit_id) ?? businessUnits?.[0] ?? null;
  if (!businessUnit) {
    return NextResponse.json({ error: "Chưa có công ty con nào trong database." }, { status: 404 });
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("business_unit_id", businessUnit.id)
    .order("name");

  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, name, role, level, status, approval_level, department_id, reports_to, last_task_completed_at")
    .eq("business_unit_id", businessUnit.id)
    .order("name");
  if (agentsError) {
    return NextResponse.json({ error: agentsError.message }, { status: 500 });
  }

  // tasks has no business_unit_id column — scope by this unit's agent ids
  // explicitly (a chairman's RLS grant spans every business unit).
  const agentIds = (agents ?? []).map((a) => a.id);
  const { data: tasks } =
    agentIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, agent_id, status, input, parent_task_id, created_at")
          .in("agent_id", agentIds)
          .order("created_at", { ascending: false })
          .limit(40)
      : { data: [] };

  // agents.status = 'running' can get stuck if a task dies mid-run before it
  // resets the agent to idle. Only trust it when the agent really has a task
  // in progress that started recently; otherwise flag it as possibly stuck
  // (display only — this route never writes to the database).
  const RUNNING_TRUST_MS = 30 * 60 * 1000;
  const { data: activeTasks } =
    agentIds.length > 0
      ? await supabase
          .from("tasks")
          .select("agent_id")
          .in("agent_id", agentIds)
          .eq("status", "in_progress")
          .gte("created_at", new Date(Date.now() - RUNNING_TRUST_MS).toISOString())
      : { data: [] };
  const activeAgentIds = new Set((activeTasks ?? []).map((t) => t.agent_id));
  const agentsWithFlag = (agents ?? []).map((a) => ({
    ...a,
    stuck_running: a.status === "running" && !activeAgentIds.has(a.id),
  }));

  // A delegated task points to the task that spawned it (parent_task_id);
  // the agent who owns that parent task is the one who handed the work down.
  const parentIds = [...new Set((tasks ?? []).map((t) => t.parent_task_id).filter((x): x is string => !!x))];
  const { data: parentTasks } =
    parentIds.length > 0
      ? await supabase.from("tasks").select("id, agent_id").in("id", parentIds)
      : { data: [] };
  const parentAgent = new Map((parentTasks ?? []).map((p) => [p.id, p.agent_id as string]));

  const recentTasks = (tasks ?? []).map((t) => ({
    id: t.id,
    agent_id: t.agent_id,
    status: t.status,
    delegated: t.parent_task_id !== null,
    from_agent_id: t.parent_task_id ? (parentAgent.get(t.parent_task_id) ?? null) : null,
    created_at: t.created_at,
    // Truncated on purpose: this feeds a screen that may be shared or
    // recorded, and task inputs can contain customer details.
    input: t.input ? String(t.input).slice(0, INPUT_SNIPPET) : null,
  }));

  // Counted with its own query, not from recentTasks — an old task still
  // waiting for approval would fall outside the 40 most recent rows.
  const { count: pendingApprovals } =
    agentIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("agent_id", agentIds)
          .eq("status", "approval_required")
      : { count: 0 };

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      business_unit: businessUnit,
      departments: departments ?? [],
      agents: agentsWithFlag,
      recent_tasks: recentTasks,
      pending_approvals: pendingApprovals ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
