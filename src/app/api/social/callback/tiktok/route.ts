import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeTiktokCode, fetchTiktokDisplayName } from "@/lib/social/tiktok";
import { siteUrl } from "@/lib/site-url";

const SETTINGS_URL = `${siteUrl}/dashboard/social-accounts`;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("tiktok_oauth_state")?.value;
  const cookieVerifier = request.cookies.get("tiktok_oauth_verifier")?.value;

  if (!code || !state || !cookieState || !cookieVerifier || cookieState !== state) {
    return NextResponse.redirect(`${SETTINGS_URL}?error=${encodeURIComponent("Phiên xác thực TikTok không hợp lệ, thử lại.")}`);
  }
  const [businessUnitId] = state.split(":");

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.redirect(`${SETTINGS_URL}?error=${encodeURIComponent("Supabase service role chưa được cấu hình.")}`);
  }

  try {
    const { accessToken, refreshToken, openId, expiresIn } = await exchangeTiktokCode(code, cookieVerifier);
    const displayName = await fetchTiktokDisplayName(accessToken);

    const { data: account, error } = await supabase
      .from("social_accounts")
      .upsert(
        {
          business_unit_id: businessUnitId,
          platform: "tiktok",
          account_name: displayName,
          external_account_id: openId,
          status: "connected",
          status_detail: null,
        },
        { onConflict: "business_unit_id,platform,external_account_id" }
      )
      .select("id")
      .single();
    if (error || !account) throw new Error(error?.message ?? "Không lưu được kết nối TikTok.");

    await supabase.from("social_account_tokens").upsert({
      social_account_id: account.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    });

    const response = NextResponse.redirect(`${SETTINGS_URL}?connected=tiktok`);
    response.cookies.delete("tiktok_oauth_state");
    response.cookies.delete("tiktok_oauth_verifier");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kết nối TikTok thất bại.";
    return NextResponse.redirect(`${SETTINGS_URL}?error=${encodeURIComponent(message)}`);
  }
}
