import { graphGet, graphPost } from "./graph-api";
import type { PublishResult } from "./types";

// Instagram's Content Publishing API can only fetch an image from a
// publicly reachable URL (no raw byte upload for photos, unlike Facebook
// Pages) — the caller is expected to have already uploaded the image
// somewhere public (see uploadTempPublicFile in temp-storage.ts) and pass
// that URL in.
export async function publishInstagramPhoto(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string
): Promise<PublishResult> {
  const container = await graphPost<{ id: string }>(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: pageAccessToken,
  });

  const published = await graphPost<{ id: string }>(`/${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: pageAccessToken,
  });

  const permalink = await fetchInstagramPermalink(published.id, pageAccessToken);
  return { externalPostId: published.id, permalink };
}

async function fetchInstagramPermalink(mediaId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const res = await graphGet<{ permalink?: string }>(`/${mediaId}`, {
      access_token: pageAccessToken,
      fields: "permalink",
    });
    return res.permalink ?? null;
  } catch {
    return null;
  }
}

export interface InstagramInsights {
  likes: number | null;
  comments: number | null;
  views: number | null;
}

export async function fetchInstagramPostInsights(mediaId: string, pageAccessToken: string): Promise<InstagramInsights> {
  const res = await graphGet<{ like_count?: number; comments_count?: number }>(`/${mediaId}`, {
    access_token: pageAccessToken,
    fields: "like_count,comments_count",
  });

  // Reach/impressions ("views") come from a separate /insights edge and
  // only work once the account has enough history/followers — best
  // effort, never let a missing metric fail the whole sync.
  let views: number | null = null;
  try {
    const insights = await graphGet<{ data: { values: { value: number }[] }[] }>(`/${mediaId}/insights`, {
      access_token: pageAccessToken,
      metric: "impressions",
    });
    views = insights.data?.[0]?.values?.[0]?.value ?? null;
  } catch {
    views = null;
  }

  return { likes: res.like_count ?? null, comments: res.comments_count ?? null, views };
}
