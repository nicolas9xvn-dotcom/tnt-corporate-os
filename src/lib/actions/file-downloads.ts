import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENTS_BUCKET } from "@/lib/attachments";

// Generic so this also accepts a service-role client (see agent-runner.ts).
type Supabase = SupabaseClient;

// The "task-attachments" Storage bucket (migration 0008) is private —
// output_file_path/output_image_path only ever store the object path, so
// both a fresh "Giao việc" result and later task-history browsing need a
// signed URL generated server-side (from the caller's own authenticated
// session, so Storage RLS still applies) each time they want to offer a
// download link. 1 hour is plenty for "download this now" or "browse
// history now" — nothing depends on the link staying valid longer.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function createFileDownloadUrl(supabase: Supabase, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
