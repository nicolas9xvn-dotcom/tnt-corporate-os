import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  Agent,
  BusinessUnit,
  BusinessUnitWithTree,
  Department,
  Organization,
} from "@/lib/types";
import { CommandCenterTree } from "./command-center-tree";

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
      .select("id, department_id, name, role, reports_to, system_prompt, created_at")
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

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <p className="text-xs uppercase tracking-widest text-slate-500">Tập đoàn</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-100">
          {organization?.name ?? (
            <span className="text-base font-normal text-amber-300">
              Chưa có dòng nào trong bảng <code>organizations</code> — tạo thủ công trong
              Supabase (TODO).
            </span>
          )}
        </h2>
      </section>

      {tree.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500">
          Chưa có công ty con nào trong database. Thêm dòng vào bảng{" "}
          <code className="rounded bg-black/30 px-1">business_units</code> để bắt đầu.
        </div>
      ) : (
        <CommandCenterTree businessUnits={tree} />
      )}
    </div>
  );
}
