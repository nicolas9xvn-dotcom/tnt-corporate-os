"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callGemini, type GeminiAttachment } from "@/lib/gemini";
import { loadAgentHistory } from "./agent-history";
import { ATTACHMENTS_BUCKET } from "@/lib/attachments";
import type { TaskAttachment } from "@/lib/types";

export interface RunTaskResult {
  error: string | null;
  output?: string;
  pendingApproval?: boolean;
}

export interface DraftResult {
  taskId: string | null;
  error: string | null;
}

// Step 1, only needed when the task has file attachments: create an empty
// task row up front so the browser can upload files straight to Supabase
// Storage next (see run-task-form.tsx) — the file bytes never pass through
// this Next.js server at all, which is what lets attachments be far bigger
// than Vercel's ~4.5MB request-body limit on Server Actions would otherwise
// allow. Storage's own RLS policy (migration 0008) checks the task row
// exists and belongs to the caller before permitting the upload, hence
// creating the row first.
export async function createTaskDraft(agentId: string): Promise<DraftResult> {
  const supabase = await createClient();
  if (!supabase) return { taskId: null, error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { taskId: null, error: "Bạn cần đăng nhập." };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({ agent_id: agentId, created_by: user.id, title: "(đang tải file lên...)", status: "pending", input: "" })
    .select("id")
    .single();

  if (error) return { taskId: null, error: error.message };
  return { taskId: task.id, error: null };
}

// Cleans up a draft task if the browser-side upload failed partway through
// (e.g. network drop on file 2 of 3) — nothing was ever really "submitted",
// so nothing should be left behind.
export async function cancelTaskDraft(taskId: string): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;

  const { data: files } = await supabase.storage.from(ATTACHMENTS_BUCKET).list(taskId);
  if (files && files.length > 0) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove(files.map((f) => `${taskId}/${f.name}`));
  }
  await supabase.from("tasks").delete().eq("id", taskId).eq("status", "pending");
}

// Runs a task through a specific agent's real system prompt. `attachments`
// (if any) must already be sitting in the "task-attachments" Storage bucket
// — pass `draftTaskId` from createTaskDraft() when there are files, or omit
// both for a text-only task (no draft/upload round-trip needed then).
export async function runAgentTask(
  agentId: string,
  input: string,
  attachments: TaskAttachment[] = [],
  draftTaskId?: string
): Promise<RunTaskResult> {
  const trimmed = input.trim();
  if (!trimmed && attachments.length === 0) {
    return { error: "Nội dung công việc không được để trống." };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, name, system_prompt, approval_level")
    .eq("id", agentId)
    .single();

  if (agentError) return { error: agentError.message };
  if (!agent.system_prompt) {
    return { error: "Agent này chưa có system prompt — chưa thể giao việc." };
  }

  const needsApproval = (agent.approval_level ?? 1) >= 2;
  const attachmentNote =
    attachments.length > 0 ? `\n\n[Đính kèm: ${attachments.map((a) => a.name).join(", ")}]` : "";
  const storedInput = trimmed + attachmentNote;
  const status = needsApproval ? "approval_required" : "in_progress";

  let taskId: string;
  if (draftTaskId) {
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        title: storedInput.slice(0, 80),
        input: storedInput,
        status,
        attachments: attachments.length > 0 ? attachments : null,
      })
      .eq("id", draftTaskId);
    if (updateError) return { error: updateError.message };
    taskId = draftTaskId;
  } else {
    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({ agent_id: agentId, created_by: user.id, title: storedInput.slice(0, 80), status, input: storedInput })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    taskId = task.id;
  }

  if (needsApproval) {
    revalidatePath("/dashboard");
    return { error: null, pendingApproval: true };
  }

  await supabase.rpc("set_agent_status", { p_agent_id: agentId, p_status: "running" });

  try {
    const geminiAttachments: GeminiAttachment[] = [];
    for (const file of attachments) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .download(file.path);
      if (downloadError || !blob) {
        throw new Error(`Không tải được file đính kèm "${file.name}": ${downloadError?.message ?? ""}`);
      }
      const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      geminiAttachments.push({ mimeType: file.mimeType, base64 });
    }

    const history = await loadAgentHistory(supabase, agentId);
    const output = await callGemini(agent.system_prompt, trimmed, geminiAttachments, history);

    await supabase.from("tasks").update({ status: "done", output }).eq("id", taskId);
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "run_task",
      target: agent.name,
      input: storedInput,
      output,
    });
    if (attachments.length > 0) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove(attachments.map((a) => a.path));
    }
    await supabase.rpc("set_agent_status", { p_agent_id: agentId, p_status: "idle" });

    revalidatePath("/dashboard");
    return { error: null, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", taskId);
    await supabase.rpc("set_agent_status", { p_agent_id: agentId, p_status: "error" });
    return { error: message };
  }
}
