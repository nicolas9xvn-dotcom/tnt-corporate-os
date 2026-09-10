import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgentConversation, MAX_DELEGATIONS_PER_REQUEST } from "./actions/agent-runner";
import { notifyTelegram } from "./telegram";

export interface DrainResult {
  processed: number;
  items: { id: string; status: "done" | "failed"; agentName: string }[];
}

// Shared by both the Vercel Cron route (service-role client, no logged-in
// user — see api/cron/process-queue) and the "Xử lý hàng đợi ngay" manual
// button (the caller's own session client) — same drain logic either way,
// just a different Supabase client and how many items it's allowed to see
// (RLS for the session client, everything for service-role). No "use
// server" here: this takes a raw SupabaseClient argument, which Next.js
// server actions can't (their args must be serializable), so it lives as a
// plain module imported by the actual "use server" actions/route handler —
// same split as agent-runner.ts itself.
export async function drainQueue(supabase: SupabaseClient, limit = 3): Promise<DrainResult> {
  const { data: queued } = await supabase
    .from("task_queue")
    .select("id, agent_id, input, created_by")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  const items: DrainResult["items"] = [];

  for (const item of queued ?? []) {
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select(
        "id, name, system_prompt, approval_level, house_rules, image_generation, can_read_schedule, can_read_revenue, can_read_competitors, business_unit_id"
      )
      .eq("id", item.agent_id)
      .single();

    if (agentError || !agent) {
      await supabase
        .from("task_queue")
        .update({ status: "failed", error: agentError?.message ?? "Không tìm thấy agent.", processed_at: new Date().toISOString() })
        .eq("id", item.id);
      continue;
    }
    if (!agent.system_prompt || !item.created_by) {
      await supabase
        .from("task_queue")
        .update({
          status: "failed",
          error: !agent.system_prompt ? "Agent chưa có system prompt." : "Thiếu người tạo việc.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      continue;
    }

    await supabase.from("task_queue").update({ status: "processing" }).eq("id", item.id);

    const needsApproval = (agent.approval_level ?? 1) >= 2;
    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({
        agent_id: item.agent_id,
        created_by: item.created_by,
        title: item.input.slice(0, 80),
        status: needsApproval ? "approval_required" : "in_progress",
        input: item.input,
      })
      .select("id")
      .single();

    if (insertError || !task) {
      await supabase
        .from("task_queue")
        .update({ status: "failed", error: insertError?.message ?? "Không tạo được task.", processed_at: new Date().toISOString() })
        .eq("id", item.id);
      continue;
    }
    await supabase.from("tasks").update({ root_task_id: task.id }).eq("id", task.id);

    if (needsApproval) {
      await supabase
        .from("task_queue")
        .update({ status: "done", result_task_id: task.id, processed_at: new Date().toISOString() })
        .eq("id", item.id);
      await notifyTelegram(`⏳ [Hàng đợi nền] ${agent.name} cần bạn duyệt trước khi chạy:\n${item.input.slice(0, 300)}`);
      items.push({ id: item.id, status: "done", agentName: agent.name });
      continue;
    }

    try {
      const result = await runAgentConversation({
        supabase,
        userId: item.created_by,
        agent: {
          id: agent.id,
          name: agent.name,
          system_prompt: agent.system_prompt,
          house_rules: agent.house_rules,
          image_generation: agent.image_generation,
          can_read_schedule: agent.can_read_schedule,
          can_read_revenue: agent.can_read_revenue,
          can_read_competitors: agent.can_read_competitors,
          business_unit_id: agent.business_unit_id,
        },
        input: item.input,
        attachments: [],
        taskId: task.id,
        rootTaskId: task.id,
        depth: 0,
        budget: { remaining: MAX_DELEGATIONS_PER_REQUEST },
      });

      await supabase
        .from("task_queue")
        .update({ status: "done", result_task_id: task.id, processed_at: new Date().toISOString() })
        .eq("id", item.id);
      await notifyTelegram(`✅ [Hàng đợi nền] ${agent.name} đã xong việc:\n${(result.output ?? "").slice(0, 500)}`);
      items.push({ id: item.id, status: "done", agentName: agent.name });
    } catch (err) {
      // runAgentConversation's own catch already marked the `tasks` row
      // 'failed' with a message — just reflect that outcome on the queue
      // item too, still linked via result_task_id so it's visible in
      // "Phòng họp"/task history.
      const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
      await supabase
        .from("task_queue")
        .update({ status: "failed", error: message, result_task_id: task.id, processed_at: new Date().toISOString() })
        .eq("id", item.id);
      await notifyTelegram(`⚠️ [Hàng đợi nền] ${agent.name} gặp lỗi khi chạy việc:\n${message.slice(0, 300)}`);
      items.push({ id: item.id, status: "failed", agentName: agent.name });
    }
  }

  return { processed: items.length, items };
}
