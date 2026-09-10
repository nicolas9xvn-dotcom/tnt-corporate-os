"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

export async function addContentCalendarItem(
  businessUnitId: string,
  title: string,
  platform: string,
  scheduledDate: string,
  notes: string
): Promise<ActionResult> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: "Tiêu đề không được để trống." };
  if (!scheduledDate) return { error: "Cần chọn ngày." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase.from("content_calendar").insert({
    business_unit_id: businessUnitId,
    title: trimmedTitle,
    platform,
    scheduled_date: scheduledDate,
    notes: notes.trim() || null,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/content-calendar");
  return { error: null };
}

export async function updateContentCalendarStatus(id: string, status: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase.from("content_calendar").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/content-calendar");
  return { error: null };
}
