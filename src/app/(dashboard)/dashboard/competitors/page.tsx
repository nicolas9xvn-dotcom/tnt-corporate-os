import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CompetitorGroupTable, type CompetitorRowData } from "./competitor-row";
import { ActionChecklist, type ActionItem } from "./action-checklist";
import { SyncGoogleButton } from "./sync-button";

interface PlatformStatRow {
  id: string;
  platform: string;
  rating: number | null;
  review_count: number | null;
  summary_vi: string | null;
  detail_vi: string | null;
  url: string | null;
  source: string;
  synced_at: string | null;
}

interface CompetitorDbRow {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  is_ame29: boolean;
  price_vi: string | null;
  google_place_id: string | null;
  competitor_platform_stats: PlatformStatRow[];
}

async function fetchGroup(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, businessUnitId: string, groupKey: string) {
  const { data } = await supabase
    .from("competitors")
    .select(
      "id, name, area, city, is_ame29, price_vi, google_place_id, competitor_platform_stats(id, platform, rating, review_count, summary_vi, detail_vi, url, source, synced_at)"
    )
    .eq("business_unit_id", businessUnitId)
    .eq("group_key", groupKey)
    .order("sort_order");
  return (data ?? []) as unknown as CompetitorDbRow[];
}

export default async function CompetitorsPage() {
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  const { data: viewer } = await supabase
    .from("users")
    .select("role, business_unit_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer) return <p className="text-sm text-slate-400">Không tìm thấy hồ sơ người dùng.</p>;

  const { data: businessUnit } = await supabase.from("business_units").select("id, name").eq("name", "AME29").maybeSingle();
  if (!businessUnit) {
    return <p className="text-sm text-amber-300">Chưa có business unit AME29 trong database.</p>;
  }

  const canView = viewer.role === "chairman" || viewer.business_unit_id === businessUnit.id;
  if (!canView) {
    return <p className="text-sm text-slate-400">Bạn không có quyền xem dữ liệu này.</p>;
  }
  const canEdit = viewer.role === "chairman" || (viewer.role === "ceo" && viewer.business_unit_id === businessUnit.id);

  const [daikokucho, osakaTop, nationalTop, scorecardRes, actionsRes, priceBenchRes, cityRollupRes] = await Promise.all([
    fetchGroup(supabase, businessUnit.id, "daikokucho_direct"),
    fetchGroup(supabase, businessUnit.id, "osaka_top"),
    fetchGroup(supabase, businessUnit.id, "national_top"),
    supabase
      .from("competitor_scorecard")
      .select("key, label_vi, ame29_score, avg_score")
      .eq("business_unit_id", businessUnit.id)
      .order("sort_order"),
    supabase
      .from("competitor_actions")
      .select("id, description_vi, done")
      .eq("business_unit_id", businessUnit.id)
      .order("sort_order"),
    supabase
      .from("competitor_price_benchmark")
      .select("segment, name, model_vi, price_low_vi, price_high_vi, note_vi, is_ame29")
      .eq("business_unit_id", businessUnit.id)
      .order("sort_order"),
    supabase
      .from("competitor_city_rollup")
      .select("city, salon_count, avg_rating, avg_reviews, total_reviews")
      .eq("business_unit_id", businessUnit.id)
      .order("city"),
  ]);

  const scorecard = scorecardRes.data ?? [];
  const actions: ActionItem[] = (actionsRes.data ?? []).map((a) => ({ id: a.id, description: a.description_vi, done: a.done }));
  const priceBench = (priceBenchRes.data ?? []).filter((p) => p.segment === "price_bench");
  const ginzaCompare = (priceBenchRes.data ?? []).filter((p) => p.segment === "ginza_compare");
  const cityRollup = cityRollupRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-6">
        <div>
          <p className="hud-eyebrow text-xs">AME29 · Chiến lược Giá &amp; Dịch vụ</p>
          <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Dữ liệu đối thủ &amp; giá</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Sửa trực tiếp ở đây — cả trang này và agent AI đọc cùng 1 nguồn dữ liệu, nên sửa xong
            là thấy ngay, không cần chờ deploy lại. Rating/review Google Maps có thể tự động cập
            nhật mỗi ngày nếu đã điền Google Place ID; Hotpepper/Instagram/TikTok/Minimo luôn cần
            sửa tay vì các nền tảng đó không có API công khai.
          </p>
        </div>
        {canEdit && <SyncGoogleButton businessUnitId={businessUnit.id} />}
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Tổng quan</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-400">Điểm mạnh/yếu vs. trung bình đối thủ</p>
            <table className="w-full text-left text-xs">
              <tbody>
                {scorecard.map((s) => (
                  <tr key={s.key} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-300">{s.label_vi}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold text-emerald-400">{s.ame29_score}</td>
                    <td className="py-1.5 text-right text-slate-500">{s.avg_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionChecklist businessUnitId={businessUnit.id} actions={actions} editable={canEdit} />
        </div>
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">So sánh giá theo mô hình</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="pb-2">Tiệm</th>
                <th className="pb-2">Mô hình</th>
                <th className="pb-2">Giá thấp</th>
                <th className="pb-2">Giá cao</th>
                <th className="pb-2">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {priceBench.map((p) => (
                <tr key={p.name} className={`border-t border-slate-800/60 ${p.is_ame29 ? "bg-emerald-950/20" : ""}`}>
                  <td className="py-1.5 pr-2 font-medium text-slate-200">{p.name}</td>
                  <td className="py-1.5 pr-2 text-slate-400">{p.model_vi}</td>
                  <td className="py-1.5 pr-2 text-slate-400">{p.price_low_vi}</td>
                  <td className="py-1.5 pr-2 text-slate-400">{p.price_high_vi}</td>
                  <td className="py-1.5 text-slate-500">{p.note_vi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ginzaCompare.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs font-semibold text-slate-400">So sánh Ginza/Tokyo (phân khúc cao cấp)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-left text-xs">
                <tbody>
                  {ginzaCompare.map((g) => (
                    <tr key={g.name} className="border-t border-slate-800/60">
                      <td className="py-1.5 pr-2 font-medium text-slate-200">{g.name}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{g.model_vi}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{g.price_low_vi}</td>
                      <td className="py-1.5 text-slate-500">{g.note_vi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {cityRollup.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs font-semibold text-slate-400">Tổng hợp theo thành phố</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-2">Thành phố</th>
                    <th className="pb-2">Số tiệm</th>
                    <th className="pb-2">Rating TB</th>
                    <th className="pb-2">Review TB</th>
                    <th className="pb-2">Tổng review</th>
                  </tr>
                </thead>
                <tbody>
                  {cityRollup.map((c) => (
                    <tr key={c.city} className="border-t border-slate-800/60">
                      <td className="py-1.5 pr-2 text-slate-200">{c.city}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{c.salon_count}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{c.avg_rating}</td>
                      <td className="py-1.5 pr-2 text-slate-400">{c.avg_reviews}</td>
                      <td className="py-1.5 text-slate-500">{c.total_reviews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <CompetitorGroupTable
        title="Đối thủ trực tiếp — Daikokucho"
        businessUnitId={businessUnit.id}
        competitors={daikokucho as CompetitorRowData[]}
        editable={canEdit}
      />
      <CompetitorGroupTable
        title="Bảng xếp hạng Osaka"
        businessUnitId={businessUnit.id}
        competitors={osakaTop as CompetitorRowData[]}
        editable={canEdit}
      />
      <CompetitorGroupTable
        title="Đối thủ toàn quốc"
        businessUnitId={businessUnit.id}
        competitors={nationalTop as CompetitorRowData[]}
        editable={canEdit}
      />
    </div>
  );
}
