import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncGooglePlacesRatings } from "@/lib/google-places";

// Vercel Cron hits this once a day (see vercel.json) to refresh Google Maps
// rating/review_count for every competitor that has a google_place_id set —
// see google-places.ts for why only Google Maps can be automated.
// Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET`
// automatically when CRON_SECRET is set in the project's env vars; this
// route rejects anything else so it can't be hit by a random visitor to
// silently burn through the Google Places API quota.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role chưa được cấu hình." }, { status: 500 });
  }

  const { data: businessUnits, error } = await supabase.from("business_units").select("id, name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = [];
  for (const unit of businessUnits ?? []) {
    try {
      const results = await syncGooglePlacesRatings(supabase, unit.id);
      summary.push({ businessUnit: unit.name, synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
    } catch (err) {
      summary.push({ businessUnit: unit.name, error: err instanceof Error ? err.message : "Lỗi không xác định." });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
