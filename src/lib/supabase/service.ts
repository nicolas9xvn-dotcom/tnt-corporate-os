import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Service-role client — bypasses Row Level Security entirely. ONLY for
// trusted server-only contexts with no logged-in user to scope by, such as
// the Vercel Cron route that refreshes Google Maps ratings on a schedule
// (src/app/api/cron/sync-competitors/route.ts). Never import this from a
// path that handles a browser request or user input, and never from client
// code — the key can read/write every row in every table.
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
