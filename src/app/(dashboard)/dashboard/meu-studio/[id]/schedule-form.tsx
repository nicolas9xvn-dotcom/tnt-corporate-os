"use client";

import { useState, type FormEvent } from "react";
import { scheduleEpisode } from "@/lib/actions/meu-studio";

export function ScheduleForm({ episodeId }: { episodeId: string }) {
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await scheduleEpisode(episodeId, date);
    setPending(false);
    if (result.error) setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={pending || !date}
        className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang lưu..." : "Đưa vào Lịch Content"}
      </button>
      <p className="w-full text-xs text-slate-500">
        Tạo một mục TikTok (Nháp) trong Lịch Content của MỀU Studio. Đăng thật vẫn làm tay cho tới khi app TikTok được duyệt.
      </p>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </form>
  );
}
