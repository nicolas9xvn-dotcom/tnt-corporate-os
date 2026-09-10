"use client";

import { useState } from "react";
import { updateContentCalendarStatus } from "@/lib/actions/content-calendar";

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  scheduled: "Đã lên lịch",
  posted: "Đã đăng",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-800 text-slate-400",
  scheduled: "bg-amber-950/60 text-amber-300",
  posted: "bg-emerald-950/60 text-emerald-300",
};

const NEXT_STATUS: Record<string, string> = {
  draft: "scheduled",
  scheduled: "posted",
  posted: "draft",
};

export function StatusButton({ id, status }: { id: string; status: string }) {
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const next = NEXT_STATUS[current] ?? "draft";
    setPending(true);
    const result = await updateContentCalendarStatus(id, next);
    if (!result.error) setCurrent(next);
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Bấm để chuyển trạng thái tiếp theo"
      className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium transition hover:opacity-80 ${STATUS_STYLE[current] ?? STATUS_STYLE.draft}`}
    >
      {STATUS_LABELS[current] ?? current}
    </button>
  );
}
