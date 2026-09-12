"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface ActionResult {
  error: string | null;
}

// Disconnecting goes through the service-role client — normal signed-in
// users have no RLS write access to social_accounts/social_account_tokens
// at all (see migration 0030) — but only after checking here that the
// caller is actually allowed to touch this business unit's row, mirroring
// the read-side RLS policy.
export async function disconnectSocialAccount(accountId: string): Promise<ActionResult> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bạn cần đăng nhập." };

  const { data: viewer } = await supabase.from("users").select("role, business_unit_id").eq("id", user.id).maybeSingle();
  if (!viewer) return { error: "Không tìm thấy hồ sơ người dùng." };

  const { data: account } = await supabase.from("social_accounts").select("id, business_unit_id").eq("id", accountId).maybeSingle();
  if (!account) return { error: "Không tìm thấy kết nối." };

  const allowed = viewer.role === "chairman" || viewer.business_unit_id === account.business_unit_id;
  if (!allowed) return { error: "Bạn không có quyền gỡ kết nối này." };

  const service = createServiceClient();
  if (!service) return { error: "Supabase service role chưa được cấu hình." };

  const { error } = await service.from("social_accounts").delete().eq("id", accountId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/social-accounts");
  return { error: null };
}
