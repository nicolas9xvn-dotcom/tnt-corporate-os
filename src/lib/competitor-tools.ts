import type { createClient } from "@/lib/supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Real competitor/pricing research the founder compiled by hand (Google
// Maps, Hotpepper, Instagram, TikTok, Minimo across 233 Japanese nail
// salons) — originally a static bundled snapshot (migration 0015), now live
// Supabase tables (migrations 0016/0017) so a manual edit (or an automatic
// Google Maps rating refresh, see google-places.ts) shows up immediately
// here AND in the CEO dashboard, with no re-deploy needed. Only used by
// agents flagged agents.can_read_competitors.
export type CompetitorTopic =
  | "tong_quan"
  | "doi_thu_truc_tiep"
  | "bang_xep_hang_osaka"
  | "doi_thu_toan_quoc";

export const COMPETITOR_TOPICS: CompetitorTopic[] = [
  "tong_quan",
  "doi_thu_truc_tiep",
  "bang_xep_hang_osaka",
  "doi_thu_toan_quoc",
];

interface PlatformStatRow {
  platform: string;
  rating: number | null;
  review_count: number | null;
  summary_vi: string | null;
  detail_vi: string | null;
}

interface CompetitorRow {
  name: string;
  city: string | null;
  is_ame29: boolean;
  price_vi: string | null;
  competitor_platform_stats: PlatformStatRow[];
}

function shapeCompetitors(rows: CompetitorRow[]) {
  return rows.map((r) => ({
    name: r.name,
    la_ame29: r.is_ame29,
    gia: r.price_vi,
    ...(r.city ? { thanh_pho: r.city } : {}),
    danh_gia_theo_nen_tang: Object.fromEntries(
      (r.competitor_platform_stats ?? []).map((p) => [
        p.platform,
        { summary: p.summary_vi, detail: p.detail_vi, rating: p.rating, so_review: p.review_count },
      ])
    ),
  }));
}

async function fetchGroup(supabase: Supabase, businessUnitId: string, groupKey: string) {
  const { data, error } = await supabase
    .from("competitors")
    .select("name, city, is_ame29, price_vi, competitor_platform_stats(platform, rating, review_count, summary_vi, detail_vi)")
    .eq("business_unit_id", businessUnitId)
    .eq("group_key", groupKey)
    .order("sort_order");
  if (error) throw new Error(`Không đọc được dữ liệu đối thủ (${groupKey}): ${error.message}`);
  return shapeCompetitors((data ?? []) as unknown as CompetitorRow[]);
}

async function fetchOverview(supabase: Supabase, businessUnitId: string) {
  const [scorecard, actions, priceBench, cityRollup] = await Promise.all([
    supabase
      .from("competitor_scorecard")
      .select("label_vi, ame29_score, avg_score")
      .eq("business_unit_id", businessUnitId)
      .order("sort_order"),
    supabase
      .from("competitor_actions")
      .select("legacy_id, description_vi, done")
      .eq("business_unit_id", businessUnitId)
      .order("sort_order"),
    supabase
      .from("competitor_price_benchmark")
      .select("segment, name, model_vi, price_low_vi, price_high_vi, note_vi, is_ame29")
      .eq("business_unit_id", businessUnitId)
      .order("sort_order"),
    supabase
      .from("competitor_city_rollup")
      .select("city, salon_count, avg_rating, avg_reviews, total_reviews")
      .eq("business_unit_id", businessUnitId)
      .order("city"),
  ]);

  const firstError = scorecard.error ?? actions.error ?? priceBench.error ?? cityRollup.error;
  if (firstError) throw new Error(`Không đọc được dữ liệu tổng quan đối thủ: ${firstError.message}`);

  const priceBenchRows = priceBench.data ?? [];

  return {
    diem_manh_yeu_vs_trung_binh_thi_truong: (scorecard.data ?? []).map((s) => ({
      tieu_chi: s.label_vi,
      diem_ame29: s.ame29_score,
      diem_trung_binh: s.avg_score,
    })),
    de_xuat_hanh_dong: (actions.data ?? []).map((a) => ({
      id: a.legacy_id,
      de_xuat: a.description_vi,
      da_lam: a.done,
    })),
    so_sanh_gia_cac_mo_hinh: priceBenchRows
      .filter((p) => p.segment === "price_bench")
      .map((p) => ({
        name: p.name,
        mo_hinh: p.model_vi,
        gia_thap: p.price_low_vi,
        gia_cao: p.price_high_vi,
        ghi_chu: p.note_vi,
        la_ame29: p.is_ame29,
      })),
    so_sanh_ginza_tokyo: priceBenchRows
      .filter((p) => p.segment === "ginza_compare")
      .map((p) => ({ name: p.name, mo_hinh: p.model_vi, gia: p.price_low_vi, ghi_chu: p.note_vi })),
    tong_hop_theo_thanh_pho: (cityRollup.data ?? []).map((c) => ({
      thanh_pho: c.city,
      so_tiem: c.salon_count,
      rating_trung_binh: c.avg_rating,
      review_trung_binh: c.avg_reviews,
      tong_review: c.total_reviews,
    })),
  };
}

export async function getCompetitorData(
  supabase: Supabase,
  businessUnitId: string,
  topic: string
): Promise<unknown> {
  switch (topic as CompetitorTopic) {
    case "tong_quan":
      return fetchOverview(supabase, businessUnitId);
    case "doi_thu_truc_tiep":
      return fetchGroup(supabase, businessUnitId, "daikokucho_direct");
    case "bang_xep_hang_osaka":
      return fetchGroup(supabase, businessUnitId, "osaka_top");
    case "doi_thu_toan_quoc":
      return fetchGroup(supabase, businessUnitId, "national_top");
    default:
      throw new Error(`Chủ đề "${topic}" không hợp lệ — chỉ chấp nhận: ${COMPETITOR_TOPICS.join(", ")}.`);
  }
}
