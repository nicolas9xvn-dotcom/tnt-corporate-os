import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { EPISODE_STATUSES, MEU_BUSINESS_UNIT_NAME, QC_ITEMS, SIGNATURE_STATES } from "@/lib/meu-studio";
import { CreateEpisodeForm } from "./create-episode-form";

const STATUS_STYLE: Record<string, string> = {
  idea: "bg-slate-800 text-slate-400",
  script: "bg-sky-950/60 text-sky-300",
  keyframe: "bg-violet-950/60 text-violet-300",
  video: "bg-pink-950/60 text-pink-300",
  edit: "bg-amber-950/60 text-amber-300",
  posted: "bg-emerald-950/60 text-emerald-300",
};

export default async function MeuStudioPage() {
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  // RLS only returns this row to the chairman or to members of MỀU Studio.
  const { data: unit } = await supabase
    .from("business_units")
    .select("id, name")
    .eq("name", MEU_BUSINESS_UNIT_NAME)
    .maybeSingle();
  if (!unit) {
    return (
      <p className="text-sm text-amber-300">
        Không thấy công ty con &quot;{MEU_BUSINESS_UNIT_NAME}&quot; — chạy migration{" "}
        <code className="rounded bg-black/30 px-1">0031_meu_studio_business_unit.sql</code> trước, hoặc tài khoản
        này không có quyền vào MỀU Studio.
      </p>
    );
  }

  const { data: episodes, error } = await supabase
    .from("meu_episodes")
    .select("id, code, title, signature_state, status, content_calendar_id, updated_at")
    .eq("business_unit_id", unit.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <p className="text-sm text-amber-300">
        Chưa có bảng MỀU Studio — chạy migration <code className="rounded bg-black/30 px-1">0032_meu_studio.sql</code>{" "}
        trên Supabase. ({error.message})
      </p>
    );
  }

  const rows = episodes ?? [];
  const stateLabel = (value: string) => SIGNATURE_STATES.find((s) => s.value === value)?.label ?? value;
  const statusLabel = (value: string) => EPISODE_STATUSES.find((s) => s.value === value)?.label ?? value;

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">MỀU Studio</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Xưởng phim MỀU</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Mỗi tập: viết phân cảnh → copy prompt ảnh khung đầu và prompt video sang Dola → chấm clip theo bảng
          kiểm Canon → đưa vào Lịch Content của MỀU. Quy tắc lấy từ MỀU Canon v1.1{" "}
          (<code className="rounded bg-black/30 px-1">docs/meu-studio/</code>).
        </p>
        <CreateEpisodeForm businessUnitId={unit.id} />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Các tập ({rows.length})</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có tập nào.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((episode) => (
              <li key={episode.id}>
                <Link
                  href={`/dashboard/meu-studio/${episode.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm transition hover:border-cyan-700"
                >
                  <span className="font-semibold text-slate-100">
                    <span className="mr-2 text-cyan-300">{episode.code}</span>
                    {episode.title}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{stateLabel(episode.signature_state)}</span>
                    {episode.content_calendar_id && <span className="text-xs text-emerald-400">Đã lên lịch</span>}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${STATUS_STYLE[episode.status] ?? STATUS_STYLE.idea}`}
                    >
                      {statusLabel(episode.status)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Nhắc nhanh Canon</p>
        <div className="mt-3 grid gap-4 text-sm text-slate-300 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-100">7 Signature States</p>
            <ul className="mt-1 list-inside list-disc text-slate-400">
              {SIGNATURE_STATES.map((s) => (
                <li key={s.value}>{s.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-100">Loại clip ngay nếu sai</p>
            <ul className="mt-1 list-inside list-disc text-slate-400">
              {QC_ITEMS.filter((q) => q.blocking).map((q) => (
                <li key={q.key}>{q.label}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
