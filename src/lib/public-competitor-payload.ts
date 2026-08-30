import type { SupabaseClient } from "@supabase/supabase-js";

// Reconstructs the exact JSON shape the standalone public dashboard
// (japannailmap.netlify.app, built from the founder's own AME29dashboard.html)
// already expects — bilingual {vi, ja} objects everywhere the original
// hand-authored data had them — from the same live Supabase tables the
// get_competitor_data agent tool and the internal /dashboard/competitors
// admin page use. Only this module's shape needs to match the public page;
// the agent-facing competitor-tools.ts stays Vietnamese-only and untouched.
interface Bilingual {
  vi: string | null;
  ja: string | null;
}

function bi(vi: string | null, ja: string | null): Bilingual {
  return { vi, ja };
}

interface PlatformRow {
  platform: string;
  rating: number | null;
  review_count: number | null;
  summary_vi: string | null;
  summary_ja: string | null;
  detail_vi: string | null;
  detail_ja: string | null;
  url: string | null;
}

interface CompetitorRow {
  name: string;
  city: string | null;
  is_ame29: boolean;
  price_vi: string | null;
  price_ja: string | null;
  competitor_platform_stats: PlatformRow[];
}

function buildPlatforms(rows: PlatformRow[]) {
  const out: Record<string, { summary: Bilingual; detail: Bilingual; url: string | null }> = {};
  for (const p of rows ?? []) {
    out[p.platform] = { summary: bi(p.summary_vi, p.summary_ja), detail: bi(p.detail_vi, p.detail_ja), url: p.url };
  }
  return out;
}

function buildDetailEntry(r: CompetitorRow) {
  return {
    name: r.name,
    isUser: r.is_ame29,
    ...(r.city ? { city: r.city } : {}),
    price: bi(r.price_vi, r.price_ja),
    platforms: buildPlatforms(r.competitor_platform_stats),
  };
}

const COMPETITOR_SELECT =
  "name, city, is_ame29, price_vi, price_ja, competitor_platform_stats(platform, rating, review_count, summary_vi, summary_ja, detail_vi, detail_ja, url)";

export async function buildPublicDashboardPayload(supabase: SupabaseClient, businessUnitId: string) {
  const [daikokuchoRes, osakaRes, nationalRes, salonsRes, cityRollupRes, scorecardRes, actionsRes, priceBenchRes] =
    await Promise.all([
      supabase.from("competitors").select(COMPETITOR_SELECT).eq("business_unit_id", businessUnitId).eq("group_key", "daikokucho_direct").order("sort_order"),
      supabase.from("competitors").select(COMPETITOR_SELECT).eq("business_unit_id", businessUnitId).eq("group_key", "osaka_top").order("sort_order"),
      supabase.from("competitors").select(COMPETITOR_SELECT).eq("business_unit_id", businessUnitId).eq("group_key", "national_top").order("sort_order"),
      supabase.from("competitor_salon_index").select("name, area, rating, review_count, is_ame29").eq("business_unit_id", businessUnitId).order("sort_order"),
      supabase.from("competitor_city_rollup").select("city, salon_count, avg_rating, avg_reviews, total_reviews").eq("business_unit_id", businessUnitId).order("city"),
      supabase.from("competitor_scorecard").select("key, label_vi, label_ja, ame29_score, avg_score").eq("business_unit_id", businessUnitId).order("sort_order"),
      supabase.from("competitor_actions").select("legacy_id, description_vi, description_ja").eq("business_unit_id", businessUnitId).order("sort_order"),
      supabase
        .from("competitor_price_benchmark")
        .select("segment, name, model_vi, model_ja, price_low_vi, price_low_ja, price_high_vi, price_high_ja, note_vi, note_ja, is_ame29")
        .eq("business_unit_id", businessUnitId)
        .order("sort_order"),
    ]);

  const firstError =
    daikokuchoRes.error ||
    osakaRes.error ||
    nationalRes.error ||
    salonsRes.error ||
    cityRollupRes.error ||
    scorecardRes.error ||
    actionsRes.error ||
    priceBenchRes.error;
  if (firstError) throw new Error(`Không đọc được dữ liệu đối thủ: ${firstError.message}`);

  const national = (nationalRes.data ?? []) as unknown as CompetitorRow[];
  // The 3 salons with real multi-platform research (originally NATIONAL_DETAIL)
  // are the only national_top rows with more than the single synthetic gmaps
  // stat every TOP20_NATIONAL entry gets — see migration 0019's seed script.
  const TOP20_NATIONAL = national.map((r) => {
    const gmaps = r.competitor_platform_stats?.find((p) => p.platform === "gmaps");
    return { name: r.name, city: r.city, rating: gmaps?.rating ?? null, reviews: gmaps?.review_count ?? null, isUser: r.is_ame29 };
  });
  const NATIONAL_DETAIL = national.filter((r) => (r.competitor_platform_stats?.length ?? 0) > 1).map(buildDetailEntry);

  const priceBenchRows = priceBenchRes.data ?? [];

  return {
    SALONS: (salonsRes.data ?? []).map((s) => ({ name: s.name, area: s.area, rating: s.rating, reviews: s.review_count, isUser: s.is_ame29 })),
    CITY_ROLLUP: (cityRollupRes.data ?? []).map((c) => ({
      city: c.city,
      count: c.salon_count,
      avgRating: c.avg_rating,
      avgReviews: c.avg_reviews,
      totalReviews: c.total_reviews,
    })),
    TOP20_NATIONAL,
    DAIKOKUCHO_DETAIL: ((daikokuchoRes.data ?? []) as unknown as CompetitorRow[]).map(buildDetailEntry),
    NATIONAL_DETAIL,
    OSAKA_TOP_DETAIL: ((osakaRes.data ?? []) as unknown as CompetitorRow[]).map(buildDetailEntry),
    PRICE_BENCH: priceBenchRows
      .filter((p) => p.segment === "price_bench")
      .map((p) => ({
        name: p.name,
        model: bi(p.model_vi, p.model_ja),
        low: bi(p.price_low_vi, p.price_low_ja),
        high: bi(p.price_high_vi, p.price_high_ja),
        note: bi(p.note_vi, p.note_ja),
        isUser: p.is_ame29,
      })),
    GINZA_COMPARE: priceBenchRows
      .filter((p) => p.segment === "ginza_compare")
      .map((p) => ({
        name: p.name,
        model: bi(p.model_vi, p.model_ja),
        price: bi(p.price_low_vi, p.price_low_ja),
        note: bi(p.note_vi, p.note_ja),
        isUser: p.is_ame29,
      })),
    SCORECARD: (scorecardRes.data ?? []).map((s) => ({ key: s.key, label: bi(s.label_vi, s.label_ja), ame29: s.ame29_score, avg: s.avg_score })),
    ACTIONS: (actionsRes.data ?? []).map((a) => ({ id: a.legacy_id, vi: a.description_vi, ja: a.description_ja })),
  };
}
