import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  Agent,
  AppUser,
  BusinessUnit,
  BusinessUnitWithTree,
  Department,
  Organization,
} from "@/lib/types";
import { ApprovalsInbox, type PendingTask } from "./approvals-inbox";
import { CommandCenterTree } from "./command-center-tree";
import { CreateBusinessUnitForm } from "./create-business-unit-form";

function buildTree(
  businessUnits: BusinessUnit[],
  departments: Department[],
  agents: Agent[]
): BusinessUnitWithTree[] {
  return businessUnits.map((bu) => ({
    ...bu,
    departments: departments
      .filter((dept) => dept.business_unit_id === bu.id)
      .map((dept) => ({
        ...dept,
        agents: agents.filter((agent) => agent.department_id === dept.id),
      })),
    // Flat list, including department-less executives — used by the org chart.
    agents: agents.filter((agent) => agent.business_unit_id === bu.id),
  }));
}

export default async function DashboardPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-6 text-sm text-amber-300">
        <p className="font-semibold">TODO: chưa kết nối Supabase</p>
        <p className="mt-2 text-amber-300/80">
          Chưa có <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> /{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Sau khi
          tạo project Supabase, chạy các migration trong{" "}
          <code className="rounded bg-black/30 px-1">supabase/migrations/</code>, điền env vào{" "}
          <code className="rounded bg-black/30 px-1">.env.local</code>, rồi màn hình này sẽ hiển
          thị dữ liệu Tập đoàn → Công ty con → Phòng ban → Agent thật từ database.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let viewer: AppUser | null = null;
  if (authUser) {
    const { data } = await supabase
      .from("users")
      .select("id, email, role, business_unit_id, created_at")
      .eq("id", authUser.id)
      .maybeSingle();
    viewer = data;
  }

  const [orgRes, buRes, deptRes, agentRes] = await Promise.all([
    supabase.from("organizations").select("id, name, created_at").limit(1).maybeSingle(),
    supabase
      .from("business_units")
      .select("id, organization_id, name, status, ceo_title, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("departments")
      .select("id, business_unit_id, name, code, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("agents")
      .select(
        "id, business_unit_id, department_id, name, role, level, status, approval_level, responsibilities, tools, kpi, escalation_note, reports_to, system_prompt, house_rules, created_at"
      )
      .order("created_at", { ascending: true }),
  ]);

  const queryError = orgRes.error || buRes.error || deptRes.error || agentRes.error;

  if (queryError) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-6 text-sm text-red-300">
        <p className="font-semibold">Không đọc được dữ liệu từ Supabase</p>
        <p className="mt-2 text-red-300/80">{queryError.message}</p>
        <p className="mt-2 text-red-300/60">
          Kiểm tra: đã chạy đủ migration trong{" "}
          <code className="rounded bg-black/30 px-1">supabase/migrations/</code> chưa, và
          tài khoản đăng nhập đã có dòng tương ứng trong bảng{" "}
          <code className="rounded bg-black/30 px-1">users</code> chưa.
        </p>
      </div>
    );
  }

  const organization = orgRes.data as Organization | null;
  const businessUnits = (buRes.data ?? []) as BusinessUnit[];
  const departments = (deptRes.data ?? []) as Department[];
  const agents = (agentRes.data ?? []) as Agent[];

  const tree = buildTree(businessUnits, departments, agents);

  let pendingTasks: PendingTask[] = [];
  if (viewer && (viewer.role === "chairman" || viewer.role === "ceo")) {
    const { data: pendingRows } = await supabase
      .from("tasks")
      .select("id, input, created_at, agents(name, approval_level, business_unit_id)")
      .eq("status", "approval_required")
      .order("created_at", { ascending: true });

    pendingTasks = (pendingRows ?? []).map((row) => {
      const agent = row.agents as unknown as {
        name: string;
        approval_level: number | null;
        business_unit_id: string;
      };
      const canDecide =
        viewer!.role === "chairman" ||
        (viewer!.role === "ceo" &&
          viewer!.business_unit_id === agent.business_unit_id &&
          (agent.approval_level ?? 1) <= 2);

      return {
        id: row.id,
        agentName: agent.name,
        input: row.input ?? "",
        createdAt: row.created_at,
        canDecide,
      };
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ApprovalsInbox tasks={pendingTasks} />

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Tập đoàn</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">
          {organization?.name ?? (
            <span className="text-base font-normal text-amber-300">
              Chưa có dòng nào trong bảng <code>organizations</code> — tạo thủ công trong
              Supabase (TODO).
            </span>
          )}
        </h2>
      </section>

      {tree.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500">
          <p>Chưa có công ty con nào trong database.</p>
          {viewer?.role === "chairman" ? (
            <CreateBusinessUnitForm />
          ) : (
            <p className="text-xs">
              Chỉ chairman mới tạo được công ty con — liên hệ chairman hoặc thêm thủ công qua
              Supabase Table Editor (bảng <code className="rounded bg-black/30 px-1">business_units</code>).
            </p>
          )}
        </div>
      ) : (
        <>
          <CommandCenterTree
            businessUnits={tree}
            viewerRole={viewer?.role ?? null}
            viewerBusinessUnitId={viewer?.business_unit_id ?? null}
          />
          {viewer?.role === "chairman" && <CreateBusinessUnitForm />}
        </>
      )}
    </div>
  );
}
