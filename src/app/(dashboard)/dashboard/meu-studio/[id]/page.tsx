import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { QC_ITEMS, buildKeyframePrompt, buildVideoPrompt, referenceList } from "@/lib/meu-studio";
import { EpisodeForm } from "./episode-form";
import { ShotsPanel } from "./shots-panel";
import { CopyButton } from "./copy-button";
import { ReviewForm } from "./review-form";
import { ScheduleForm } from "./schedule-form";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function MeuEpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  const { data: episode } = await supabase
    .from("meu_episodes")
    .select(
      "id, business_unit_id, code, title, signature_state, status, synopsis, setting, sound, overlay_text, refs, content_calendar_id"
    )
    .eq("id", id)
    .maybeSingle();
  if (!episode) {
    return <p className="text-sm text-slate-400">Không tìm thấy tập này, hoặc tài khoản không có quyền xem.</p>;
  }

  const [shotsRes, reviewsRes, calendarRes] = await Promise.all([
    supabase.from("meu_shots").select("id, position, framing, action").eq("episode_id", id).order("position"),
    supabase
      .from("meu_clip_reviews")
      .select("id, clip_label, checks, passed, notes, created_at")
      .eq("episode_id", id)
      .order("created_at", { ascending: false }),
    episode.content_calendar_id
      ? supabase
          .from("content_calendar")
          .select("id, scheduled_date, status")
          .eq("id", episode.content_calendar_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const shots = shotsRes.data ?? [];
  const reviews = reviewsRes.data ?? [];
  const calendarItem = calendarRes.data;

  const refs: string[] = episode.refs ?? [];
  const keyframePrompt = buildKeyframePrompt(episode, shots[0]);
  const videoPrompt = buildVideoPrompt(episode, shots);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/meu-studio" className="text-xs text-slate-400 transition hover:text-cyan-300">
        ← Xưởng phim MỀU
      </Link>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Tập {episode.code}</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">{episode.title}</h2>
        <EpisodeForm
          episode={{
            id: episode.id,
            title: episode.title,
            signature_state: episode.signature_state,
            status: episode.status,
            synopsis: episode.synopsis ?? "",
            setting: episode.setting ?? "",
            sound: episode.sound ?? "",
            overlay_text: episode.overlay_text ?? "",
            refs,
          }}
        />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Phân cảnh ({shots.length} shot)</p>
        <p className="mt-1 text-xs text-slate-500">
          Mỗi shot chỉ 1 hành động chính. Không viết tai nạn (trượt, đổ, lem) làm kết quả — viết hành động chủ động hoặc chỉ cho
          thấy hậu quả. 10 giây nên có 2–3 shot.
        </p>
        <ShotsPanel episodeId={episode.id} shots={shots} />
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Prompt cho Dola</p>
        <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Gắn ảnh tham chiếu theo đúng thứ tự (cắt rời, không gắn bảng 7 pose):</p>
          <ul className="mt-1 list-inside list-disc">
            {referenceList(refs).map((r) => (
              <li key={r.key}>
                <span className="text-cyan-300">{r.tag}</span> {r.label}
              </li>
            ))}
          </ul>
          <p className="mt-1">Đổi ký hiệu [Ảnh n] thành đúng ký hiệu Dola hiển thị khi gắn ảnh.</p>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">Bước 1 — Ảnh khung đầu</p>
            <CopyButton text={keyframePrompt} />
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-black/40 p-3 text-xs text-slate-300">
            {keyframePrompt}
          </pre>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">Bước 2 — Video (dùng ảnh khung đầu đã duyệt)</p>
            <CopyButton text={videoPrompt} />
          </div>
          {shots.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Thêm ít nhất 1 shot để có prompt video.</p>
          ) : (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-slate-800 bg-black/40 p-3 text-xs text-slate-300">
              {videoPrompt}
            </pre>
          )}
        </div>

        {episode.overlay_text && (
          <p className="mt-4 text-xs text-slate-400">
            Chữ overlay (chèn trong CapCut, nhờ người Kansai kiểm tra):{" "}
            <span className="text-slate-100">{episode.overlay_text}</span>
          </p>
        )}
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Duyệt clip ({reviews.length})</p>
        <ReviewForm episodeId={episode.id} episodeCode={episode.code} />
        {reviews.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {reviews.map((review) => {
              const checks = (review.checks ?? {}) as Record<string, boolean>;
              const failed = QC_ITEMS.filter((item) => checks[item.key] !== true);
              return (
                <li key={review.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{review.clip_label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{formatDate(review.created_at)}</span>
                      <span
                        className={
                          review.passed
                            ? "rounded-full bg-emerald-950/60 px-2 py-0.5 text-[0.65rem] text-emerald-300"
                            : "rounded-full bg-red-950/60 px-2 py-0.5 text-[0.65rem] text-red-300"
                        }
                      >
                        {review.passed ? "Đạt" : "Loại"}
                      </span>
                    </span>
                  </div>
                  {failed.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">Chưa đạt: {failed.map((f) => f.label).join(" · ")}</p>
                  )}
                  {review.notes && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{review.notes}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Lên lịch đăng (TikTok MỀU)</p>
        {calendarItem ? (
          <p className="mt-2 text-sm text-slate-300">
            Đã có trong Lịch Content — ngày {new Date(calendarItem.scheduled_date).toLocaleDateString("vi-VN")}.{" "}
            <Link
              href={`/dashboard/content-calendar?bu=${episode.business_unit_id}`}
              className="text-cyan-300 hover:underline"
            >
              Mở Lịch Content
            </Link>
          </p>
        ) : (
          <ScheduleForm episodeId={episode.id} />
        )}
      </section>
    </div>
  );
}
