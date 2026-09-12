import type { ReactNode } from "react";
import Link from "next/link";
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
      <header className="hud-panel mx-3 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-4 sm:mx-6 sm:mt-6 sm:px-6">
        <div>
          <p className="hud-eyebrow text-xs">TNT AI Corporate OS</p>
          <h1 className="hud-title text-lg font-bold text-white">CEO Command Center</h1>
        </div>

        {/* w-full on mobile so this drops to its own row under the title
            instead of squeezing/hiding the nav — the nav itself was
            previously "hidden sm:flex" (invisible on any phone-width
            screen, with no other way to reach it), which is why links like
            "Phòng họp" seemed to not exist at all when opened on a phone. */}
        <div className="flex w-full min-w-0 items-center gap-3 text-sm sm:w-auto">
          {currentUser && (
            <nav className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto sm:flex-none">
              {(currentUser.role === "chairman" || currentUser.role === "ceo") && (
                <Link
                  href="/dashboard/competitors"
                  className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300"
                >
                  Dữ liệu đối thủ
                </Link>
              )}
              <Link href="/dashboard/room" className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300">
                Phòng họp
              </Link>
              <Link
                href="/dashboard/knowledge"
                className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300"
              >
                Knowledge Base
              </Link>
              <Link href="/dashboard/reports" className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300">
                Báo cáo
              </Link>
              <Link
                href="/dashboard/content-calendar"
                className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300"
              >
                Lịch Content
              </Link>
              <Link
                href="/dashboard/content-os"
                className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300"
              >
                Content OS
              </Link>
              <Link
                href="/dashboard/social-accounts"
                className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300"
              >
                Kênh MXH
              </Link>
              {currentUser.role === "chairman" && (
                <Link
                  href="/dashboard/decisions"
                  className="shrink-0 whitespace-nowrap text-slate-400 transition hover:text-cyan-300"
                >
                  Quyết định HĐQT
                </Link>
              )}
            </nav>
          )}
          {currentUser && (
            <span className="hidden shrink-0 text-slate-400 sm:inline">
              {currentUser.email}{" "}
              <span className="rounded-full border border-cyan-800/60 bg-cyan-950/50 px-2 py-0.5 text-xs font-medium uppercase text-cyan-300">
                {currentUser.role}
              </span>
            </span>
          )}
          {isSupabaseConfigured && (
            <form action={signOut} className="shrink-0">
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
