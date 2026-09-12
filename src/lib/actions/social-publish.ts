"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { downloadFileBuffer } from "@/lib/google-drive";
import { publishFacebookPhoto } from "@/lib/social/facebook";
import { publishInstagramPhoto } from "@/lib/social/instagram";
import { publishTiktokPhoto, publishTiktokVideo } from "@/lib/social/tiktok";
import { uploadTempPublicFile, deleteTempPublicFile } from "@/lib/social/temp-storage";

export interface ActionResult {
  error: string | null;
}

// Publishes a content_calendar item to the real platform it's scheduled
// for. Needs a linked content_asset (the actual photo/video, from Content
// OS ingestion) and a connected social_accounts row for that platform —
// this is the step that turns "lịch content" from a plan into a real post.
export async function publishCalendarItem(calendarItemId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: viewer } = await supabase.from("users").select("role, business_unit_id").eq("id", user.id).maybeSingle();
  if (!viewer) return { error: "Không tìm thấy hồ sơ người dùng." };

  const { data: item } = await supabase
    .from("content_calendar")
    .select("id, business_unit_id, platform, caption, content_asset_id, social_account_id")
    .eq("id", calendarItemId)
    .maybeSingle();
  if (!item) return { error: "Không tìm thấy lịch content." };

  const allowed = viewer.role === "chairman" || viewer.business_unit_id === item.business_unit_id;
  if (!allowed) return { error: "Bạn không có quyền đăng bài này." };

  if (!item.content_asset_id) return { error: "Chưa chọn ảnh/video cho lịch content này." };
  if (!item.caption?.trim()) return { error: "Chưa nhập caption." };
  if (!item.social_account_id) return { error: "Chưa chọn tài khoản mạng xã hội để đăng." };

  const service = createServiceClient();
  if (!service) return { error: "Supabase service role chưa được cấu hình." };

  const { data: asset } = await service
    .from("content_assets")
    .select("id, drive_file_id, file_type")
    .eq("id", item.content_asset_id)
    .maybeSingle();
  if (!asset) return { error: "Không tìm thấy asset." };

  const { data: account } = await service
    .from("social_accounts")
    .select("id, platform, external_account_id")
    .eq("id", item.social_account_id)
    .maybeSingle();
  if (!account) return { error: "Không tìm thấy tài khoản mạng xã hội." };
  if (account.platform !== item.platform) {
    return { error: `Tài khoản đã chọn là ${account.platform}, không khớp nền tảng "${item.platform}" của lịch content này.` };
  }

  const { data: tokenRow } = await service
    .from("social_account_tokens")
    .select("access_token")
    .eq("social_account_id", account.id)
    .maybeSingle();
  if (!tokenRow) return { error: "Tài khoản mạng xã hội chưa có token hợp lệ — hãy kết nối lại." };

  let publishError: string | null = null;
  let externalPostId: string | null = null;
  let permalink: string | null = null;
  let tempPath: string | null = null;

  try {
    const buffer = await downloadFileBuffer(asset.drive_file_id);
    const mimeType = asset.file_type === "video" ? "video/mp4" : "image/jpeg";

    if (account.platform === "facebook") {
      const result = await publishFacebookPhoto(account.external_account_id, tokenRow.access_token, buffer, item.caption);
      externalPostId = result.externalPostId;
      permalink = result.permalink;
    } else if (account.platform === "instagram") {
      const uploaded = await uploadTempPublicFile(buffer, mimeType);
      tempPath = uploaded.path;
      const result = await publishInstagramPhoto(account.external_account_id, tokenRow.access_token, uploaded.url, item.caption);
      externalPostId = result.externalPostId;
      permalink = result.permalink;
    } else if (account.platform === "tiktok") {
      // TikTok gets the raw bytes directly (FILE_UPLOAD) — no public URL
      // bridge needed here, unlike Instagram (see publishTiktokPhoto/
      // publishTiktokVideo for why: PULL_FROM_URL needs DNS-level domain
      // verification this app's free Netlify subdomain can't provide).
      const result =
        asset.file_type === "video"
          ? await publishTiktokVideo(tokenRow.access_token, buffer, item.caption)
          : await publishTiktokPhoto(tokenRow.access_token, buffer, item.caption);
      externalPostId = result.externalPostId;
      permalink = result.permalink;
    } else {
      throw new Error(`Chưa hỗ trợ đăng lên "${account.platform}".`);
    }
  } catch (err) {
    publishError = err instanceof Error ? err.message : "Đăng bài thất bại.";
  } finally {
    if (tempPath) await deleteTempPublicFile(tempPath).catch(() => {});
  }

  if (publishError) {
    await service.from("content_calendar").update({ publish_error: publishError }).eq("id", calendarItemId);
    revalidatePath("/dashboard/content-calendar");
    return { error: publishError };
  }

  await service
    .from("content_calendar")
    .update({
      status: "posted",
      external_post_id: externalPostId,
      permalink,
      published_at: new Date().toISOString(),
      publish_error: null,
    })
    .eq("id", calendarItemId);

  revalidatePath("/dashboard/content-calendar");
  return { error: null };
}

// One-shot UI action: save the asset/caption/account choice for a calendar
// item, then publish it immediately — avoids a separate "save" step for
// the common case of setting these up right before posting.
export async function publishCalendarItemWithSetup(
  calendarItemId: string,
  contentAssetId: string,
  caption: string,
  socialAccountId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  if (!contentAssetId) return { error: "Chưa chọn ảnh/video." };
  if (!caption.trim()) return { error: "Chưa nhập caption." };
  if (!socialAccountId) return { error: "Chưa chọn tài khoản mạng xã hội." };

  const { error } = await supabase
    .from("content_calendar")
    .update({ content_asset_id: contentAssetId, caption: caption.trim(), social_account_id: socialAccountId, publish_error: null })
    .eq("id", calendarItemId);
  if (error) return { error: error.message };

  return publishCalendarItem(calendarItemId);
}
