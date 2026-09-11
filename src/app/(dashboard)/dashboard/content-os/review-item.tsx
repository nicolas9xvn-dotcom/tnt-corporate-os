"use client";

import { useState } from "react";
import { resolveReviewItem } from "@/lib/actions/content-os";
import type { AssetCategory } from "@/lib/asset-classifier";

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  NAIL: "NAIL",
  PARTS_CHARM: "PARTS",
  SALON: "SALON",
  PROCESS: "PROCESS",
  PEOPLE: "PEOPLE",
  CUSTOMER: "CUSTOMER",
  BRAND_MOOD: "BRAND & MOOD",
};

export function ReviewItem({
  id,
  filename,
  fileType,
  driveFileId,
  reviewReason,
  confidence,
}: {
  id: string;
  filename: string;
  fileType: string;
  driveFileId: string;
  reviewReason: string | null;
  confidence: number | null;
}) {
  const [pending, setPending] = useState<AssetCategory | null>(null);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(category: AssetCategory) {
    setPending(category);
    setError(null);
    const result = await resolveReviewItem(id, category);
    if (result.error) setError(result.error);
    else setResolved(true);
    setPending(null);
  }

  if (resolved) return null;

  return (
    <div className="rounded-md border border-amber-800/40 bg-slate-950/60 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a
          href={`https://drive.google.com/file/d/${driveFileId}/view`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-cyan-300 underline"
        >
          {filename}
        </a>
        <span className="text-xs text-slate-500">
          {fileType === "video" ? "Video" : "Ảnh"}
          {confidence != null && ` · AI đoán ${confidence}%`}
        </span>
      </div>
      {reviewReason && <p className="mt-1 text-xs italic text-amber-300/80">{reviewReason}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(CATEGORY_LABELS) as AssetCategory[]).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => handlePick(category)}
            disabled={pending !== null}
            className="rounded-md border border-slate-700 px-2 py-1 text-[0.7rem] text-slate-300 transition hover:border-cyan-600 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending === category ? "..." : CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
