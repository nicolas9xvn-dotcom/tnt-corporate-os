import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { signOut } from "@/lib/actions/auth";
import type { AppUser } from "@/lib/types";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let currentUser: AppUser | null = null;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        redirect("/login");
      }

      const { data: profile } = await supabase
        .from("users")
        .select("id, email, role, business_unit_id, created_at")
        .eq("id", user.id)
        .maybeSingle();

      currentUser = profile;
    }
  }

  return (
    <div className="min-h-screen text-slate-100">
      <header className="hud-panel mx-3 mt-3 flex items-center justify-between rounded-lg px-6 py-4 sm:mx-6 sm:mt-6">
        <div>
          <p className="hud-eyebrow text-xs">TNT AI Corporate OS</p>
          <h1 className="hud-title text-lg font-bold text-white">CEO Command Center</h1>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {currentUser && (
            <span className="hidden text-slate-400 sm:inline">
              {currentUser.email}{" "}
              <span className="rounded-full border border-cyan-800/60 bg-cyan-950/50 px-2 py-0.5 text-xs font-medium uppercase text-cyan-300">
                {currentUser.role}
              </span>
            </span>
          )}
          {isSupabaseConfigured && (
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-cyan-700 hover:text-cyan-300"
              >
                Đăng xuất
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
