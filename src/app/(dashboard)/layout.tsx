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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
            TNT AI Corporate OS
          </p>
          <h1 className="text-lg font-bold">CEO Command Center</h1>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {currentUser && (
            <span className="text-slate-400">
              {currentUser.email}{" "}
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium uppercase text-sky-300">
                {currentUser.role}
              </span>
            </span>
          )}
          {isSupabaseConfigured && (
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Đăng xuất
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
