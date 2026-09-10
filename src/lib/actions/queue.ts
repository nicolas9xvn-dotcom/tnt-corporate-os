"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { drainQueue } from "@/lib/queue-runner";

export interface ActionResult {
  error: string | null;
}

// Fire-and-forget: unlike runAgentTask (run-task.ts), the caller does NOT
// wait for this to finish — it just joins task_queue and a Vercel Cron job
// (or "Xử lý hàng đợi ngay" below) picks it up later. Meant for work that
// doesn't need a live answer right now ("xử lý việc nặng khi tôi không mở
// máy") — no file attachments support yet (see migration 0025).
export async function enqueueTask(agentId: string, input: string): Promise<ActionResult> {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Nội dung công việc không được để trống." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase.from("task_queue").insert({ agent_id: agentId, input: trimmed, created_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/room");
  return { error: null };
}

// Manual drain using the CALLER's own session (not service-role) — mainly
// so the queue can be tested/used immediately without waiting for the next
// Cron tick, and so it still works at all on a Vercel Hobby plan (crons
// there are limited to once a day).
export async function processQueueNow(): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  await drainQueue(supabase, 3);
  revalidatePath("/dashboard/room");
  return { error: null };
}
