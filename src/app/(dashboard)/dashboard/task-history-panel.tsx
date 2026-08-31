"use client";

import { useState } from "react";
import { getAgentTaskHistory, type TaskHistoryItem } from "@/lib/actions/task-history";

const STATUS_LABELS: Record<string, string> = {
  done: "Xong",
  failed: "Lỗi",
  rejected: "Bị từ chối",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export function TaskHistoryPanel({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TaskHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      const result = await getAgentTaskHistory(agentId);
      setItems(result.items);
      setError(result.error);
      setLoaded(true);
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button type="button" onClick={handleToggle} className="flex w-full items-center justify-between text-left">
        <p className="hud-eyebrow text-[0.65rem]">Lịch sử giao việc</p>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {!open && (
        <p className="mt-1 text-[0.7rem] text-slate-500">
          Xem lại tối đa {30} lần giao việc gần nhất — kể cả sau khi bạn tắt màn hình hay đóng
          trình duyệt, kết quả cũ vẫn còn ở đây.
        </p>
      )}

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {loading && <p className="text-xs text-slate-500">Đang tải...</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-xs text-slate-500">Chưa có lịch sử nào.</p>
          )}
          {items.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 text-slate-500">
                <span>{formatTime(item.createdAt)}</span>
                {item.status !== "done" && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                      item.status === "failed" ? "bg-red-950/60 text-red-300" : "bg-amber-950/60 text-amber-300"
                    }`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-slate-300">{item.input}</p>
              {item.output && (
                <p className="mt-1.5 whitespace-pre-line border-t border-slate-800/80 pt-1.5 text-slate-400">{item.output}</p>
              )}
              {item.imageDownloadUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not an optimizable static asset
                <img src={item.imageDownloadUrl} alt="Ảnh đã tạo" className="mt-1.5 max-w-full rounded-md border border-cyan-900/40" />
              )}
              {item.fileDownloadUrl && (
                <a
                  href={item.fileDownloadUrl}
                  download={item.fileName}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-cyan-900/40 px-2 py-1 text-[0.7rem] text-cyan-300 hover:border-cyan-600"
                >
                  ⬇ {item.fileName}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
