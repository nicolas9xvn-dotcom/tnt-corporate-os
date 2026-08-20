import { isSupabaseConfigured } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">
            TNT AI Corporate OS
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-100">Đăng nhập</h1>
        </div>

        {isSupabaseConfigured ? (
          <LoginForm />
        ) : (
          <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-3 text-sm text-amber-300">
            <p className="font-semibold">TODO: chưa kết nối Supabase</p>
            <p className="mt-1 text-amber-300/80">
              Thiếu <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> và{" "}
              <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> trong{" "}
              <code className="rounded bg-black/30 px-1">.env.local</code>. Đăng nhập sẽ hoạt động
              sau khi điền hai biến này (xem README).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
