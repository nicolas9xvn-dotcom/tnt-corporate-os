"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAgentTask } from "./run-task";

export interface ActionResult {
  error: string | null;
}

export async function addReport(businessUnitId: string, text: string): Promise<ActionResult> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Nội dung báo cáo không được để trống." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase.from("reports").insert({ business_unit_id: businessUnitId, text: trimmed, created_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/reports");
  return { error: null };
}

// The founder's own idea: a one-click "báo cáo tổng quan" that pulls real
// numbers instead of another blank text box. Reuses the CEO agent's
// EXISTING tools rather than adding new backend logic — CEO AME29 already
// has can_read_schedule directly, and can delegate to its own direct
// reports ("Kế toán" for revenue, "Chiến lược Giá & Dịch vụ" for
// competitor position) via the delegate_to_agent tool built earlier, then
// generate_file turns the synthesis into a real downloadable PDF.
const OVERVIEW_PROMPT = `Viết 1 báo cáo tổng quan kinh doanh ngắn gọn cho hôm nay, gồm 3 phần:
1. Doanh thu gần đây — hỏi Kế toán số liệu thật (không tự bịa).
2. Lịch làm việc hôm nay — tự đọc khung giờ trống thật của từng nhân viên.
3. Vị thế cạnh tranh — hỏi Chiến lược Giá & Dịch vụ về điểm mạnh/yếu so với đối thủ và đề xuất hành động đang còn tồn đọng.
Tổng hợp cả 3 phần lại, viết súc tích, có số liệu cụ thể. Xuất kết quả ra 1 file PDF tên "bao-cao-tong-quan" bằng công cụ generate_file, tiêu đề "Báo cáo tổng quan kinh doanh".`;

export interface GenerateOverviewResult {
  error: string | null;
  reportText?: string;
  downloadUrl?: string;
  fileName?: string;
}

export async function generateBusinessOverviewReport(
  businessUnitId: string,
  ceoAgentId: string
): Promise<GenerateOverviewResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const result = await runAgentTask(ceoAgentId, OVERVIEW_PROMPT);
  if (result.error) return { error: result.error };
  if (result.pendingApproval) {
    return { error: "CEO đang cần duyệt trước khi chạy việc này — kiểm tra approval_level của agent." };
  }

  const { error: insertError } = await supabase.from("reports").insert({
    business_unit_id: businessUnitId,
    text: result.output ?? "",
    created_by: user.id,
    output_file_path: result.generatedFile?.path ?? null,
    output_file_name: result.generatedFile?.name ?? null,
  });
  if (insertError) return { error: insertError.message };

  revalidatePath("/dashboard/reports");
  return {
    error: null,
    reportText: result.output,
    downloadUrl: result.generatedFile?.downloadUrl,
    fileName: result.generatedFile?.name,
  };
}
