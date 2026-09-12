import { siteUrl } from "@/lib/site-url";
import { graphGet, GRAPH_BASE, FACEBOOK_DIALOG_BASE } from "./graph-api";
import type { PublishResult } from "./types";

// Meta's own "Login for Business" flow — one dialog grants both Page and
// linked Instagram Business account permissions, since publishing to
// Instagram is only possible through a Page that has one connected.
export const FACEBOOK_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
].join(",");

function facebookRedirectUri(): string {
  return `${siteUrl}/api/social/callback/facebook`;
}

export function facebookOAuthUrl(state: string): string {
  // .trim() guards against a trailing newline/space picked up when pasting
  // into Netlify's env var UI — same class of bug as the TikTok client key
  // and, earlier this project, the Google Drive folder ID.
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  if (!appId) throw new Error("FACEBOOK_APP_ID chưa được cấu hình.");
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: facebookRedirectUri(),
    state,
    scope: FACEBOOK_OAUTH_SCOPES,
    response_type: "code",
  });
  return `${FACEBOOK_DIALOG_BASE}/dialog/oauth?${params.toString()}`;
}

export async function exchangeFacebookCode(code: string): Promise<{ accessToken: string }> {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("FACEBOOK_APP_ID/FACEBOOK_APP_SECRET chưa được cấu hình.");

  const shortLived = await graphGet<{ access_token: string }>("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: facebookRedirectUri(),
    code,
  });

  // Long-lived user token (~60 days) — Page tokens minted from it don't
  // expire on their own afterwards as long as the user stays a Page admin,
  // per Meta's docs, so no refresh flow is needed for the Page/IG tokens
  // actually used for publishing.
  const longLived = await graphGet<{ access_token: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLived.access_token,
  });

  return { accessToken: longLived.access_token };
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

export async function listFacebookPages(userAccessToken: string): Promise<FacebookPage[]> {
  const res = await graphGet<{ data: FacebookPage[] }>("/me/accounts", {
    access_token: userAccessToken,
    fields: "id,name,access_token,instagram_business_account",
  });
  return res.data;
}

export async function getInstagramUsername(pageAccessToken: string, igUserId: string): Promise<string | null> {
  try {
    const res = await graphGet<{ username?: string }>(`/${igUserId}`, {
      access_token: pageAccessToken,
      fields: "username",
    });
    return res.username ?? null;
  } catch {
    return null;
  }
}

// Facebook Pages accept the raw image bytes directly (multipart upload) —
// unlike Instagram, no publicly-hosted URL is needed to post a photo.
export async function publishFacebookPhoto(
  pageId: string,
  pageAccessToken: string,
  imageBuffer: Buffer,
  caption: string
): Promise<PublishResult> {
  const form = new FormData();
  form.append("caption", caption);
  form.append("access_token", pageAccessToken);
  form.append("source", new Blob([new Uint8Array(imageBuffer)]), "photo.jpg");

  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Đăng Facebook thất bại (${res.status}).`);

  const postId = (json.post_id ?? json.id) as string;
  return { externalPostId: postId, permalink: `https://www.facebook.com/${postId}` };
}

export interface FacebookInsights {
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export async function fetchFacebookPostInsights(postId: string, pageAccessToken: string): Promise<FacebookInsights> {
  const res = await graphGet<{
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  }>(`/${postId}`, {
    access_token: pageAccessToken,
    fields: "likes.summary(true),comments.summary(true),shares",
  });
  return {
    likes: res.likes?.summary?.total_count ?? null,
    comments: res.comments?.summary?.total_count ?? null,
    shares: res.shares?.count ?? null,
  };
}
