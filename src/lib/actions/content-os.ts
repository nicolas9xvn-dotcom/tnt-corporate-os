"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_FOLDER_NAME, CATEGORY_FOLDER_NAMES, ensureChildFolder, moveFile } from "@/lib/google-drive";
import type { AssetCategory } from "@/lib/asset-classifier";

export interface ActionResult {
  error: string | null;
}

const CATEGORY_OPTIONS: AssetCategory[] = ["NAIL", "PARTS_CHARM", "SALON", "PROCESS", "PEOPLE", "CUSTOMER", "BRAND_MOOD"];

function monthLabel(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Manager picks the correct category for a REVIEW-queue asset — moves the
// real Drive file into the right folder, updates the asset row, and logs a
// classification_feedback row (fed back into future classification prompts
// as a "the AI got this wrong before" example — see asset-classifier.ts).
export async function resolveReviewItem(assetId: string, correctCategory: AssetCategory): Promise<ActionResult> {
  if (!CATEGORY_OPTIONS.includes(correctCategory)) {
    return { error: "Category không hợp lệ." };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: asset, error: assetError } = await supabase
    .from("content_assets")
    .select("id, business_unit_id, drive_file_id, category")
    .eq("id", assetId)
    .single();
  if (assetError || !asset) return { error: assetError?.message ?? "Không tìm thấy asset." };

  const { data: unit, error: unitError } = await supabase
    .from("business_units")
    .select("google_drive_root_folder_id")
    .eq("id", asset.business_unit_id)
    .single();
  if (unitError || !unit?.google_drive_root_folder_id) {
    return { error: "Chưa cấu hình Google Drive cho công ty con này." };
  }

  try {
    const rootId = unit.google_drive_root_folder_id;
    const reviewFolderId = await ensureChildFolder(rootId, REVIEW_FOLDER_NAME);
    const categoryFolderId = await ensureChildFolder(rootId, CATEGORY_FOLDER_NAMES[correctCategory]);
    const targetFolderId = await ensureChildFolder(categoryFolderId, monthLabel(new Date()));

    await moveFile(asset.drive_file_id, reviewFolderId, targetFolderId);

    await supabase
      .from("content_assets")
      .update({ category: correctCategory, status: "UNUSED", review_reason: null, reviewed_by: user.id })
      .eq("id", assetId);

    await supabase.from("classification_feedback").insert({
      asset_id: assetId,
      ai_category: asset.category,
      human_category: correctCategory,
      corrected_by: user.id,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không xử lý được trên Google Drive." };
  }

  revalidatePath("/dashboard/content-os");
  return { error: null };
}
