import type { SupabaseClient } from "@supabase/supabase-js";

// Keeps the Google Maps rating/review_count on competitor_platform_stats
// fresh automatically — the one platform among gmaps/hotpepper/instagram/
// tiktok/minimo/naily that has a real, legitimate public API for this.
// Hotpepper/Instagram/TikTok/Minimo have no equivalent, so those stay
// manually edited (see the competitors admin page). Only touches rows for
// competitors that have a google_place_id set — everything else is
// untouched. Never overwrites the founder's own qualitative write-up
// (detail_vi) — only the numeric rating/review_count and a regenerated
// one-line summary_vi.
interface GooglePlaceResult {
  rating?: number;
  userRatingCount?: number;
}

async function fetchGooglePlace(placeId: string, apiKey: string): Promise<GooglePlaceResult> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "rating,userRatingCount",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places API lỗi ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export interface CompetitorSyncResult {
  competitorId: string;
  name: string;
  ok: boolean;
  rating?: number;
  reviewCount?: number;
  error?: string;
}

export async function syncGooglePlacesRatings(
  supabase: SupabaseClient,
  businessUnitId: string
): Promise<CompetitorSyncResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình GOOGLE_PLACES_API_KEY — xem README.");
  }

  const { data: competitors, error } = await supabase
    .from("competitors")
    .select("id, name, google_place_id")
    .eq("business_unit_id", businessUnitId)
    .not("google_place_id", "is", null);
  if (error) {
    throw new Error(`Không đọc được danh sách đối thủ có Google Place ID: ${error.message}`);
  }

  const results: CompetitorSyncResult[] = [];

  for (const competitor of competitors ?? []) {
    try {
      const place = await fetchGooglePlace(competitor.google_place_id as string, apiKey);
      const rating = place.rating ?? null;
      const reviewCount = place.userRatingCount ?? null;
      const summary = rating != null && reviewCount != null ? `${rating}★ / ${reviewCount} review` : undefined;
      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from("competitor_platform_stats")
        .select("id")
        .eq("competitor_id", competitor.id)
        .eq("platform", "gmaps")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("competitor_platform_stats")
          .update({
            rating,
            review_count: reviewCount,
            summary_vi: summary,
            source: "google_places_api",
            synced_at: now,
            updated_at: now,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("competitor_platform_stats").insert({
          competitor_id: competitor.id,
          platform: "gmaps",
          rating,
          review_count: reviewCount,
          summary_vi: summary,
          source: "google_places_api",
          synced_at: now,
        });
      }

      results.push({
        competitorId: competitor.id,
        name: competitor.name,
        ok: true,
        rating: rating ?? undefined,
        reviewCount: reviewCount ?? undefined,
      });
    } catch (err) {
      results.push({
        competitorId: competitor.id,
        name: competitor.name,
        ok: false,
        error: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
    }
  }

  return results;
}
