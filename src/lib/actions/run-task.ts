"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callGemini, type GeminiAttachment } from "@/lib/gemini";

export interface RunTaskResult {
  error: string | null;
  output?: string;
  pendingApproval?: boolean;
}

export interface RunTaskAttachment {
  name: string;
  mimeType: string;
  base64: string;
}

// Executes one task through a specific agent's real system prompt.
// approval_level 1 (or unset) runs immediately. approval_level 2/3 files the
// task as "approval_required" instead of calling Gemini — see approvals.ts
// for the approve/reject step that actually runs it. Attachments are only
// supported on the immediate-run path: they're sent straight to Gemini and
// never persisted, so there'd be nothing left to send once an approver
// picks the task back up later — the UI hides the file input for agents
// that require approval (see run-task-form.tsx).
export async function runAgentTask(
  agentId: string,
  input: string,
  attachments: RunTaskAttachment[] = []
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
  if (needsApproval && attachments.length > 0) {
    return {
      error:
        "Agent này cần duyệt trước khi chạy nên chưa hỗ trợ đính kèm file — bỏ file, chỉ gửi nội dung chữ.",
    };
  }

  const attachmentNote =
    attachments.length > 0 ? `\n\n[Đính kèm: ${attachments.map((a) => a.name).join(", ")}]` : "";
  const storedInput = trimmed + attachmentNote;

  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({
      agent_id: agentId,
      created_by: user.id,
      title: storedInput.slice(0, 80),
      status: needsApproval ? "approval_required" : "in_progress",
      input: storedInput,
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  if (needsApproval) {
    revalidatePath("/dashboard");
    return { error: null, pendingApproval: true };
  }

  try {
    const geminiAttachments: GeminiAttachment[] = attachments.map((a) => ({
      mimeType: a.mimeType,
      base64: a.base64,
    }));
    const output = await callGemini(agent.system_prompt, trimmed, geminiAttachments);

    await supabase.from("tasks").update({ status: "done", output }).eq("id", task.id);
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "run_task",
      target: agent.name,
      input: storedInput,
      output,
    });

    revalidatePath("/dashboard");
    return { error: null, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", task.id);
    return { error: message };
  }
}
