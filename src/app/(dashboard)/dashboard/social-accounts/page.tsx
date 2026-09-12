import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DisconnectButton } from "./disconnect-button";

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Đã kết nối",
  expired: "Hết hạn — kết nối lại",
  error: "Lỗi — kết nối lại",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function SocialAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error: connectError } = await searchParams;

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  const { data: viewer } = await supabase.from("users").select("role, business_unit_id").eq("id", user.id).maybeSingle();
  if (!viewer) return <p className="text-sm text-slate-400">Không tìm thấy hồ sơ người dùng.</p>;

  const { data: businessUnits } = await supabase.from("business_units").select("id, name").order("name");
  const targetBusinessUnitId = viewer.business_unit_id ?? businessUnits?.[0]?.id ?? null;
  if (!targetBusinessUnitId) {
    return <p className="text-sm text-amber-300">Chưa có công ty con nào trong database.</p>;
  }

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, account_name, status, status_detail, connected_at")
    .eq("business_unit_id", targetBusinessUnitId)
    .order("platform");

  const rows = accounts ?? [];
  const connectedPlatforms = new Set(rows.map((r) => r.platform));

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Kết nối mạng xã hội</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Kênh Facebook / Instagram / TikTok</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Kết nối tài khoản thật để &quot;Đăng ngay&quot; trong Lịch Content đăng thẳng lên nền tảng, và
          tự động cập nhật lượt thích/bình luận/lượt xem sau khi đăng.
        </p>

        {connected && (
          <p className="mt-3 rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
            Đã kết nối {PLATFORM_LABELS[connected] ?? connected} thành công.
          </p>
        )}
        {connectError && (
          <p className="mt-3 rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">{connectError}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/api/social/connect/facebook?businessUnitId=${targetBusinessUnitId}`}
            className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            {connectedPlatforms.has("facebook") || connectedPlatforms.has("instagram")
              ? "Kết nối lại Facebook/Instagram"
              : "+ Kết nối Facebook/Instagram"}
          </a>
          <a
            href={`/api/social/connect/tiktok?businessUnitId=${targetBusinessUnitId}`}
            className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            {connectedPlatforms.has("tiktok") ? "Kết nối lại TikTok" : "+ Kết nối TikTok"}
          </a>
        </div>
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Tài khoản đã kết nối ({rows.length})</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa kết nối tài khoản nào.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((account) => (
              <li key={account.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-400">
                      {PLATFORM_LABELS[account.platform] ?? account.platform}
                    </span>
                    <span className="ml-2 font-semibold text-slate-100">{account.account_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        account.status === "connected"
                          ? "text-xs text-emerald-400"
                          : "text-xs text-amber-400"
                      }
                    >
                      {STATUS_LABELS[account.status] ?? account.status}
                    </span>
                    <DisconnectButton accountId={account.id} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">Kết nối lúc {formatDate(account.connected_at)}</p>
                {account.status_detail && <p className="mt-1 text-xs text-red-400">{account.status_detail}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
