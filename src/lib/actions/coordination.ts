"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

// Delivered to whichever agent is currently "on stage" in this delegation
// chain — see checkCoordination in agent-runner.ts, polled once per
// tool-calling round. RLS (task_messages_insert, migration 0024) already
// restricts this to the same business unit as the session's root task.
export async function sendCoordinationMessage(rootTaskId: string, text: string): Promise<ActionResult> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Nội dung không được để trống." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase
    .from("task_messages")
    .insert({ root_task_id: rootTaskId, text: trimmed, created_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/room");
  return { error: null };
}

// Soft stop: flips a flag the running chain checks once per round (see
// checkCoordination in agent-runner.ts) — not an instant kill, but the
// whole run lives inside one synchronous request/recursion so there is no
// background job to cancel out-of-band anyway.
export async function stopTaskSession(rootTaskId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase.from("tasks").update({ stop_requested: true }).eq("id", rootTaskId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/room");
  return { error: null };
}
