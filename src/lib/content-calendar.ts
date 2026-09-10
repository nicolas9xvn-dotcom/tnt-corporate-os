import type { SupabaseClient } from "@supabase/supabase-js";

export interface ContentCalendarItem {
  title: string;
  platform: string;
  scheduledDate: string;
  status: string;
  notes: string | null;
}

// Read-only for agents (see get_content_calendar in agent-runner.ts) — the
// actual write path is the founder-facing /dashboard/content-calendar page
// (src/lib/actions/content-calendar.ts). Returns upcoming/recent items only
// (±30 days) so an agent isn't flooded with a year of old entries when all
// it needs is "what's already planned right now".
export async function getContentCalendarItems(supabase: SupabaseClient, businessUnitId: string): Promise<ContentCalendarItem[]> {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 30);

  const { data, error } = await supabase
    .from("content_calendar")
    .select("title, platform, scheduled_date, status, notes")
    .eq("business_unit_id", businessUnitId)
    .gte("scheduled_date", from.toISOString().slice(0, 10))
    .lte("scheduled_date", to.toISOString().slice(0, 10))
    .order("scheduled_date", { ascending: true });

  if (error) {
    throw new Error(`Không đọc được lịch content: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    title: row.title,
    platform: row.platform,
    scheduledDate: row.scheduled_date,
    status: row.status,
    notes: row.notes,
  }));
}
