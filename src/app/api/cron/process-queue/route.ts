import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { drainQueue } from "@/lib/queue-runner";

// Vercel Cron hits this on a schedule (see vercel.json) to drain
// task_queue — the "giao việc chạy nền 24h" path (see enqueueTask in
// actions/queue.ts): a founder can hand an agent work without waiting for
// it in the browser, and it runs here instead, with the result pushed to
// Telegram. Same Authorization check as sync-competitors/route.ts.
//
// Note: Vercel Hobby-plan cron jobs are limited to once a day — for more
// frequent draining either upgrade to Pro (down to once a minute) or use
// the "Xử lý hàng đợi ngay" button in Phòng họp, which drains with the
// caller's own session instead of waiting for this route.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET chưa được cấu hình." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role chưa được cấu hình." }, { status: 500 });
  }

  // Bounded per invocation (not "drain everything") so one cron tick can't
  // run past Vercel's function time limit if many items pile up — the next
  // scheduled tick picks up whatever's left.
  const result = await drainQueue(supabase, 5);
  return NextResponse.json({ ok: true, ...result });
}
