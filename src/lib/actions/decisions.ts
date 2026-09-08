"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

// decisions has no business_unit_id (corporate/HĐQT-level log) and RLS
// (decisions_chairman_only, migration 0002) already restricts every
// operation to the chairman — this only re-checks so the UI can show a
// clean error instead of a raw Postgres RLS rejection.
export async function addDecision(fields: {
  title: string;
  context: string;
  recommendation: string;
  decision: string;
  reason: string;
}): Promise<ActionResult> {
  const title = fields.title.trim();
  if (!title) return { error: "Tiêu đề không được để trống." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: viewer } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  if (!viewer || viewer.role !== "chairman") return { error: "Chỉ chairman mới ghi được quyết định HĐQT." };

  const { error } = await supabase.from("decisions").insert({
    title,
    context: fields.context.trim() || null,
    recommendation: fields.recommendation.trim() || null,
    decision: fields.decision.trim() || null,
    reason: fields.reason.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/decisions");
  return { error: null };
}
