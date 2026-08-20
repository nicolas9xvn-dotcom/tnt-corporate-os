"use server";

import { GoogleGenAI } from "@google/genai";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ATTACHMENTS_BUCKET } from "@/lib/attachments";
import type { TaskAttachment } from "@/lib/types";

export interface SetHouseRuleResult {
  error: string | null;
  derivedRule?: string;
}

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Founder sets a standing rule once (e.g. "always write captions in this
// style", with a sample photo) — it's rewritten by Gemini into an explicit
// written standard and saved to agents.house_rules, which agent-runner.ts
// then prepends to every future call for that agent. Optionally cascades
// the same rule down the whole reports_to subtree (e.g. giving it to the
// Content Director cascades to TikTok/Facebook/Instagram agents too) so
// one photo shown to the team lead sets the standard for the whole team —
// without having to forward the actual photo through every future task.
async function fetchAllDescendantIds(supabase: Supabase, agentId: string): Promise<string[]> {
  const result: string[] = [];
  let frontier = [agentId];
  while (frontier.length > 0) {
    const { data } = await supabase.from("agents").select("id").in("reports_to", frontier);
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) break;
    result.push(...ids);
    frontier = ids;
  }
  return result;
}

export async function setHouseRule(
  agentId: string,
  instructions: string,
  attachments: TaskAttachment[] = [],
  draftTaskId: string | undefined,
  cascadeToReports: boolean
): Promise<SetHouseRuleResult> {
  const trimmed = instructions.trim();
  if (!trimmed && attachments.length === 0) {
    return { error: "Nội dung quy tắc không được để trống." };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, name, system_prompt")
    .eq("id", agentId)
    .single();
  if (agentError) return { error: agentError.message };
  if (!agent.system_prompt) {
    return { error: "Agent này chưa có system prompt — chưa thể đặt quy tắc." };
  }

  if (!process.env.GEMINI_API_KEY) {
    return { error: "Server chưa cấu hình GEMINI_API_KEY — xem README." };
  }

  let taskId: string;
  if (draftTaskId) {
    taskId = draftTaskId;
  } else {
    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({
        agent_id: agentId,
        created_by: user.id,
        title: `[Quy tắc cố định] ${trimmed.slice(0, 60)}`,
        status: "in_progress",
        input: trimmed,
      })
      .select("id")
      .single();
    if (insertError) return { error: insertError.message };
    taskId = task.id;
  }

  try {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    for (const file of attachments) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .download(file.path);
      if (downloadError || !blob) {
        throw new Error(`Không tải được file đính kèm "${file.name}": ${downloadError?.message ?? ""}`);
      }
      const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
      parts.push({ inlineData: { mimeType: file.mimeType, data: base64 } });
    }

    const rulePrompt = `Bạn đang được giao nhiệm vụ CHỐT một quy tắc/chuẩn mực cố định cho chính công việc của bạn, dùng cho mọi lần làm việc sau này (không phải chỉ áp dụng 1 lần) — dựa trên hướng dẫn và/hoặc ảnh mẫu dưới đây. Viết lại thành 1 đoạn hướng dẫn RÕ RÀNG, CỤ THỂ (văn phong, bố cục, quy tắc cụ thể...) để dùng làm chuẩn mực xuyên suốt. Chỉ viết ra nội dung quy tắc, không chào hỏi, không giải thích thêm.\n\nHướng dẫn từ người quản lý:\n${trimmed}`;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [{ text: rulePrompt }, ...parts],
      config: { systemInstruction: agent.system_prompt, maxOutputTokens: 2048 },
    });
    const derivedRule = response.text ?? "";
    if (!derivedRule) throw new Error("Gemini không trả về quy tắc nào.");

    const targetIds = [agentId, ...(cascadeToReports ? await fetchAllDescendantIds(supabase, agentId) : [])];
    const { error: updateError } = await supabase.from("agents").update({ house_rules: derivedRule }).in("id", targetIds);
    if (updateError) throw new Error(updateError.message);

    await supabase.from("tasks").update({ status: "done", output: derivedRule }).eq("id", taskId);
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "set_house_rule",
      target: agent.name,
      input: trimmed,
      output: `${derivedRule}${cascadeToReports ? `\n\n[Áp dụng cho ${targetIds.length - 1} agent cấp dưới]` : ""}`,
    });

    if (attachments.length > 0) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove(attachments.map((a) => a.path));
    }

    revalidatePath("/dashboard");
    return { error: null, derivedRule };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", taskId);
    return { error: message };
  }
}

export async function clearHouseRule(agentId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const { error } = await supabase.from("agents").update({ house_rules: null }).eq("id", agentId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { error: null };
}
