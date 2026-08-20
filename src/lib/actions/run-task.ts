"use server";

import { GoogleGenAI } from "@google/genai";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface RunTaskResult {
  error: string | null;
  output?: string;
}

// Executes one task through a specific agent's real system prompt, via the
// Gemini API free tier (Google AI Studio key — no billing required).
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

  if (!process.env.GEMINI_API_KEY) {
    return { error: "Server chưa cấu hình GEMINI_API_KEY — xem README." };
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
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: trimmed,
      config: {
        systemInstruction: agent.system_prompt,
        maxOutputTokens: 4096,
      },
    });

    const output = response.text ?? "";

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
