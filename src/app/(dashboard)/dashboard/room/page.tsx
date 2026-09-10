import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { RoomView, type SessionSummary } from "./room-view";

export default async function RoomPage() {
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  const { data: viewer } = await supabase.from("users").select("role, business_unit_id").eq("id", user.id).maybeSingle();
  if (!viewer) return <p className="text-sm text-slate-400">Không tìm thấy hồ sơ người dùng.</p>;

  const { data: businessUnits } = await supabase.from("business_units").select("id, name").order("name");
  const businessUnitId = viewer.business_unit_id ?? businessUnits?.[0]?.id ?? null;
  if (!businessUnitId) {
    return <p className="text-sm text-amber-300">Chưa có công ty con nào trong database.</p>;
  }

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("business_unit_id", businessUnitId);

  // tasks has no business_unit_id column of its own (only agent_id) — scope
  // to this business unit's agent ids explicitly rather than relying on RLS
  // alone, since a chairman's RLS grant spans every business unit.
  const agentIds = (agents ?? []).map((a) => a.id);
  const { data: sessions } =
    agentIds.length > 0
      ? await supabase
          .from("tasks")
          .select("id, agent_id, input, status, created_at, agents(name)")
          .in("agent_id", agentIds)
          .is("parent_task_id", null)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Phòng họp</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Các phòng ban phối hợp</h2>
        <p className="mt-2 text-sm text-slate-400">
          Xem trực tiếp từng &quot;cuộc họp&quot; — khi bạn giao việc cho 1 agent và agent đó giao
          lại cho cấp dưới, mọi trao đổi hiện ra đây theo thời gian thực. Thấy bất ổn thì bấm{" "}
          <span className="text-red-300">&quot;Dừng ngay&quot;</span>, hoặc gõ thêm chỉ đạo giữa
          chừng — agent đang chạy sẽ nhận được ở lượt xử lý tiếp theo.
        </p>
      </section>

      <RoomView
        businessUnitId={businessUnitId}
        agents={agents ?? []}
        initialSessions={(sessions as unknown as SessionSummary[]) ?? []}
      />
    </div>
  );
}
