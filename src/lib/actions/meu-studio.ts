"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EPISODE_STATUSES, OPTIONAL_REFS, SIGNATURE_STATES, qcPassed } from "@/lib/meu-studio";

export interface ActionResult {
  error: string | null;
}

const BASE_PATH = "/dashboard/meu-studio";

async function authedClient() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, userId: null, error: "Supabase chưa được cấu hình." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, userId: null, error: "Bạn cần đăng nhập." };
  return { supabase, userId: user.id, error: null };
}

export async function createEpisode(
  businessUnitId: string,
  title: string,
  signatureState: string
): Promise<ActionResult & { id?: string }> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: "Tên tập không được để trống." };
  if (!SIGNATURE_STATES.some((s) => s.value === signatureState)) return { error: "Signature State không hợp lệ." };

  const { supabase, userId, error: authError } = await authedClient();
  if (!supabase) return { error: authError };

  const { count } = await supabase
    .from("meu_episodes")
    .select("id", { count: "exact", head: true })
    .eq("business_unit_id", businessUnitId);
  const code = `T${String((count ?? 0) + 1).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("meu_episodes")
    .insert({
      business_unit_id: businessUnitId,
      code,
      title: trimmedTitle,
      signature_state: signatureState,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(BASE_PATH);
  return { error: null, id: data.id };
}

export interface EpisodeFields {
  title: string;
  signature_state: string;
  status: string;
  synopsis: string;
  setting: string;
  sound: string;
  overlay_text: string;
  refs: string[];
}

export async function updateEpisode(id: string, fields: EpisodeFields): Promise<ActionResult> {
  if (!fields.title.trim()) return { error: "Tên tập không được để trống." };
  if (!SIGNATURE_STATES.some((s) => s.value === fields.signature_state)) return { error: "Signature State không hợp lệ." };
  if (!EPISODE_STATUSES.some((s) => s.value === fields.status)) return { error: "Trạng thái không hợp lệ." };

  const { supabase, error: authError } = await authedClient();
  if (!supabase) return { error: authError };

  const { error } = await supabase
    .from("meu_episodes")
    .update({
      title: fields.title.trim(),
      signature_state: fields.signature_state,
      status: fields.status,
      synopsis: fields.synopsis.trim() || null,
      setting: fields.setting.trim() || null,
      sound: fields.sound.trim() || null,
      overlay_text: fields.overlay_text.trim() || null,
      refs: fields.refs.filter((r) => OPTIONAL_REFS.some((o) => o.value === r)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${id}`);
  return { error: null };
}

export async function addShot(episodeId: string, framing: string, action: string): Promise<ActionResult> {
  if (!action.trim()) return { error: "Hành động không được để trống." };

  const { supabase, error: authError } = await authedClient();
  if (!supabase) return { error: authError };

  const { data: last } = await supabase
    .from("meu_shots")
    .select("position")
    .eq("episode_id", episodeId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("meu_shots").insert({
    episode_id: episodeId,
    position: (last?.position ?? 0) + 1,
    framing: framing.trim() || null,
    action: action.trim(),
  });
  if (error) return { error: error.message };

  revalidatePath(`${BASE_PATH}/${episodeId}`);
  return { error: null };
}

export async function deleteShot(id: string, episodeId: string): Promise<ActionResult> {
  const { supabase, error: authError } = await authedClient();
  if (!supabase) return { error: authError };

  const { error } = await supabase.from("meu_shots").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`${BASE_PATH}/${episodeId}`);
  return { error: null };
}

export async function addClipReview(
  episodeId: string,
  clipLabel: string,
  checks: Record<string, boolean>,
  notes: string
): Promise<ActionResult> {
  if (!clipLabel.trim()) return { error: "Cần đặt tên clip (VD: T07-v2-1)." };

  const { supabase, userId, error: authError } = await authedClient();
  if (!supabase) return { error: authError };

  const { error } = await supabase.from("meu_clip_reviews").insert({
    episode_id: episodeId,
    clip_label: clipLabel.trim(),
    checks,
    passed: qcPassed(checks),
    notes: notes.trim() || null,
    created_by: userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`${BASE_PATH}/${episodeId}`);
  return { error: null };
}

// Hands a finished episode to the existing content calendar of the same
// business unit (TikTok, draft) and links the two rows.
export async function scheduleEpisode(episodeId: string, scheduledDate: string): Promise<ActionResult> {
  if (!scheduledDate) return { error: "Cần chọn ngày đăng." };

  const { supabase, userId, error: authError } = await authedClient();
  if (!supabase) return { error: authError };

  const { data: episode, error: episodeError } = await supabase
    .from("meu_episodes")
    .select("id, business_unit_id, code, title, overlay_text, content_calendar_id")
    .eq("id", episodeId)
    .maybeSingle();
  if (episodeError) return { error: episodeError.message };
  if (!episode) return { error: "Không tìm thấy tập phim." };
  if (episode.content_calendar_id) return { error: "Tập này đã được đưa vào Lịch Content." };

  const { data: calendarItem, error: calendarError } = await supabase
    .from("content_calendar")
    .insert({
      business_unit_id: episode.business_unit_id,
      title: `MỀU ${episode.code} — ${episode.title}`,
      platform: "tiktok",
      scheduled_date: scheduledDate,
      notes: episode.overlay_text ? `Overlay: ${episode.overlay_text}` : null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (calendarError) return { error: calendarError.message };

  const { error } = await supabase
    .from("meu_episodes")
    .update({ content_calendar_id: calendarItem.id, updated_at: new Date().toISOString() })
    .eq("id", episodeId);
  if (error) return { error: error.message };

  revalidatePath(`${BASE_PATH}/${episodeId}`);
  revalidatePath("/dashboard/content-calendar");
  return { error: null };
}
