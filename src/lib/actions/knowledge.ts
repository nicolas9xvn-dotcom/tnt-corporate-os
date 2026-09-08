"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

export async function addKnowledgeEntry(
  businessUnitId: string,
  text: string,
  departmentId: string | null
): Promise<ActionResult> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Nội dung không được để trống." };

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { error } = await supabase
    .from("knowledge_entries")
    .insert({ business_unit_id: businessUnitId, department_id: departmentId, text: trimmed, created_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/knowledge");
  return { error: null };
}
