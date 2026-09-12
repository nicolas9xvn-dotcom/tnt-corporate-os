import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchFacebookPostInsights } from "@/lib/social/facebook";
import { fetchInstagramPostInsights } from "@/lib/social/instagram";
import { fetchTiktokPublishStatus } from "@/lib/social/tiktok";

// Keeps engagement numbers on already-published content_calendar rows
// fresh, and — for TikTok specifically — resolves the real post id once
// TikTok finishes processing an async publish (see publishTiktokPhoto /
// publishTiktokVideo, which only return a `publish_id` at post time).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase service role chưa được cấu hình." }, { status: 500 });

  const { data: items } = await supabase
    .from("content_calendar")
    .select("id, platform, social_account_id, external_post_id")
    .eq("status", "posted")
    .not("external_post_id", "is", null)
    .not("social_account_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  let updated = 0;
  let errors = 0;

  for (const item of items ?? []) {
    try {
      const { data: tokenRow } = await supabase
        .from("social_account_tokens")
        .select("access_token")
        .eq("social_account_id", item.social_account_id as string)
        .maybeSingle();
      if (!tokenRow) continue;

      if (item.platform === "facebook") {
        const insights = await fetchFacebookPostInsights(item.external_post_id as string, tokenRow.access_token);
        await supabase
          .from("content_calendar")
          .update({
            likes_count: insights.likes,
            comments_count: insights.comments,
            shares_count: insights.shares,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        updated += 1;
      } else if (item.platform === "instagram") {
        const insights = await fetchInstagramPostInsights(item.external_post_id as string, tokenRow.access_token);
        await supabase
          .from("content_calendar")
          .update({
            likes_count: insights.likes,
            comments_count: insights.comments,
            views_count: insights.views,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        updated += 1;
      } else if (item.platform === "tiktok") {
        const status = await fetchTiktokPublishStatus(tokenRow.access_token, item.external_post_id as string);
        await supabase
          .from("content_calendar")
          .update({
            permalink: status.publiclyAvailablePostId
              ? `https://www.tiktok.com/@i/video/${status.publiclyAvailablePostId}`
              : null,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        updated += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return NextResponse.json({ ok: true, updated, errors });
}
