import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { KnowledgeForm } from "./knowledge-form";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default async function KnowledgePage() {
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

  const isChairman = viewer.role === "chairman";
  const { data: businessUnits } = await supabase.from("business_units").select("id, name").order("name");

  // Chairman without a business_unit_id sees the first active unit by
  // default (matches how /dashboard/competitors scopes to AME29 today) —
  // there's only one real unit so far, but this keeps the page correct
  // once a second one exists.
  const targetBusinessUnitId = viewer.business_unit_id ?? businessUnits?.[0]?.id ?? null;
  if (!targetBusinessUnitId) {
    return <p className="text-sm text-amber-300">Chưa có công ty con nào trong database.</p>;
  }

  const [entriesRes, departmentsRes] = await Promise.all([
    supabase
      .from("knowledge_entries")
      .select("id, text, department_id, created_at, departments(name)")
      .eq("business_unit_id", targetBusinessUnitId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("departments").select("id, name").eq("business_unit_id", targetBusinessUnitId).order("name"),
  ]);

  const entries = entriesRes.data ?? [];
  const departments = departmentsRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Knowledge Base</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Kiến thức chung của công ty</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Nơi lưu lại kinh nghiệm, quy trình, ghi chú dùng chung — bất kỳ ai trong công ty cũng
          thêm được, chairman xem được của mọi công ty con.
        </p>
        <KnowledgeForm businessUnitId={targetBusinessUnitId} departments={departments} />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Đã lưu ({entries.length})</p>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có ghi chú nào.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {entries.map((e) => {
              const dept = e.departments as unknown as { name: string } | null;
              return (
                <li key={e.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{formatTime(e.created_at)}</span>
                    {dept && <span className="rounded-full border border-slate-700 px-2 py-0.5">{dept.name}</span>}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-slate-300">{e.text}</p>
                </li>
              );
            })}
          </ul>
        )}
        {isChairman && businessUnits && businessUnits.length > 1 && (
          <p className="mt-3 text-[0.7rem] text-slate-600">
            Đang xem công ty con: {businessUnits.find((b) => b.id === targetBusinessUnitId)?.name}. Chairman hiện xem
            theo công ty con đầu tiên — chọn công ty khác chưa hỗ trợ trên trang này.
          </p>
        )}
      </section>
    </div>
  );
}
