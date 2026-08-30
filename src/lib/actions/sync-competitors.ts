"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncGooglePlacesRatings, type CompetitorSyncResult } from "@/lib/google-places";

export interface SyncCompetitorsResult {
  error: string | null;
  results?: CompetitorSyncResult[];
}

// Manual "Đồng bộ Google Maps" button on the competitors admin page — the
// same sync also runs automatically once a day via the Vercel Cron route
// (src/app/api/cron/sync-competitors/route.ts), this just lets the founder
// trigger it on demand instead of waiting for the schedule.
export async function syncCompetitorGoogleRatings(businessUnitId: string): Promise<SyncCompetitorsResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: viewer } = await supabase
    .from("users")
    .select("role, business_unit_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer) return { error: "Không tìm thấy hồ sơ người dùng." };

  const allowed = viewer.role === "chairman" || (viewer.role === "ceo" && viewer.business_unit_id === businessUnitId);
  if (!allowed) return { error: "Bạn không có quyền đồng bộ dữ liệu này." };

  try {
    const results = await syncGooglePlacesRatings(supabase, businessUnitId);
    revalidatePath("/dashboard/competitors");
    return { error: null, results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Đồng bộ Google Maps thất bại." };
  }
}
