"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

export async function createBusinessUnit(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const name = String(formData.get("name") ?? "").trim();
  const ceoTitle = String(formData.get("ceo_title") ?? "").trim();
  const status = String(formData.get("status") ?? "coming_soon");

  if (!name) return { error: "Tên công ty con không được để trống." };

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (orgError) return { error: orgError.message };
  if (!organization) {
    return { error: "Chưa có dòng nào trong bảng organizations — tạo trước trong Supabase." };
  }

  const { error } = await supabase.from("business_units").insert({
    organization_id: organization.id,
    name,
    ceo_title: ceoTitle || null,
    status,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { error: null };
}

export async function createDepartment(
  businessUnitId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!name) return { error: "Tên phòng ban không được để trống." };

  const { error } = await supabase.from("departments").insert({
    business_unit_id: businessUnitId,
    name,
    code: code || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { error: null };
}

export async function createAgent(
  departmentId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const systemPrompt = String(formData.get("system_prompt") ?? "").trim();

  if (!name) return { error: "Tên agent không được để trống." };

  const { data: department, error: deptError } = await supabase
    .from("departments")
    .select("business_unit_id")
    .eq("id", departmentId)
    .single();

  if (deptError) return { error: deptError.message };

  const { error } = await supabase.from("agents").insert({
    business_unit_id: department.business_unit_id,
    department_id: departmentId,
    name,
    role: role || null,
    level: "specialist",
    system_prompt: systemPrompt || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { error: null };
}
