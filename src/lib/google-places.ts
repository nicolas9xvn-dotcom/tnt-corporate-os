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

export interface OwnReview {
  authorName: string;
  rating: number | null;
  text: string;
  relativeTime: string;
  publishTime: string | null;
}

interface GooglePlaceReviewsResult {
  rating?: number;
  userRatingCount?: number;
  reviews?: Array<{
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: { displayName?: string };
  }>;
}

// Reads AME29's OWN real reviews — reuses the same Places API (New) key
// already required for competitor rating sync, no separate Google Business
// Profile OAuth/verification needed (that API requires Google's approval
// and owner sign-in; Places API's public "reviews" field works for any
// place, including your own, with just an API key). The tradeoff: Google
// only returns up to 5 "most relevant" reviews per place through this
// endpoint — not the full review history — so this is a snapshot, not a
// complete inbox.
export async function getOwnReviews(supabase: SupabaseClient, businessUnitId: string): Promise<OwnReview[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình GOOGLE_PLACES_API_KEY — xem README.");
  }

  const { data: ownRow, error } = await supabase
    .from("competitors")
    .select("google_place_id")
    .eq("business_unit_id", businessUnitId)
    .eq("is_ame29", true)
    .maybeSingle();
  if (error) {
    throw new Error(`Không đọc được cấu hình Google Place ID: ${error.message}`);
  }
  const placeId = ownRow?.google_place_id as string | null | undefined;
  if (!placeId) {
    throw new Error(
      "Chưa cấu hình Google Place ID cho AME29 — vào trang \"Dữ liệu đối thủ\", dòng \"AME29 Nail (bản)\", điền Place ID rồi lưu lại."
    );
  }

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "rating,userRatingCount,reviews",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places API lỗi ${res.status}: ${body.slice(0, 200)}`);
  }
  const place = (await res.json()) as GooglePlaceReviewsResult;

  return (place.reviews ?? []).map((r) => ({
    authorName: r.authorAttribution?.displayName ?? "Khách ẩn danh",
    rating: r.rating ?? null,
    text: r.text?.text ?? "",
    relativeTime: r.relativePublishTimeDescription ?? "",
    publishTime: r.publishTime ?? null,
  }));
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
