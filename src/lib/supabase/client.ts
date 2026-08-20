"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

// Browser-side Supabase client, for use inside Client Components.
// Throws only when actually called with missing env vars, so pages that
// merely import this module can still render a "not configured" banner.
export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase chưa được cấu hình: thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local"
    );
  }
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}
