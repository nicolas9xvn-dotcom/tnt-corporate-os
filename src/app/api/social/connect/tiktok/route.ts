import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { generateTiktokPkce, tiktokOAuthUrl } from "@/lib/social/tiktok";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const businessUnitId = url.searchParams.get("businessUnitId");
  if (!businessUnitId) {
    return NextResponse.json({ error: "Thiếu businessUnitId." }, { status: 400 });
  }

  try {
    const state = `${businessUnitId}:${randomUUID()}`;
    const { verifier, challenge } = generateTiktokPkce();
    const response = NextResponse.redirect(tiktokOAuthUrl(state, challenge));
    response.cookies.set("tiktok_oauth_state", state, { httpOnly: true, secure: true, maxAge: 600, path: "/" });
    response.cookies.set("tiktok_oauth_verifier", verifier, { httpOnly: true, secure: true, maxAge: 600, path: "/" });
    return response;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lỗi cấu hình TikTok." }, { status: 500 });
  }
}
