"use client";

import { useState, useTransition } from "react";
import { syncCompetitorGoogleRatings } from "@/lib/actions/sync-competitors";

export function SyncGoogleButton({ businessUnitId }: { businessUnitId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await syncCompetitorGoogleRatings(businessUnitId);
      if (result.error) {
        setError(result.error);
        return;
      }
      const results = result.results ?? [];
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      if (results.length === 0) {
        setMessage("Chưa có tiệm nào điền Google Place ID để đồng bộ.");
      } else {
        setMessage(`Đã đồng bộ ${ok}/${results.length} tiệm${failed > 0 ? ` (${failed} lỗi)` : ""}.`);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-cyan-800/60 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition hover:border-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang đồng bộ..." : "Đồng bộ Google Maps"}
      </button>
      {message && <p className="text-[0.7rem] text-emerald-400">{message}</p>}
      {error && <p className="text-[0.7rem] text-red-400">{error}</p>}
    </div>
  );
}
