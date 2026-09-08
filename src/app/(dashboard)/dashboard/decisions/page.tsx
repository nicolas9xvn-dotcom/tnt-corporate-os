import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DecisionForm } from "./decision-form";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default async function DecisionsPage() {
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  const { data: viewer } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  if (!viewer) return <p className="text-sm text-slate-400">Không tìm thấy hồ sơ người dùng.</p>;

  const isChairman = viewer.role === "chairman";
  if (!isChairman) {
    return <p className="text-sm text-slate-400">Nhật ký quyết định HĐQT chỉ chairman xem được.</p>;
  }

  const { data } = await supabase.from("decisions").select("*").order("created_at", { ascending: false }).limit(50);
  const decisions = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">HĐQT</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Nhật ký quyết định</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Ghi lại các quyết định cấp tập đoàn — bối cảnh, đề xuất, quyết định cuối, và lý do.
        </p>
        <DecisionForm />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Đã ghi ({decisions.length})</p>
        {decisions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có quyết định nào.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-200">{d.title}</p>
                  <p className="text-xs text-slate-500">{formatTime(d.created_at)}</p>
                </div>
                {d.context && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">Bối cảnh: </span>
                    {d.context}
                  </p>
                )}
                {d.recommendation && (
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">Đề xuất: </span>
                    {d.recommendation}
                  </p>
                )}
                {d.decision && (
                  <p className="mt-1 text-xs text-emerald-400">
                    <span className="font-medium">Quyết định: </span>
                    {d.decision}
                  </p>
                )}
                {d.reason && (
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">Lý do: </span>
                    {d.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
