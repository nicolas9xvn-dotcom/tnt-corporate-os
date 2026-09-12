import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { facebookOAuthUrl } from "@/lib/social/facebook";

// Kicks off Facebook Login for Business. The business unit id travels in
// `state` (Facebook echoes it back unchanged on the callback) since there
// is no server session tying the redirect to a specific business unit
// otherwise; a short-lived cookie holding the same value lets the
// callback confirm the request actually came from here, not a forged
// callback with a guessed/reused state.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const businessUnitId = url.searchParams.get("businessUnitId");
  if (!businessUnitId) {
    return NextResponse.json({ error: "Thiếu businessUnitId." }, { status: 400 });
  }

  try {
    const state = `${businessUnitId}:${randomUUID()}`;
    const response = NextResponse.redirect(facebookOAuthUrl(state));
    response.cookies.set("fb_oauth_state", state, { httpOnly: true, secure: true, maxAge: 600, path: "/" });
    return response;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lỗi cấu hình Facebook." }, { status: 500 });
  }
}
