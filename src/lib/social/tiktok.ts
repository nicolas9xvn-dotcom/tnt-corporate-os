import { randomBytes, createHash } from "crypto";
import { siteUrl } from "@/lib/site-url";
import type { PublishResult } from "./types";

// TikTok's own domain for the login dialog, separate from the API domain.
const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";

// Only what the code actually uses (user info + direct-post publishing) —
// requesting a scope the TikTok app doesn't have enabled makes the OAuth
// call itself fail with invalid_scope, so this must stay in sync with
// whatever's actually turned on under the app's Scopes tab.
export const TIKTOK_OAUTH_SCOPES = "user.info.basic,video.publish";

// While the app is unaudited by TikTok, Content Posting API posts are
// forced private (SELF_ONLY) regardless of what's requested here — this
// only takes effect for real once TikTok approves the app for
// `video.publish` in production. Override via env once that happens.
const PRIVACY_LEVEL = process.env.TIKTOK_PRIVACY_LEVEL ?? "SELF_ONLY";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// TikTok's OAuth requires PKCE (Facebook's does not) — verifier is a
// random string kept server-side (short-lived cookie), challenge is its
// SHA-256 hash sent in the auth URL.
export function generateTiktokPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function tiktokRedirectUri(): string {
  return `${siteUrl}/api/social/callback/tiktok`;
}

export function tiktokOAuthUrl(state: string, codeChallenge: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY chưa được cấu hình.");
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_OAUTH_SCOPES,
    response_type: "code",
    redirect_uri: tiktokRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export async function exchangeTiktokCode(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; openId: string; expiresIn: number }> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error("TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET chưa được cấu hình.");

  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: tiktokRedirectUri(),
      code_verifier: codeVerifier,
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error_description ?? json?.error ?? `TikTok token exchange lỗi (${res.status}).`);
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, openId: json.open_id, expiresIn: json.expires_in };
}

export async function fetchTiktokDisplayName(accessToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}/user/info/?fields=display_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== "ok") {
    throw new Error(json?.error?.message ?? "Không lấy được thông tin tài khoản TikTok.");
  }
  return json.data?.user?.display_name ?? "TikTok";
}

async function postContent<T>(path: string, body: Record<string, unknown>, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || (json.error && json.error.code !== "ok")) {
    throw new Error(json?.error?.message ?? `TikTok API lỗi (${res.status}).`);
  }
  return json as T;
}

// Publishing sends the raw bytes straight to TikTok ("FILE_UPLOAD") rather
// than "PULL_FROM_URL" (TikTok fetching from a public URL we host) —
// PULL_FROM_URL requires verifying the hosting domain via a DNS TXT
// record, which isn't possible for a free `*.netlify.app` subdomain (DNS
// for that zone belongs to Netlify, not this app). FILE_UPLOAD needs no
// domain verification: init returns an `upload_url`, then the file bytes
// are PUT directly to it. Both calls return only a `publish_id`
// immediately; the real post only exists once TikTok finishes processing
// it asynchronously (see fetchTiktokPublishStatus, called from the
// metrics-sync cron).
async function putTiktokFile(uploadUrl: string, buffer: Buffer, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Range": `bytes 0-${buffer.length - 1}/${buffer.length}` },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`Tải file lên TikTok thất bại (${res.status}).`);
}

// Photo FILE_UPLOAD's exact init shape is the least-documented corner of
// this API (TikTok added photo posting after video, and the sandbox here
// can't reach TikTok to verify it live) — same "unverified, fix from the
// real error message" situation as the Gemini/DeepSeek/Grok model names
// elsewhere in this project.
export async function publishTiktokPhoto(accessToken: string, imageBuffer: Buffer, caption: string): Promise<PublishResult> {
  const res = await postContent<{ data: { publish_id: string; upload_url: string } }>(
    "/post/publish/content/init/",
    {
      post_info: { title: caption, privacy_level: PRIVACY_LEVEL, disable_comment: false },
      source_info: { source: "FILE_UPLOAD", photo_cover_index: 0 },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    },
    accessToken
  );
  await putTiktokFile(res.data.upload_url, imageBuffer, "image/jpeg");
  return { externalPostId: res.data.publish_id, permalink: null };
}

export async function publishTiktokVideo(accessToken: string, videoBuffer: Buffer, caption: string): Promise<PublishResult> {
  const res = await postContent<{ data: { publish_id: string; upload_url: string } }>(
    "/post/publish/video/init/",
    {
      post_info: { title: caption, privacy_level: PRIVACY_LEVEL, disable_comment: false },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoBuffer.length,
        chunk_size: videoBuffer.length,
        total_chunk_count: 1,
      },
    },
    accessToken
  );
  await putTiktokFile(res.data.upload_url, videoBuffer, "video/mp4");
  return { externalPostId: res.data.publish_id, permalink: null };
}

export interface TiktokPublishStatus {
  status: string; // "PROCESSING_DOWNLOAD" | "PROCESSING_UPLOAD" | "PUBLISH_COMPLETE" | "FAILED" | ...
  publiclyAvailablePostId: string | null;
}

export async function fetchTiktokPublishStatus(accessToken: string, publishId: string): Promise<TiktokPublishStatus> {
  const res = await postContent<{ data: { status: string; publicly_available_post_id?: string[] } }>(
    "/post/publish/status/fetch/",
    { publish_id: publishId },
    accessToken
  );
  return { status: res.data.status, publiclyAvailablePostId: res.data.publicly_available_post_id?.[0] ?? null };
}
