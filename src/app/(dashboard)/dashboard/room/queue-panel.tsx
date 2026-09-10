"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { processQueueNow } from "@/lib/actions/queue";

export interface QueueItemRow {
  id: string;
  agent_id: string;
  input: string;
  status: "queued" | "processing" | "done" | "failed";
  error: string | null;
  created_at: string;
  agents: { name: string } | null;
}

const STATUS_LABELS: Record<QueueItemRow["status"], string> = {
  queued: "Đang chờ",
  processing: "Đang chạy",
  done: "Xong",
  failed: "Lỗi",
};

const STATUS_STYLE: Record<QueueItemRow["status"], string> = {
  queued: "bg-slate-800 text-slate-400",
  processing: "animate-pulse bg-cyan-950/60 text-cyan-300",
  done: "bg-emerald-950/60 text-emerald-300",
  failed: "bg-red-950/60 text-red-300",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
}

export function QueuePanel({
  agents,
  initialItems,
}: {
  agents: { id: string; name: string }[];
  initialItems: QueueItemRow[];
}) {
  const [items, setItems] = useState<QueueItemRow[]>(initialItems);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agentIds = useMemo(() => new Set(agents.map((a) => a.id)), [agents]);
  const agentNameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel("room-task-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_queue" }, (payload) => {
        const row = (payload.new ?? payload.old) as QueueItemRow | undefined;
        if (!row || !agentIds.has(row.agent_id)) return;
        setItems((prev) => {
          const withoutOld = prev.filter((i) => i.id !== row.id);
          if (payload.eventType === "DELETE") return withoutOld;
          const merged: QueueItemRow = { ...row, agents: { name: agentNameById.get(row.agent_id) ?? "?" } };
          return [merged, ...withoutOld].slice(0, 20);
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [agentIds, agentNameById]);

  async function handleProcessNow() {
    setProcessing(true);
    setError(null);
    const result = await processQueueNow();
    if (result.error) setError(result.error);
    setProcessing(false);
  }

  const hasQueued = items.some((i) => i.status === "queued");

  return (
    <div className="hud-panel rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="hud-eyebrow text-[0.65rem]">Hàng đợi việc chạy nền (24/7)</p>
        <button
          type="button"
          onClick={handleProcessNow}
          disabled={processing || !hasQueued}
          className="rounded-md border border-cyan-800 px-2.5 py-1 text-[0.7rem] font-semibold text-cyan-300 transition hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing ? "Đang xử lý..." : "Xử lý hàng đợi ngay"}
        </button>
      </div>
      <p className="mt-1 text-[0.7rem] text-slate-500">
        Việc xếp vào đây (nút &quot;Xếp hàng đợi&quot; khi giao việc) tự chạy theo lịch (mỗi ~15
        phút, hoặc 1 lần/ngày nếu dùng Vercel bản miễn phí) — không cần mở máy, kết quả báo qua
        Telegram. Bấm nút trên để chạy thử ngay không cần chờ.
      </p>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      <div className="mt-2 flex flex-col gap-1.5">
        {items.length === 0 && <p className="text-xs text-slate-500">Hàng đợi trống.</p>}
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-cyan-300">{item.agents?.name ?? agentNameById.get(item.agent_id) ?? "?"}</span>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] ${STATUS_STYLE[item.status]}`}>
                  {STATUS_LABELS[item.status]}
                </span>
                <span className="text-[0.6rem] text-slate-600">{formatTime(item.created_at)}</span>
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-slate-400">{item.input}</p>
            {item.error && <p className="mt-1 text-red-400">{item.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
