import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CalendarForm } from "./calendar-form";
import { StatusButton } from "./status-button";

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  facebook: "Facebook",
  instagram: "Instagram",
  google_maps: "Google Maps",
  khac: "Khác",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function ContentCalendarPage() {
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

  const { data: items } = await supabase
    .from("content_calendar")
    .select("id, title, platform, scheduled_date, status, notes")
    .eq("business_unit_id", targetBusinessUnitId)
    .order("scheduled_date", { ascending: true })
    .limit(100);

  const rows = items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Lịch Content</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Lịch content/chiến dịch</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Nơi lưu lịch đăng bài/chiến dịch thật — Content Director và agent TikTok/Facebook/
          Instagram tự đọc lịch này (công cụ <code className="rounded bg-black/30 px-1">get_content_calendar</code>)
          trước khi đề xuất content mới, tránh trùng hoặc quên lịch. Bấm vào nhãn trạng thái để
          chuyển Nháp → Đã lên lịch → Đã đăng.
        </p>
        <CalendarForm businessUnitId={targetBusinessUnitId} />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Danh sách ({rows.length})</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có lịch nào.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((item) => (
              <li key={item.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-100">{item.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-400">
                      {PLATFORM_LABELS[item.platform] ?? item.platform}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(item.scheduled_date)}</span>
                    <StatusButton id={item.id} status={item.status} />
                  </div>
                </div>
                {item.notes && <p className="mt-1.5 whitespace-pre-line text-xs text-slate-400">{item.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
