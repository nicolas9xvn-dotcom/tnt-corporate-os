"use client";

import { useState, useTransition } from "react";
import { updateCompetitorFields, upsertCompetitorPlatform } from "@/lib/actions/competitors";

export interface PlatformStat {
  id: string;
  platform: string;
  rating: number | null;
  review_count: number | null;
  summary_vi: string | null;
  detail_vi: string | null;
  url: string | null;
  source: string;
  synced_at: string | null;
}

export interface CompetitorRowData {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  is_ame29: boolean;
  price_vi: string | null;
  google_place_id: string | null;
  competitor_platform_stats: PlatformStat[];
}

const ALL_PLATFORMS = ["gmaps", "hotpepper", "instagram", "tiktok", "minimo", "naily"];
const PLATFORM_LABELS: Record<string, string> = {
  gmaps: "Google Maps",
  hotpepper: "Hotpepper",
  instagram: "Instagram",
  tiktok: "TikTok",
  minimo: "Minimo",
  naily: "Naily",
};

interface PlatformDraft {
  summary: string;
  detail: string;
  url: string;
}

function CompetitorEditForm({ businessUnitId, competitor }: { businessUnitId: string; competitor: CompetitorRowData }) {
  const [price, setPrice] = useState(competitor.price_vi ?? "");
  const [placeId, setPlaceId] = useState(competitor.google_place_id ?? "");
  const [activePlatforms, setActivePlatforms] = useState<string[]>(
    competitor.competitor_platform_stats.map((p) => p.platform)
  );
  const [platformEdits, setPlatformEdits] = useState<Record<string, PlatformDraft>>(() => {
    const initial: Record<string, PlatformDraft> = {};
    for (const p of competitor.competitor_platform_stats) {
      initial[p.platform] = { summary: p.summary_vi ?? "", detail: p.detail_vi ?? "", url: p.url ?? "" };
    }
    return initial;
  });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function saveFields() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await updateCompetitorFields(businessUnitId, competitor.id, {
        price_vi: price,
        google_place_id: placeId,
      });
      if (result.error) setError(result.error);
      else setStatus("Đã lưu.");
    });
  }

  function savePlatform(platform: string) {
    setError(null);
    setStatus(null);
    const edit = platformEdits[platform] ?? { summary: "", detail: "", url: "" };
    startTransition(async () => {
      const result = await upsertCompetitorPlatform(businessUnitId, competitor.id, platform, {
        summary_vi: edit.summary,
        detail_vi: edit.detail,
        url: edit.url,
      });
      if (result.error) setError(result.error);
      else setStatus(`Đã lưu ${PLATFORM_LABELS[platform] ?? platform}.`);
    });
  }

  function addPlatform(platform: string) {
    setActivePlatforms((prev) => (prev.includes(platform) ? prev : [...prev, platform]));
    setPlatformEdits((prev) => (prev[platform] ? prev : { ...prev, [platform]: { summary: "", detail: "", url: "" } }));
  }

  const remainingPlatforms = ALL_PLATFORMS.filter((p) => !activePlatforms.includes(p));

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[0.7rem] text-slate-400">
          Giá
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.7rem] text-slate-400">
          Google Place ID (để tự động cập nhật rating mỗi ngày)
          <input
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            placeholder="ChIJ..."
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={saveFields}
        disabled={pending}
        className="self-start rounded-md bg-emerald-500 px-2.5 py-1 text-[0.7rem] font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Lưu giá / Place ID
      </button>

      {activePlatforms.map((platform) => (
        <div key={platform} className="rounded-md border border-slate-800/80 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[0.7rem] font-semibold text-slate-300">{PLATFORM_LABELS[platform] ?? platform}</p>
            {platform === "gmaps" && (
              <span className="text-[0.65rem] text-slate-500">Rating/review có thể tự động — chỉ cần điền Place ID ở trên</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <input
              value={platformEdits[platform]?.summary ?? ""}
              onChange={(e) =>
                setPlatformEdits((prev) => ({ ...prev, [platform]: { ...prev[platform], summary: e.target.value } }))
              }
              placeholder="Tóm tắt ngắn (VD: 4.8★ / 1.325 review)"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
            <textarea
              value={platformEdits[platform]?.detail ?? ""}
              onChange={(e) =>
                setPlatformEdits((prev) => ({ ...prev, [platform]: { ...prev[platform], detail: e.target.value } }))
              }
              rows={2}
              placeholder="Chi tiết / nhận xét"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
            <input
              value={platformEdits[platform]?.url ?? ""}
              onChange={(e) =>
                setPlatformEdits((prev) => ({ ...prev, [platform]: { ...prev[platform], url: e.target.value } }))
              }
              placeholder="Link (không bắt buộc)"
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => savePlatform(platform)}
              disabled={pending}
              className="self-start rounded-md border border-emerald-800/60 px-2.5 py-1 text-[0.7rem] font-semibold text-emerald-400 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Lưu {PLATFORM_LABELS[platform] ?? platform}
            </button>
          </div>
        </div>
      ))}

      {remainingPlatforms.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) {
              addPlatform(e.target.value);
              e.target.value = "";
            }
          }}
          defaultValue=""
          className="w-fit rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"
        >
          <option value="">+ Thêm nền tảng...</option>
          {remainingPlatforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      )}

      {status && <p className="text-[0.7rem] text-emerald-400">{status}</p>}
      {error && <p className="text-[0.7rem] text-red-400">{error}</p>}
    </div>
  );
}

export function CompetitorGroupTable({
  title,
  businessUnitId,
  competitors,
  editable,
}: {
  title: string;
  businessUnitId: string;
  competitors: CompetitorRowData[];
  editable: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="hud-panel rounded-lg p-6">
      <p className="hud-eyebrow text-xs">
        {title} <span className="text-slate-500">({competitors.length})</span>
      </p>
      <div className="mt-3 flex flex-col divide-y divide-slate-800/60">
        {competitors.map((c) => {
          const gmaps = c.competitor_platform_stats.find((p) => p.platform === "gmaps");
          return (
            <div key={c.id} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {c.is_ame29 && (
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-400">
                      AME29
                    </span>
                  )}
                  <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  {c.city && <span className="text-xs text-slate-500">· {c.city}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {gmaps?.rating != null && (
                    <span>
                      {gmaps.rating}★{gmaps.review_count != null ? ` / ${gmaps.review_count}` : ""}
                    </span>
                  )}
                  {c.price_vi && <span className="text-slate-500">{c.price_vi}</span>}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => (prev === c.id ? null : c.id))}
                      className="rounded border border-slate-700 px-2 py-0.5 text-[0.7rem] text-slate-300 hover:border-cyan-700 hover:text-cyan-300"
                    >
                      {expanded === c.id ? "Đóng" : "Sửa"}
                    </button>
                  )}
                </div>
              </div>
              {expanded === c.id && <CompetitorEditForm businessUnitId={businessUnitId} competitor={c} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
