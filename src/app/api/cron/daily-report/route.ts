import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAgentConversation, MAX_DELEGATIONS_PER_REQUEST } from "@/lib/actions/agent-runner";
import { notifyTelegram } from "@/lib/telegram";

// Vercel Cron hits this once a day (see vercel.json) — the "lên lịch cố
// định" half of 24/7 operation: every business unit's top executive agent
// auto-runs the same "báo cáo tổng quan" prompt as the manual button in
// /dashboard/reports (generateBusinessOverviewReport), except here there's
// no logged-in founder session to run it as, so it uses the service-role
// client directly instead of going through that action. Same
// Authorization check as the other cron routes.
const OVERVIEW_PROMPT = `Viết 1 báo cáo tổng quan kinh doanh ngắn gọn cho hôm nay, gồm 3 phần:
1. Doanh thu gần đây — hỏi Kế toán số liệu thật (không tự bịa).
2. Lịch làm việc hôm nay — tự đọc khung giờ trống thật của từng nhân viên.
3. Vị thế cạnh tranh — hỏi Chiến lược Giá & Dịch vụ về điểm mạnh/yếu so với đối thủ và đề xuất hành động đang còn tồn đọng.
Tổng hợp cả 3 phần lại, viết súc tích, có số liệu cụ thể. Xuất kết quả ra 1 file PDF tên "bao-cao-tong-quan" bằng công cụ generate_file, tiêu đề "Báo cáo tổng quan kinh doanh".`;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role chưa được cấu hình." }, { status: 500 });
  }

  const { data: businessUnits } = await supabase.from("business_units").select("id, name");
  const summary: { businessUnit: string; ok: boolean; note: string }[] = [];

  for (const unit of businessUnits ?? []) {
    // Top executive: no reports_to, has a system prompt (so it can
    // actually run) — same shape CEO AME29 already has.
    const { data: ceoAgent } = await supabase
      .from("agents")
      .select(
        "id, name, system_prompt, house_rules, image_generation, can_read_schedule, can_read_revenue, can_read_competitors, can_read_own_reviews, can_generate_images, can_read_content_calendar, business_unit_id, department_id"
      )
      .eq("business_unit_id", unit.id)
      .eq("level", "executive")
      .is("reports_to", null)
      .not("system_prompt", "is", null)
      .limit(1)
      .maybeSingle();

    if (!ceoAgent) {
      summary.push({ businessUnit: unit.name, ok: false, note: "Chưa có agent executive nào có system prompt." });
      continue;
    }

    // Attribute the auto-run to a real user (created_by is a foreign key)
    // — prefer the chairman, else anyone already tied to this unit.
    const { data: chairman } = await supabase.from("users").select("id").eq("role", "chairman").limit(1).maybeSingle();
    const { data: unitUser } = chairman
      ? { data: chairman }
      : await supabase.from("users").select("id").eq("business_unit_id", unit.id).limit(1).maybeSingle();
    if (!unitUser) {
      summary.push({ businessUnit: unit.name, ok: false, note: "Không tìm được user nào để gán quyền tác giả." });
      continue;
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        agent_id: ceoAgent.id,
        created_by: unitUser.id,
        title: "Báo cáo tổng quan tự động hàng ngày",
        status: "in_progress",
        input: OVERVIEW_PROMPT,
      })
      .select("id")
      .single();
    if (taskError || !task) {
      summary.push({ businessUnit: unit.name, ok: false, note: taskError?.message ?? "Không tạo được task." });
      continue;
    }
    await supabase.from("tasks").update({ root_task_id: task.id }).eq("id", task.id);

    try {
      const result = await runAgentConversation({
        supabase,
        userId: unitUser.id,
        agent: {
          id: ceoAgent.id,
          name: ceoAgent.name,
          system_prompt: ceoAgent.system_prompt as string,
          house_rules: ceoAgent.house_rules,
          image_generation: ceoAgent.image_generation,
          can_read_schedule: ceoAgent.can_read_schedule,
          can_read_revenue: ceoAgent.can_read_revenue,
          can_read_competitors: ceoAgent.can_read_competitors,
          can_read_own_reviews: ceoAgent.can_read_own_reviews,
          can_generate_images: ceoAgent.can_generate_images,
          can_read_content_calendar: ceoAgent.can_read_content_calendar,
          business_unit_id: ceoAgent.business_unit_id,
          department_id: ceoAgent.department_id,
        },
        input: OVERVIEW_PROMPT,
        attachments: [],
        taskId: task.id,
        rootTaskId: task.id,
        depth: 0,
        budget: { remaining: MAX_DELEGATIONS_PER_REQUEST },
      });

      await supabase.from("reports").insert({
        business_unit_id: unit.id,
        text: result.output ?? "",
        created_by: unitUser.id,
        output_file_path: result.generatedFile?.path ?? null,
        output_file_name: result.generatedFile?.name ?? null,
      });
      await notifyTelegram(`📅 Báo cáo tổng quan tự động (${unit.name}):\n${(result.output ?? "").slice(0, 500)}`);
      summary.push({ businessUnit: unit.name, ok: true, note: "Đã tạo báo cáo." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
      await notifyTelegram(`⚠️ Báo cáo tổng quan tự động (${unit.name}) lỗi:\n${message.slice(0, 300)}`);
      summary.push({ businessUnit: unit.name, ok: false, note: message });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
