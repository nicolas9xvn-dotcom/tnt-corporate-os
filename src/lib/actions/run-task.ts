"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface RunTaskResult {
  error: string | null;
  output?: string;
}

// Executes one task through a specific agent's real system prompt.
// TODO(phase-2): approval_level (1/2/3) is not enforced here yet — every
// task runs immediately regardless of the agent's level. Add a review/
// approve step before this goes to level 2/3 agents for real.
export async function runAgentTask(agentId: string, input: string): Promise<RunTaskResult> {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Nội dung công việc không được để trống." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Server chưa cấu hình ANTHROPIC_API_KEY — xem README." };
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, name, system_prompt")
    .eq("id", agentId)
    .single();

  if (agentError) return { error: agentError.message };
  if (!agent.system_prompt) {
    return { error: "Agent này chưa có system prompt — chưa thể giao việc." };
  }

  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({
      agent_id: agentId,
      created_by: user.id,
      title: trimmed.slice(0, 80),
      status: "in_progress",
      input: trimmed,
    })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      system: agent.system_prompt,
      messages: [{ role: "user", content: trimmed }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );
    const output = textBlock?.text ?? "";

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
    const message = err instanceof Error ? err.message : "Gọi Claude API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", task.id);
    return { error: message };
  }
}
