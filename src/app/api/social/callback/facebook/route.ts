import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeFacebookCode, listFacebookPages, getInstagramUsername } from "@/lib/social/facebook";
import { siteUrl } from "@/lib/site-url";

const SETTINGS_URL = `${siteUrl}/dashboard/social-accounts`;

// One Facebook login can carry several Pages, and each Page can carry one
// linked Instagram Business account — so a single successful callback may
// create up to 2 social_accounts rows (facebook + instagram) per Page.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("fb_oauth_state")?.value;

  if (!code || !state || !cookieState || cookieState !== state) {
    return NextResponse.redirect(`${SETTINGS_URL}?error=${encodeURIComponent("Phiên xác thực Facebook không hợp lệ, thử lại.")}`);
  }
  const [businessUnitId] = state.split(":");

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.redirect(`${SETTINGS_URL}?error=${encodeURIComponent("Supabase service role chưa được cấu hình.")}`);
  }

  try {
    const { accessToken: userToken } = await exchangeFacebookCode(code);
    const pages = await listFacebookPages(userToken);
    if (pages.length === 0) {
      throw new Error("Tài khoản Facebook này không quản lý Page nào — cần là Admin của ít nhất 1 Page.");
    }

    for (const page of pages) {
      const { data: account, error } = await supabase
        .from("social_accounts")
        .upsert(
          {
            business_unit_id: businessUnitId,
            platform: "facebook",
            account_name: page.name,
            external_account_id: page.id,
            status: "connected",
            status_detail: null,
          },
          { onConflict: "business_unit_id,platform,external_account_id" }
        )
        .select("id")
        .single();
      if (error || !account) throw new Error(error?.message ?? "Không lưu được kết nối Facebook.");

      await supabase.from("social_account_tokens").upsert({
        social_account_id: account.id,
        access_token: page.access_token,
        refresh_token: null,
        expires_at: null,
      });

      if (page.instagram_business_account?.id) {
        const igUsername = await getInstagramUsername(page.access_token, page.instagram_business_account.id);
        const { data: igAccount, error: igError } = await supabase
          .from("social_accounts")
          .upsert(
            {
              business_unit_id: businessUnitId,
              platform: "instagram",
              account_name: igUsername ?? `Instagram (${page.name})`,
              external_account_id: page.instagram_business_account.id,
              status: "connected",
              status_detail: null,
            },
            { onConflict: "business_unit_id,platform,external_account_id" }
          )
          .select("id")
          .single();
        if (igError || !igAccount) throw new Error(igError?.message ?? "Không lưu được kết nối Instagram.");

        // Instagram publishing authenticates with the Page's access
        // token, not a separate IG-specific one.
        await supabase.from("social_account_tokens").upsert({
          social_account_id: igAccount.id,
          access_token: page.access_token,
          refresh_token: null,
          expires_at: null,
        });
      }
    }

    const response = NextResponse.redirect(`${SETTINGS_URL}?connected=facebook`);
    response.cookies.delete("fb_oauth_state");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kết nối Facebook thất bại.";
    return NextResponse.redirect(`${SETTINGS_URL}?error=${encodeURIComponent(message)}`);
  }
}
