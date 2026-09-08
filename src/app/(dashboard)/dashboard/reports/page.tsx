import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createFileDownloadUrl } from "@/lib/actions/file-downloads";
import { ReportForm } from "./report-form";
import { OverviewReportButton } from "./overview-report-button";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default async function ReportsPage() {
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
  const targetBusinessUnitId = viewer.business_unit_id ?? businessUnits?.[0]?.id ?? null;
  if (!targetBusinessUnitId) {
    return <p className="text-sm text-amber-300">Chưa có công ty con nào trong database.</p>;
  }

  const [reportsRes, ceoRes] = await Promise.all([
    supabase
      .from("reports")
      .select("id, text, output_file_path, output_file_name, created_at")
      .eq("business_unit_id", targetBusinessUnitId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("agents")
      .select("id, name")
      .eq("business_unit_id", targetBusinessUnitId)
      .eq("level", "executive")
      .not("system_prompt", "is", null)
      .maybeSingle(),
  ]);

  const reports = await Promise.all(
    (reportsRes.data ?? []).map(async (r) => ({
      ...r,
      downloadUrl: r.output_file_path ? await createFileDownloadUrl(supabase, r.output_file_path) : null,
    }))
  );
  const ceoAgent = ceoRes.data;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Reports</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Báo cáo</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Ghi báo cáo tay, hoặc để CEO tự tổng hợp doanh thu + lịch trống + vị thế đối thủ thành 1
          báo cáo có số liệu thật, xuất luôn ra PDF.
        </p>
        {ceoAgent && <OverviewReportButton businessUnitId={targetBusinessUnitId} ceoAgentId={ceoAgent.id} ceoName={ceoAgent.name} />}
        <ReportForm businessUnitId={targetBusinessUnitId} />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Đã lưu ({reports.length})</p>
        {reports.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có báo cáo nào.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
                <p className="text-xs text-slate-500">{formatTime(r.created_at)}</p>
                <p className="mt-1.5 whitespace-pre-line text-slate-300">{r.text}</p>
                {r.downloadUrl && (
                  <a
                    href={r.downloadUrl}
                    download={r.output_file_name ?? "bao-cao.pdf"}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-cyan-900/40 px-2 py-1 text-[0.7rem] text-cyan-300 hover:border-cyan-600"
                  >
                    ⬇ {r.output_file_name ?? "bao-cao.pdf"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
