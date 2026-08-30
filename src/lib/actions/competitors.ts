"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

async function requireEditAccess(businessUnitId: string) {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." as const, supabase: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." as const, supabase: null };

  const { data: viewer } = await supabase
    .from("users")
    .select("role, business_unit_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer) return { error: "Không tìm thấy hồ sơ người dùng." as const, supabase: null };

  const allowed = viewer.role === "chairman" || (viewer.role === "ceo" && viewer.business_unit_id === businessUnitId);
  if (!allowed) return { error: "Bạn không có quyền sửa dữ liệu này." as const, supabase: null };

  return { error: null, supabase };
}

// Founder edits price/Google Place ID for one competitor — everything else
// (Hotpepper/Instagram/TikTok text) goes through upsertCompetitorPlatform
// below since each platform is its own row.
export async function updateCompetitorFields(
  businessUnitId: string,
  competitorId: string,
  fields: { price_vi: string | null; google_place_id: string | null }
): Promise<ActionResult> {
  const { error, supabase } = await requireEditAccess(businessUnitId);
  if (error || !supabase) return { error };

  const { error: updateError } = await supabase
    .from("competitors")
    .update({
      price_vi: fields.price_vi?.trim() || null,
      google_place_id: fields.google_place_id?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", competitorId)
    .eq("business_unit_id", businessUnitId);

  if (updateError) return { error: updateError.message };
  revalidatePath("/dashboard/competitors");
  return { error: null };
}

// One row per (competitor, platform) — upsert covers both "edit existing
// platform" and "add a platform this competitor didn't have data for yet".
export async function upsertCompetitorPlatform(
  businessUnitId: string,
  competitorId: string,
  platform: string,
  fields: { summary_vi: string | null; detail_vi: string | null; url: string | null }
): Promise<ActionResult> {
  const { error, supabase } = await requireEditAccess(businessUnitId);
  if (error || !supabase) return { error };

  const { error: upsertError } = await supabase.from("competitor_platform_stats").upsert(
    {
      competitor_id: competitorId,
      platform,
      summary_vi: fields.summary_vi?.trim() || null,
      detail_vi: fields.detail_vi?.trim() || null,
      url: fields.url?.trim() || null,
      source: "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "competitor_id,platform" }
  );

  if (upsertError) return { error: upsertError.message };
  revalidatePath("/dashboard/competitors");
  return { error: null };
}

export async function toggleCompetitorAction(businessUnitId: string, actionId: string, done: boolean): Promise<ActionResult> {
  const { error, supabase } = await requireEditAccess(businessUnitId);
  if (error || !supabase) return { error };

  const { error: updateError } = await supabase
    .from("competitor_actions")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("business_unit_id", businessUnitId);

  if (updateError) return { error: updateError.message };
  revalidatePath("/dashboard/competitors");
  return { error: null };
}
