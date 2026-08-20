"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/gemini";

export interface RunTaskResult {
  error: string | null;
  output?: string;
  pendingApproval?: boolean;
}

// Executes one task through a specific agent's real system prompt.
// approval_level 1 (or unset — no agent has a value assigned yet, see
// README) runs immediately. approval_level 2/3 files the task as
// "approval_required" instead of calling Gemini — see approvals.ts for the
// approve/reject step that actually runs it.
export async function runAgentTask(agentId: string, input: string): Promise<RunTaskResult> {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Nội dung công việc không được để trống." };

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

  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({
      agent_id: agentId,
      created_by: user.id,
      title: trimmed.slice(0, 80),
      status: needsApproval ? "approval_required" : "in_progress",
      input: trimmed,
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  if (needsApproval) {
    revalidatePath("/dashboard");
    return { error: null, pendingApproval: true };
  }

  try {
    const output = await callGemini(agent.system_prompt, trimmed);

    await supabase.from("tasks").update({ status: "done", output }).eq("id", task.id);
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "run_task",
      target: agent.name,
      input: trimmed,
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
