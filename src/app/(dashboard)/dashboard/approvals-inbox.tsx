"use client";

import { useState } from "react";
import { approveTask, rejectTask } from "@/lib/actions/approvals";

export interface PendingTask {
  id: string;
  agentName: string;
  input: string;
  createdAt: string;
  canDecide: boolean;
}

function PendingTaskRow({ task }: { task: PendingTask }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handle(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    const result = action === "approve" ? await approveTask(task.id) : await rejectTask(task.id);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) return null;

  return (
    <li className="rounded-md border border-violet-800/50 bg-violet-950/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-100">{task.agentName}</span>
        <span className="text-[0.65rem] text-slate-500">
          {new Date(task.createdAt).toLocaleString("vi-VN")}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-300">{task.input}</p>

      {task.canDecide ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => handle("approve")}
            disabled={busy !== null}
            className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "approve" ? "Đang chạy..." : "Duyệt"}
          </button>
          <button
            type="button"
            onClick={() => handle("reject")}
            disabled={busy !== null}
            className="rounded-md border border-red-800 px-3 py-1 text-xs font-semibold text-red-300 transition hover:border-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "reject" ? "..." : "Từ chối"}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[0.7rem] italic text-slate-600">
          Bạn không có quyền duyệt task này.
        </p>
      )}

      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </li>
  );
}

export function ApprovalsInbox({ tasks }: { tasks: PendingTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <section className="hud-panel rounded-lg p-5">
      <p className="hud-eyebrow text-xs">Chờ duyệt</p>
      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <PendingTaskRow key={task.id} task={task} />
        ))}
      </ul>
    </section>
  );
}
