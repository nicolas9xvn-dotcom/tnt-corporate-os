"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callGemini, type GeminiAttachment } from "@/lib/gemini";
import type { TaskAttachment } from "@/lib/types";

export interface ApprovalResult {
  error: string | null;
}

interface ApprovalAgent {
  name: string;
  system_prompt: string | null;
  approval_level: number | null;
  business_unit_id: string;
}

const ATTACHMENTS_BUCKET = "task-attachments";

// Level 2: the chairman or the ceo of that agent's own business unit can
// approve. Level 3: chairman only.
function canDecide(viewerRole: string, viewerBusinessUnitId: string | null, agent: ApprovalAgent): boolean {
  if (viewerRole === "chairman") return true;
  const level = agent.approval_level ?? 1;
  return viewerRole === "ceo" && viewerBusinessUnitId === agent.business_unit_id && level <= 2;
}

async function cleanupAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attachments: TaskAttachment[] | null
) {
  if (!supabase || !attachments || attachments.length === 0) return;
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove(attachments.map((a) => a.path));
}

export async function approveTask(taskId: string): Promise<ApprovalResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: viewer } = await supabase
    .from("users")
    .select("role, business_unit_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer) return { error: "Không tìm thấy hồ sơ người dùng." };

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, agent_id, input, status, attachments, agents(name, system_prompt, approval_level, business_unit_id)")
    .eq("id", taskId)
    .single();
  if (taskError || !task) return { error: taskError?.message ?? "Không tìm thấy task." };

  const agent = task.agents as unknown as ApprovalAgent;
  const attachments = task.attachments as TaskAttachment[] | null;
  if (task.status !== "approval_required") return { error: "Task này không ở trạng thái chờ duyệt." };
  if (!canDecide(viewer.role, viewer.business_unit_id, agent)) {
    return { error: "Bạn không có quyền duyệt task này." };
  }
  if (!agent.system_prompt) return { error: "Agent chưa có system prompt." };

  await supabase.rpc("set_agent_status", { p_agent_id: task.agent_id, p_status: "running" });

  try {
    const geminiAttachments: GeminiAttachment[] = [];
    if (attachments && attachments.length > 0) {
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
    }

    const output = await callGemini(agent.system_prompt, task.input ?? "", geminiAttachments);

    await supabase.from("tasks").update({ status: "done", output }).eq("id", taskId);
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "approve_task",
      target: agent.name,
      input: task.input,
      output,
    });
    await cleanupAttachments(supabase, attachments);
    await supabase.rpc("set_agent_status", { p_agent_id: task.agent_id, p_status: "idle" });

    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", taskId);
    await supabase.rpc("set_agent_status", { p_agent_id: task.agent_id, p_status: "error" });
    return { error: message };
  }
}

export async function rejectTask(taskId: string): Promise<ApprovalResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: viewer } = await supabase
    .from("users")
    .select("role, business_unit_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer) return { error: "Không tìm thấy hồ sơ người dùng." };

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, input, status, attachments, agents(name, approval_level, business_unit_id)")
    .eq("id", taskId)
    .single();
  if (taskError || !task) return { error: taskError?.message ?? "Không tìm thấy task." };

  const agent = task.agents as unknown as ApprovalAgent;
  const attachments = task.attachments as TaskAttachment[] | null;
  if (task.status !== "approval_required") return { error: "Task này không ở trạng thái chờ duyệt." };
  if (!canDecide(viewer.role, viewer.business_unit_id, agent)) {
    return { error: "Bạn không có quyền từ chối task này." };
  }

  await supabase.from("tasks").update({ status: "rejected", output: "Bị từ chối duyệt." }).eq("id", taskId);
  await supabase.from("audit_log").insert({
    actor: user.id,
    action: "reject_task",
    target: agent.name,
    input: task.input,
    output: "rejected",
  });
  await cleanupAttachments(supabase, attachments);

  revalidatePath("/dashboard");
  return { error: null };
}
